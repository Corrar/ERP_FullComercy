// src/core/inventory/counts.service.ts — INVENTÁRIO FÍSICO.
// Abrir: fotografa o saldo do sistema (snapshot) por variante do armazém (opcionalmente só uma
// categoria). Contar: o operador informa o contado, item a item (ou em lote, por SKU/código).
// Aplicar: cada divergência vira um ADJUST no motor de estoque, na mesma transação, com a
// contagem como referência. Reserva pendente é respeitada: o ajuste não pode deixar on_hand <
// reserved (o motor recusa e a contagem aponta o item).
import { StockCountStatus } from '@prisma/client';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { D } from '../../shared/money';
import * as stock from './stock.service';
import { defaultWarehouseId } from './products.service';

export async function abrir(input: { warehouseId?: string; categoryId?: string; notes?: string }) {
  const { db, tenantId, userId } = ctx();
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId());
  const aberta = await db.stockCount.findFirst({ where: { warehouseId, status: 'OPEN', categoryId: input.categoryId ?? null } });
  if (aberta) throw AppError.conflict('Já existe contagem aberta para este armazém/escopo.');
  // Universo: variantes ativas com controle de estoque (saldo existente OU zero).
  const variants = await db.productVariant.findMany({ where: { isActive: true, product: { isActive: true, trackStock: true, ...(input.categoryId ? { categoryId: input.categoryId } : {}) } }, include: { balances: { where: { warehouseId } } } });
  return tenantTransaction(db, tenantId, async (tx) => {
    const c = await tx.stockCount.create({ data: { tenantId, warehouseId, categoryId: input.categoryId, notes: input.notes, openedByUserId: userId } });
    await tx.stockCountItem.createMany({ data: variants.map((v) => ({ tenantId, countId: c.id, variantId: v.id, snapshotQty: v.balances[0]?.onHand ?? 0 })) });
    return tx.stockCount.findUnique({ where: { id: c.id }, include: { _count: { select: { items: true } } } });
  });
}

export async function detalhe(id: string) {
  const c = await ctx().db.stockCount.findUnique({ where: { id }, include: { warehouse: { select: { code: true } }, items: { include: { variant: { select: { sku: true, barcode: true, name: true, product: { select: { name: true, unit: true } } } } }, orderBy: { variant: { sku: 'asc' } } } } });
  if (!c) throw AppError.notFound('Contagem');
  const itens = c.items.map((i) => ({ ...i, divergencia: i.countedQty === null ? null : D(i.countedQty).minus(i.snapshotQty) }));
  return { ...c, items: itens, resumo: { total: itens.length, contados: itens.filter((i) => i.countedQty !== null).length, divergentes: itens.filter((i) => i.divergencia && !i.divergencia.isZero()).length } };
}

/** Lançamento de contagem: por itemId, variantId, SKU ou código de barras. Repetir SOMA (duas prateleiras). */
export async function contar(id: string, lancamentos: { itemId?: string; variantId?: string; code?: string; quantity: number; note?: string; somar?: boolean }[]) {
  const { db } = ctx();
  const c = await db.stockCount.findUnique({ where: { id } });
  if (!c || c.status !== 'OPEN') throw AppError.conflict('Contagem não está aberta.');
  const out = [];
  for (const l of lancamentos) {
    let item = l.itemId ? await db.stockCountItem.findFirst({ where: { id: l.itemId, countId: id } }) : null;
    if (!item) {
      const variant = l.variantId ? { id: l.variantId } : await db.productVariant.findFirst({ where: { OR: [{ sku: l.code }, { barcode: l.code }] }, select: { id: true } });
      if (!variant) throw AppError.notFound(`Item ${l.code ?? l.variantId}`);
      item = await db.stockCountItem.findFirst({ where: { countId: id, variantId: variant.id } });
      // Item fora do universo inicial (produto criado depois): entra com snapshot 0.
      if (!item) item = await db.stockCountItem.create({ data: { tenantId: ctx().tenantId, countId: id, variantId: variant.id, snapshotQty: 0 } });
    }
    const base = l.somar && item.countedQty !== null ? D(item.countedQty) : D(0);
    out.push(await db.stockCountItem.update({ where: { id: item.id }, data: { countedQty: base.plus(l.quantity), countedAt: new Date(), note: l.note ?? item.note } }));
  }
  return out;
}

/** Aplica: divergência → ADJUST. Itens não contados: `tratarNaoContadosComoZero` decide. */
export async function aplicar(id: string, opts: { tratarNaoContadosComoZero?: boolean } = {}) {
  const { db, tenantId, userId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const c = await tx.stockCount.findUnique({ where: { id }, include: { items: true } });
    if (!c || c.status !== 'OPEN') throw AppError.conflict('Contagem não está aberta.');
    let ajustes = 0; const falhas: { variantId: string; erro: string }[] = [];
    for (const it of c.items) {
      const contado = it.countedQty ?? (opts.tratarNaoContadosComoZero ? D(0) : null);
      if (contado === null) continue;
      // Ajusta para o CONTADO, não para "snapshot + diferença": se houve venda entre abrir e aplicar,
      // o que vale é o que está na prateleira agora.
      try {
        const r = await stock.adjustTo(tx, { tenantId, variantId: it.variantId, warehouseId: c.warehouseId }, D(contado), { refType: 'INVENTORY', refId: c.id, userId, idempotencyKey: `count:${c.id}:${it.id}`, note: it.note ?? 'Inventário físico' });
        if (r && !D(contado).eq(it.snapshotQty)) ajustes++;
      } catch (e) { falhas.push({ variantId: it.variantId, erro: e instanceof Error ? e.message : String(e) }); }
    }
    if (falhas.length) throw new AppError('CONFLICT', `${falhas.length} item(ns) não puderam ser ajustados (reserva maior que o contado?).`, falhas);
    await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.APPLIED, appliedAt: new Date() } });
    await tx.auditLog.create({ data: { tenantId, userId, action: 'stock.count.apply', entity: 'StockCount', entityId: id, details: { ajustes } } });
    return { ajustes };
  });
}

export const cancelar = (id: string) => ctx().db.stockCount.update({ where: { id, status: 'OPEN' }, data: { status: 'CANCELLED' } });
export const listar = () => ctx().db.stockCount.findMany({ include: { warehouse: { select: { code: true } }, _count: { select: { items: true } } }, orderBy: { openedAt: 'desc' }, take: 50 });
