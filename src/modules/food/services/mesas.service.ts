// modules/food/services/mesas.service.ts — mesas e comandas. Fechar a conta = somar os pedidos
// da comanda, aplicar taxa de serviço, receber e COMPLETAR cada pedido no core.
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D, round2, sum } from '../../../shared/money';
import { registerPayments } from '../../../core/orders/order.service';
import * as orders from '../../../core/orders/order.service';

export async function abrirComanda(input: { code: string; tableId?: string; customerName?: string; guests?: number }) {
  const { db, tenantId } = ctx();
  const aberta = await db.foodTab.findFirst({ where: { code: input.code, status: 'OPEN' } });
  if (aberta) throw AppError.conflict(`Comanda ${input.code} já está aberta.`);
  const tab = await db.foodTab.create({ data: { ...input, tenantId } });
  if (input.tableId) await db.foodTable.update({ where: { id: input.tableId }, data: { status: 'OCCUPIED' } });
  return tab;
}

export async function contaDaComanda(tabId: string) {
  const { db } = ctx();
  const tab = await db.foodTab.findUnique({ where: { id: tabId }, include: { orders: { include: { order: { include: { items: true, payments: true } } } }, table: true } });
  if (!tab) throw AppError.notFound('Comanda');
  const pedidos = tab.orders.map((f) => f.order).filter((o) => o.status !== OrderStatus.CANCELLED);
  const subtotal = round2(sum(pedidos.map((o) => D(o.total))));
  const taxa = round2(subtotal.mul(D(tab.serviceFeeRate)).div(100));
  const pago = round2(sum(pedidos.flatMap((o) => o.payments.map((p) => D(p.amount)))));
  return { tab, pedidos, subtotal, taxaServico: taxa, total: round2(subtotal.plus(taxa)), pago, restante: round2(subtotal.plus(taxa).minus(pago)) };
}

/** Fecha a conta: cobra a taxa num pedido de FEE, rateia o pagamento e completa tudo. */
export async function fecharComanda(tabId: string, payments: { method: PaymentMethod; amount: number }[], cobrarTaxa = true) {
  const { db, tenantId } = ctx();
  const conta = await contaDaComanda(tabId);
  if (conta.tab.status !== 'OPEN') throw AppError.conflict('Comanda não está aberta.');
  const total = cobrarTaxa ? conta.total : conta.subtotal;
  const pagoAgora = round2(sum(payments.map((p) => D(p.amount))));
  if (pagoAgora.plus(conta.pago).lt(total)) throw AppError.validation(`Pagamento insuficiente: faltam ${total.minus(conta.pago).minus(pagoAgora)}.`);

  // A taxa de serviço vira um pedido próprio (linha FEE), para o financeiro enxergá-la separada.
  if (cobrarTaxa && conta.taxaServico.gt(0)) {
    await orders.createOrder({
      moduleKey: 'FOOD', channel: 'TABLE', items: [{ kind: 'FEE', description: `Taxa de serviço comanda ${conta.tab.code}`, quantity: 1, unitPrice: conta.taxaServico.toNumber() }],
      moduleData: { tabId, serviceType: 'DINE_IN' }, notes: 'Taxa de serviço',
    });
  }
  const atualizada = await contaDaComanda(tabId);

  await tenantTransaction(db, tenantId, async (tx) => {
    // Rateio: paga pedido a pedido, na ordem, até esgotar o dinheiro.
    let restante = payments.map((p) => ({ ...p, amount: D(p.amount) }));
    for (const o of atualizada.pedidos) {
      let falta = D(o.total).minus(sum(o.payments.map((p) => D(p.amount))));
      const parcelas: { method: PaymentMethod; amount: number }[] = [];
      restante = restante.flatMap((p) => {
        if (falta.lte(0) || p.amount.lte(0)) return [p];
        const usa = p.amount.lt(falta) ? p.amount : falta;
        falta = falta.minus(usa);
        parcelas.push({ method: p.method, amount: usa.toNumber() });
        return [{ ...p, amount: p.amount.minus(usa) }];
      });
      if (parcelas.length) await registerPayments(tx, o, parcelas);
      await tx.order.update({ where: { id: o.id }, data: { status: OrderStatus.COMPLETED, completedAt: new Date() } });
    }
    await tx.foodTab.update({ where: { id: tabId }, data: { status: 'CLOSED', closedAt: new Date() } });
    if (conta.tab.tableId) await tx.foodTable.update({ where: { id: conta.tab.tableId }, data: { status: 'FREE' } });
  });
  return contaDaComanda(tabId);
}

