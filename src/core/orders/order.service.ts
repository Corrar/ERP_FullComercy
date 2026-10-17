// src/core/orders/order.service.ts — O PEDIDO GENÉRICO.
//
// Fluxo de `createOrder`:
//   1. resolve a ESTRATÉGIA (módulo) para a empresa logada    → sales-strategy.ts
//   2. resolve e precifica os itens (variante, preço de tabela) → aqui
//   3. deixa a estratégia validar e reprecificar               → strategy.validate / price
//   4. numa transação com RLS armado:
//        a. próximo número sequencial da empresa
//        b. INSERT do pedido + itens
//        c. estoque conforme a política da estratégia (motor do core)
//        d. pagamentos → título no financeiro do core
//        e. extensão 1:1 do módulo (strategy.afterCreate)
//        f. histórico de status + auditoria
//
// O que NÃO está aqui, de propósito: mesa, comanda, comissão, placa, plano. Isso é do módulo.
import { OrderChannel, OrderItemKind, OrderStatus, FinanceEntryKind, Prisma } from '@prisma/client';
import { tenantTransaction, type TenantTx } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { D, ZERO, round2, sum } from '../../shared/money';
import { ctx } from '../tenancy/tenant-context';
import * as stock from '../inventory/stock.service';
import * as finance from '../finance/finance.service';
import { defaultWarehouseId } from '../inventory/products.service';
import {
  salesStrategies, type DraftPayment, type OrderDraft, type OrderWithItems, type PricedItem, type SalesStrategy,
} from './sales-strategy';

const ORDER_INCLUDE = {
  items: true,
  payments: true,
  customer: { select: { id: true, name: true, phone: true } },
  retailSale: true,
  foodOrder: { include: { table: true, tab: true, delivery: true } },
  serviceOrder: { include: { vehicle: true } },
} satisfies Prisma.OrderInclude;

// ─────────────────────────────────────────────────────────────────────────────
// CRIAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function createOrder(draft: OrderDraft) {
  const { db, tenantId, userId } = ctx();
  if (!draft.items?.length) throw AppError.validation('Pedido sem itens.');

  // 1. QUAL MÓDULO? — a decisão central, isolada em `resolve` para ser testável sozinha.
  const strategy: SalesStrategy = salesStrategies.resolve(draft);
  const channel = draft.channel ?? strategy.channels[0] ?? OrderChannel.COUNTER;

  // 2. Itens: variante + preço de tabela.
  let items = await priceItems(draft);

  // 3. O módulo opina.
  await strategy.validate?.(draft);
  if (strategy.price) items = await strategy.price(items, draft);

  const subtotal = round2(sum(items.map((i) => i.total)));
  const discount = round2(D(draft.discount ?? 0));
  const surcharge = round2(D(draft.surcharge ?? 0));
  const total = round2(subtotal.minus(discount).plus(surcharge));
  if (total.lt(0)) throw AppError.validation('Total negativo.');

  const warehouseId = draft.warehouseId ?? (await defaultWarehouseId());
  const policy = strategy.stockPolicy(draft);
  const initialStatus = strategy.initialStatus(draft);

  // 4. A transação.
  const orderId = await tenantTransaction(db, tenantId, async (tx) => {
    // Idempotência do pedido inteiro (retry do PDV offline, webhook reentregue).
    if (draft.idempotencyKey) {
      const dup = await tx.order.findFirst({ where: { metadata: { path: ['idempotencyKey'], equals: draft.idempotencyKey } }, select: { id: true } });
      if (dup) return dup.id;
    }

    const number = await nextOrderNumber(tx, tenantId);
    const order = await tx.order.create({
      data: {
        tenantId, number, channel,
        moduleKey: strategy.moduleKey,
        status: initialStatus,
        customerId: draft.customerId ?? null,
        sellerUserId: draft.sellerUserId ?? userId,
        warehouseId,
        subtotal, discount, surcharge, total,
        notes: draft.notes ?? null,
        metadata: { ...(draft.metadata ?? {}), ...(draft.idempotencyKey ? { idempotencyKey: draft.idempotencyKey } : {}) } as Prisma.InputJsonValue,
        items: {
          create: items.map((i) => ({
            variantId: i.variantId, kind: i.kind, description: i.description,
            quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, total: i.total,
            metadata: i.metadata as Prisma.InputJsonValue,
          })),
        },
        history: { create: { fromStatus: null, toStatus: initialStatus, userId } },
      },
      include: { items: { select: { id: true, variantId: true, quantity: true, kind: true } } },
    });

    // 4c. Estoque — SÓ pelo motor do core.
    await applyStockOnCreate(tx, order, items, policy, warehouseId, userId);

    // 4d. Pagamentos informados na criação (PDV) → título + baixa no financeiro do core.
    let status: OrderStatus = initialStatus;
    if (draft.payments?.length) {
      const paid = await registerPayments(tx, order, draft.payments);
      if (paid.gte(total) && strategy.completeOnFullPayment(draft)) {
        status = await transitionWithin(tx, order, OrderStatus.COMPLETED, strategy, policy, 'Pago integralmente na criação.');
      }
    }

    // 4e. A extensão do módulo (mesa, vendedor, veículo…), no mesmo commit.
    await strategy.afterCreate?.(tx, { ...order, status }, items, draft);

    await tx.auditLog.create({ data: { tenantId, userId, action: 'order.create', entity: 'Order', entityId: order.id, details: { number, module: strategy.moduleKey, total } } });
    return order.id;
  });

  return getOrder(orderId);
}

