// src/core/purchases/purchases.service.ts — FORNECEDORES e PEDIDOS DE COMPRA.
// Receber = (1) entrada no motor de estoque com custo, (2) custo médio ponderado no produto,
// (3) título a PAGAR no financeiro pelo valor recebido, (4) status PARTIAL/RECEIVED.
import { FinanceEntryKind, PurchaseStatus, Prisma } from '@prisma/client';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction, type TenantTx } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { D, round2, sum } from '../../shared/money';
import * as stock from '../inventory/stock.service';
import * as finance from '../finance/finance.service';
import { defaultWarehouseId } from '../inventory/products.service';
import { events } from '../../shared/events';

// ── Fornecedores ──
export const listSuppliers = (q?: string) => ctx().db.supplier.findMany({ where: { isActive: true, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { name: 'asc' }, take: 200 });
export const createSupplier = (input: { name: string; document?: string; email?: string; phone?: string; notes?: string }) => ctx().db.supplier.create({ data: { ...input, tenantId: ctx().tenantId, document: input.document?.replace(/\D/g, '') || undefined } });
export const updateSupplier = (id: string, input: { name?: string; email?: string; phone?: string; notes?: string; isActive?: boolean }) => ctx().db.supplier.update({ where: { id }, data: input });

// ── Pedidos de compra ──
export interface PurchaseItemInput { variantId: string; quantity: number; unitCost: number }

async function nextNumber(tx: TenantTx, tenantId: string): Promise<number> {
  // Sequência própria das compras (separada dos pedidos de venda), serializada por advisory lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'po:' + tenantId}))`;
  const [{ max }] = await tx.$queryRaw<{ max: number | null }[]>`SELECT MAX(number)::int AS max FROM core_purchase_orders WHERE tenant_id = ${tenantId}::uuid`;
  return (max ?? 0) + 1;
}

const linhas = (items: PurchaseItemInput[]) => items.map((i) => {
  const quantity = D(i.quantity); const unitCost = D(i.unitCost);
  if (quantity.lte(0) || unitCost.lt(0)) throw AppError.validation('Quantidade/custo inválidos.');
  return { variantId: i.variantId, quantity, unitCost, total: round2(quantity.mul(unitCost)) };
});

export async function createPurchase(input: { supplierId: string; warehouseId?: string; expectedAt?: Date; notes?: string; freight?: number; items: PurchaseItemInput[] }) {
  const { db, tenantId } = ctx();
  if (!input.items.length) throw AppError.validation('Compra sem itens.');
  const its = linhas(input.items);
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId());
  return tenantTransaction(db, tenantId, async (tx) => {
    const number = await nextNumber(tx, tenantId);
    return tx.purchaseOrder.create({
      data: {
        tenantId, number, supplierId: input.supplierId, warehouseId, expectedAt: input.expectedAt, notes: input.notes, freight: round2(D(input.freight ?? 0)),
        total: round2(sum(its.map((i) => i.total)).plus(input.freight ?? 0)),
        items: { create: its },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
  });
}

export async function setItems(id: string, items: PurchaseItemInput[]) {
  const { db, tenantId } = ctx();
  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw AppError.notFound('Compra');
  if (po.status !== PurchaseStatus.DRAFT) throw AppError.conflict('Só rascunho aceita alteração de itens.');
  const its = linhas(items);
  return tenantTransaction(db, tenantId, async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrderItem.createMany({ data: its.map((i) => ({ ...i, tenantId, purchaseOrderId: id })) });
    return tx.purchaseOrder.update({ where: { id }, data: { total: round2(sum(its.map((i) => i.total)).plus(po.freight)) }, include: { items: true } });
  });
}

export async function markOrdered(id: string) {
  const po = await ctx().db.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw AppError.notFound('Compra');
  if (po.status !== PurchaseStatus.DRAFT) throw AppError.conflict('Compra já enviada.');
  if (!po.items.length) throw AppError.validation('Compra sem itens.');
  return ctx().db.purchaseOrder.update({ where: { id }, data: { status: PurchaseStatus.ORDERED, orderedAt: new Date() } });
}

/** Recebimento (total ou parcial). `items` ausente = recebe tudo o que falta. */
export async function receive(id: string, input: { items?: { itemId: string; quantity: number }[]; invoiceNumber?: string; dueDate?: Date }) {
  const { db, tenantId, userId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { variant: { include: { product: true } } } }, supplier: true } });
    if (!po) throw AppError.notFound('Compra');
    if (!([PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL] as PurchaseStatus[]).includes(po.status)) throw AppError.conflict(`Compra ${po.status} não recebe.`);

    const recebendo = po.items.map((it) => {
      const pedido = input.items?.find((x) => x.itemId === it.id);
      const falta = D(it.quantity).minus(it.receivedQty);
      const qty = input.items ? D(pedido?.quantity ?? 0) : falta;
      if (qty.gt(falta)) throw AppError.validation(`Item ${it.variant.sku}: recebendo ${qty}, faltam ${falta}.`);
      return { it, qty };
    }).filter((r) => r.qty.gt(0));
    if (!recebendo.length) throw AppError.validation('Nada a receber.');

    let valorRecebido = D(0);
    for (const { it, qty } of recebendo) {
      const g = { tenantId, variantId: it.variantId, warehouseId: po.warehouseId };
      const saldoAntes = await tx.stockBalance.findUnique({ where: { tenantId_variantId_warehouseId: { tenantId, variantId: it.variantId, warehouseId: po.warehouseId } } });
      await stock.receive(tx, g, qty, { refType: 'PURCHASE', refId: po.id, userId, unitCost: it.unitCost, idempotencyKey: `po:${po.id}:${it.id}:${D(it.receivedQty).toString()}`, note: `Compra #${po.number} ${po.supplier.name}` });
      // Custo médio ponderado do PRODUTO (o que a margem usa).
      const onHandAntes = D(saldoAntes?.onHand ?? 0); const custoAntes = D(it.variant.costOverride ?? it.variant.product.costPrice);
      const novoCusto = onHandAntes.plus(qty).isZero() ? D(it.unitCost) : onHandAntes.mul(custoAntes).plus(qty.mul(it.unitCost)).div(onHandAntes.plus(qty));
      await tx.product.update({ where: { id: it.variant.productId }, data: { costPrice: novoCusto.toDecimalPlaces(2) } });
      await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQty: D(it.receivedQty).plus(qty) } });
      valorRecebido = valorRecebido.plus(qty.mul(it.unitCost));
    }
    const completo = po.items.every((it) => { const r = recebendo.find((x) => x.it.id === it.id); return D(it.receivedQty).plus(r?.qty ?? 0).gte(it.quantity); });
    // Frete entra no último recebimento.
    const valorTitulo = round2(valorRecebido.plus(completo ? po.freight : 0));
    await finance.createEntry(tx, tenantId, { kind: FinanceEntryKind.PAYABLE, description: `Compra #${po.number} · ${po.supplier.name}${input.invoiceNumber ? ` · NF ${input.invoiceNumber}` : ''}`, amount: valorTitulo, dueDate: input.dueDate ?? new Date(Date.now() + 30 * 86_400_000), origin: 'PURCHASE', originId: po.id });
    const upd = await tx.purchaseOrder.update({ where: { id }, data: { status: completo ? PurchaseStatus.RECEIVED : PurchaseStatus.PARTIAL, receivedAt: completo ? new Date() : undefined, invoiceNumber: input.invoiceNumber ?? po.invoiceNumber }, include: { items: true } });
    if (completo) events.emit('purchase.received', { tenantId, purchaseOrderId: po.id, number: po.number, total: po.total.toString() });
    return { compra: upd, tituloGerado: valorTitulo };
  });
}