export const listarComandasAbertas = () => ctx().db.foodTab.findMany({ where: { status: 'OPEN' }, include: { table: { select: { number: true } }, orders: { include: { order: { select: { total: true, status: true } } } } }, orderBy: { openedAt: 'asc' } });

export async function transferirComanda(tabId: string, toTableId: string) {
  const { db } = ctx();
  const tab = await db.foodTab.findUnique({ where: { id: tabId } });
  if (!tab || tab.status !== 'OPEN') throw AppError.conflict('Comanda não está aberta.');
  const destino = await db.foodTable.findUnique({ where: { id: toTableId } });
  if (!destino?.isActive) throw AppError.notFound('Mesa destino');
  await db.$transaction([
    db.foodTab.update({ where: { id: tabId }, data: { tableId: toTableId } }),
    db.foodOrder.updateMany({ where: { tabId }, data: { tableId: toTableId } }),
    db.foodTable.update({ where: { id: toTableId }, data: { status: 'OCCUPIED' } }),
    ...(tab.tableId ? [db.foodTable.update({ where: { id: tab.tableId }, data: { status: 'FREE' } })] : []),
  ]);
  return db.foodTab.findUnique({ where: { id: tabId }, include: { table: true } });
}

/** Cancela comanda SEM consumo (todos os pedidos cancelados ou nenhum pedido). */
export async function cancelarComanda(tabId: string, reason: string) {
  const { db } = ctx();
  const conta = await contaDaComanda(tabId);
  if (conta.pedidos.length) throw AppError.conflict('Comanda tem pedidos ativos; cancele-os antes (POST /orders/:id/cancel).');
  await db.foodTab.update({ where: { id: tabId }, data: { status: 'CANCELLED', closedAt: new Date() } });
  if (conta.tab.tableId) await db.foodTable.update({ where: { id: conta.tab.tableId }, data: { status: 'FREE' } });
  await db.auditLog.create({ data: { tenantId: ctx().tenantId, userId: ctx().userId, action: 'food.tab.cancel', entity: 'FoodTab', entityId: tabId, details: { reason } } });
}

export const atualizarMesa = (id: string, input: { name?: string; area?: string; seats?: number; status?: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLOSING'; isActive?: boolean }) =>
  ctx().db.foodTable.update({ where: { id }, data: input });

/** Mapa do salão: cada mesa com a comanda aberta e o total parcial. */
export async function mapaDoSalao() {
  const mesas = await ctx().db.foodTable.findMany({ where: { isActive: true }, orderBy: [{ area: 'asc' }, { number: 'asc' }], include: { tabs: { where: { status: 'OPEN' }, include: { orders: { include: { order: { select: { total: true, status: true } } } } } } } });
  return mesas.map((m) => ({
    id: m.id, number: m.number, name: m.name, area: m.area, seats: m.seats, status: m.status,
    comanda: m.tabs[0] ? { id: m.tabs[0].id, code: m.tabs[0].code, guests: m.tabs[0].guests, abertaEm: m.tabs[0].openedAt, parcial: m.tabs[0].orders.filter((o) => o.order.status !== 'CANCELLED').reduce((s, o) => s.plus(o.order.total), D(0)) } : null,
  }));
}