/** Resolve cada linha do rascunho numa linha precificada. Linha sem variante exige descrição. */
async function priceItems(draft: OrderDraft): Promise<PricedItem[]> {
  const { db } = ctx();
  const out: PricedItem[] = [];
  for (const [idx, it] of draft.items.entries()) {
    const quantity = D(it.quantity);
    if (!quantity.isFinite() || quantity.lte(0)) throw AppError.validation(`Item ${idx + 1}: quantidade inválida.`);
    const discount = round2(D(it.discount ?? 0));

    if (!it.variantId && !it.code) {
      if (!it.description) throw AppError.validation(`Item ${idx + 1}: sem variante é preciso descrição.`);
      if (it.unitPrice === undefined) throw AppError.validation(`Item ${idx + 1}: sem variante é preciso preço.`);
      const unitPrice = round2(D(it.unitPrice));
      out.push({
        variantId: null, productId: null, kind: it.kind ?? OrderItemKind.SERVICE, description: it.description,
        quantity, unitPrice, discount, total: round2(unitPrice.mul(quantity).minus(discount)), trackStock: false, metadata: it.metadata ?? {},
      });
      continue;
    }

    const v = await db.productVariant.findFirst({
      where: { isActive: true, ...(it.variantId ? { id: it.variantId } : { OR: [{ sku: it.code }, { barcode: it.code }] }) },
      include: { product: true },
    });
    if (!v) throw AppError.notFound(`Item ${idx + 1} (${it.variantId ?? it.code})`);
    if (!v.product.isActive) throw AppError.validation(`Item ${idx + 1}: produto inativo.`);

    const listPrice = v.priceOverride ?? v.product.salePrice;
    const unitPrice = round2(D(it.unitPrice ?? listPrice));
    out.push({
      variantId: v.id, productId: v.productId,
      kind: it.kind ?? (v.product.kind === 'SERVICE' ? OrderItemKind.SERVICE : OrderItemKind.PRODUCT),
      description: it.description ?? [v.product.name, v.name].filter(Boolean).join(' · '),
      quantity, unitPrice, discount, total: round2(unitPrice.mul(quantity).minus(discount)),
      trackStock: v.product.trackStock, metadata: it.metadata ?? {},
    });
  }
  return out;
}