export async function cancel(id: string, reason: string) {
  const po = await ctx().db.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw AppError.notFound('Compra');
  if (po.status === PurchaseStatus.RECEIVED || po.status === PurchaseStatus.PARTIAL) throw AppError.conflict('Compra com recebimento não cancela; faça devolução ao fornecedor.');
  return ctx().db.purchaseOrder.update({ where: { id }, data: { status: PurchaseStatus.CANCELLED, notes: [po.notes, `Cancelada: ${reason}`].filter(Boolean).join('\n') } });
}

export const list = (filter: { status?: PurchaseStatus; supplierId?: string }) => ctx().db.purchaseOrder.findMany({ where: filter, include: { supplier: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
export async function get(id: string) {
  const po = await ctx().db.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, warehouse: { select: { code: true } }, items: { include: { variant: { select: { sku: true, product: { select: { name: true } } } } } } } });
  if (!po) throw AppError.notFound('Compra');
  return po;
}
/** Sugestão de reposição: itens abaixo do mínimo, com último fornecedor/custo. */
export async function sugestaoDeCompra() {
  return ctx().db.$queryRaw<{ variant_id: string; sku: string; produto: string; on_hand: string; min_level: string; sugerido: string; ultimo_custo: string | null; ultimo_fornecedor: string | null }[]>`
    SELECT b.variant_id, v.sku, p.name AS produto, b.on_hand::text, b.min_level::text, GREATEST(b.min_level * 2 - b.on_hand, 0)::text AS sugerido,
           (SELECT i.unit_cost::text FROM core_purchase_order_items i JOIN core_purchase_orders o ON o.id = i.purchase_order_id WHERE i.variant_id = v.id AND o.status IN ('RECEIVED','PARTIAL') ORDER BY o.received_at DESC NULLS LAST LIMIT 1) AS ultimo_custo,
           (SELECT s.name FROM core_purchase_order_items i JOIN core_purchase_orders o ON o.id = i.purchase_order_id JOIN core_suppliers s ON s.id = o.supplier_id WHERE i.variant_id = v.id ORDER BY o.created_at DESC LIMIT 1) AS ultimo_fornecedor
      FROM core_stock_balances b JOIN core_product_variants v ON v.id = b.variant_id JOIN core_products p ON p.id = v.product_id
     WHERE b.tenant_id = ${ctx().tenantId}::uuid AND b.min_level IS NOT NULL AND b.on_hand <= b.min_level
     ORDER BY p.name`;
}
export { Prisma };