/** `INSERT … ON CONFLICT DO UPDATE … RETURNING`: atômico, sem SELECT-then-UPDATE. */
async function nextOrderNumber(tx: TenantTx, tenantId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO core_order_counters (tenant_id, last_number) VALUES (${tenantId}::uuid, 1)
    ON CONFLICT (tenant_id) DO UPDATE SET last_number = core_order_counters.last_number + 1
    RETURNING last_number`;
  return rows[0].last_number;
}

async function applyStockOnCreate(tx: TenantTx, order: OrderWithItems, items: PricedItem[], policy: 'CONSUME' | 'RESERVE' | 'NONE', warehouseId: string, userId: string | null) {
  if (policy === 'NONE') return;
  for (const [i, it] of items.entries()) {
    if (!it.variantId || !it.trackStock) continue;
    const g = { tenantId: order.tenantId, variantId: it.variantId, warehouseId };
    const ref = { refType: 'ORDER', refId: order.id, userId, idempotencyKey: `order:${order.id}:create:${i}` };
    if (policy === 'CONSUME') await stock.consume(tx, g, it.quantity, ref);
    else await stock.reserve(tx, g, it.quantity, ref);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGAMENTO
// ─────────────────────────────────────────────────────────────────────────────

/** Grava os pagamentos do pedido e baixa o título a receber no financeiro do core.
 *  Devolve o total pago acumulado. O título nasce na primeira baixa (lazy). */
export async function registerPayments(tx: TenantTx, order: { id: string; tenantId: string; total: Prisma.Decimal; customerId: string | null; number: number }, payments: DraftPayment[]): Promise<Prisma.Decimal> {
  const { tenantId } = ctx();
  let entry = await tx.financeEntry.findFirst({ where: { orderId: order.id, origin: 'ORDER' } });
  if (!entry) {
    entry = await finance.createEntry(tx, tenantId, {
      kind: FinanceEntryKind.RECEIVABLE, description: `Pedido #${order.number}`, amount: D(order.total),
      dueDate: new Date(), customerId: order.customerId, orderId: order.id, origin: 'ORDER', originId: order.id,
    });
  }
  for (const p of payments) {
    const amount = round2(D(p.amount));
    if (amount.lte(0)) throw AppError.validation('Pagamento com valor inválido.');
    await tx.orderPayment.create({ data: { tenantId, orderId: order.id, method: p.method, amount, installments: p.installments ?? 1, reference: p.reference ?? null } });
    await finance.settle(tx, tenantId, { entryId: entry.id, amount, method: p.method, reference: p.reference ?? null });
  }
  const agg = await tx.orderPayment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
  return D(agg._sum.amount ?? 0);
}

export async function addPayments(orderId: string, payments: DraftPayment[]) {
  const { db, tenantId } = ctx();
  await tenantTransaction(db, tenantId, async (tx) => {
    const order = await loadForUpdate(tx, orderId);
    if (order.status === OrderStatus.CANCELLED) throw AppError.conflict('Pedido cancelado.');
    const strategy = salesStrategies.forOrder(order.moduleKey);
    const paid = await registerPayments(tx, order, payments);
    if (paid.gte(order.total) && strategy.completeOnFullPayment({ items: [] }) && order.status !== OrderStatus.COMPLETED) {
      await transitionWithin(tx, order, OrderStatus.COMPLETED, strategy, strategy.stockPolicy({ items: [] }), 'Pago integralmente.');
    }
  });
  return getOrder(orderId);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSIÇÃO DE STATUS
// ─────────────────────────────────────────────────────────────────────────────

/** Máquina de estados do CORE. Módulo pode restringir/estender via `allowedTransitions`. */
const CORE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:       [OrderStatus.OPEN, OrderStatus.CANCELLED],
  OPEN:        [OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  CONFIRMED:   [OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  IN_PROGRESS: [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  READY:       [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED:   [OrderStatus.CANCELLED], // estorno
  CANCELLED:   [],
};

export async function transition(orderId: string, to: OrderStatus, note?: string) {
  const { db, tenantId } = ctx();
  await tenantTransaction(db, tenantId, async (tx) => {
    const order = await loadForUpdate(tx, orderId);
    const strategy = salesStrategies.forOrder(order.moduleKey);
    await transitionWithin(tx, order, to, strategy, strategy.stockPolicy({ items: [] }), note);
  });
  return getOrder(orderId);
}

export const cancelOrder = (orderId: string, reason: string) => transition(orderId, OrderStatus.CANCELLED, reason);

/** A transição em si, reutilizada por `createOrder` (pagamento integral) e por `transition`. */
async function transitionWithin(tx: TenantTx, order: OrderWithItems, to: OrderStatus, strategy: SalesStrategy, policy: 'CONSUME' | 'RESERVE' | 'NONE', note?: string): Promise<OrderStatus> {
  const from = order.status;
  if (from === to) return to;
  const allowed = { ...CORE_TRANSITIONS, ...(strategy.allowedTransitions?.() ?? {}) }[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError('INVALID_TRANSITION', `Transição ${from} → ${to} não permitida.`);
  }
  const { userId } = ctx();

  // Efeitos de estoque das transições que mexem em saldo. Idempotentes por chave.
  const warehouseId = order.warehouseId ?? (await defaultWarehouseId());
  const stockItems = order.items.filter((i) => i.variantId && i.kind === OrderItemKind.PRODUCT);
  const grain = (variantId: string) => ({ tenantId: order.tenantId, variantId, warehouseId });
  const ref = (tag: string, i: number) => ({ refType: 'ORDER', refId: order.id, userId, idempotencyKey: `order:${order.id}:${tag}:${i}` });

  if (to === OrderStatus.COMPLETED && policy === 'RESERVE') {
    for (const [i, it] of stockItems.entries()) await stock.consume(tx, grain(it.variantId!), D(it.quantity), ref('complete', i), true);
  }
  if (to === OrderStatus.CANCELLED) {
    for (const [i, it] of stockItems.entries()) {
      if (policy === 'RESERVE' && from !== OrderStatus.COMPLETED) await stock.release(tx, grain(it.variantId!), D(it.quantity), ref('cancel', i));
      if (policy === 'CONSUME' || from === OrderStatus.COMPLETED) await stock.receive(tx, grain(it.variantId!), D(it.quantity), { ...ref('cancel', i), note: 'Estorno de pedido cancelado' });
    }
    // Título em aberto do pedido é cancelado; o que já foi pago fica para o financeiro tratar
    // (estorno é decisão humana, não automática).
    await tx.financeEntry.updateMany({ where: { orderId: order.id, origin: 'ORDER', status: { in: ['OPEN'] } }, data: { status: 'CANCELLED' } });
  }

  const stamp: Prisma.OrderUpdateInput = { status: to };
  if (to === OrderStatus.CONFIRMED) stamp.confirmedAt = new Date();
  if (to === OrderStatus.COMPLETED) stamp.completedAt = new Date();
  if (to === OrderStatus.CANCELLED) { stamp.cancelledAt = new Date(); stamp.cancelReason = note ?? null; }

  await tx.order.update({ where: { id: order.id }, data: stamp });
  await tx.orderStatusHistory.create({ data: { tenantId: order.tenantId, orderId: order.id, fromStatus: from, toStatus: to, userId, note: note ?? null } });
  await strategy.afterStatusChange?.(tx, { ...order, status: to }, from, to);
  return to;
}

async function loadForUpdate(tx: TenantTx, orderId: string): Promise<OrderWithItems> {
  // Trava o cabeçalho: dois garçons fechando a mesma comanda não podem transitar em paralelo.
  await tx.$queryRaw`SELECT id FROM core_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { select: { id: true, variantId: true, quantity: true, kind: true } } } });
  if (!order) throw AppError.notFound('Pedido');
  return order;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrder(id: string) {
  const o = await ctx().db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!o) throw AppError.notFound('Pedido');
  return o;
}

export async function listOrders(filter: { status?: OrderStatus; moduleKey?: string; from?: Date; to?: Date; customerId?: string }) {
  return ctx().db.order.findMany({
    where: {
      status: filter.status,
      moduleKey: filter.moduleKey as never,
      customerId: filter.customerId,
      createdAt: { gte: filter.from, lte: filter.to },
    },
    include: { customer: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
}

export { ZERO };
