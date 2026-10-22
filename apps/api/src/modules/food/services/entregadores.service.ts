// modules/food/services/entregadores.service.ts — entregadores e o ciclo da entrega.
import { DeliveryStatus, OrderStatus } from '@prisma/client';
import type { TenantTx } from '../../../infra/prisma';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { events } from '../../../shared/events';

export async function criarEntrega(tx: TenantTx, foodOrderId: string, address: Record<string, unknown>, zoneId?: string) {
  const { tenantId } = ctx();
  const zone = zoneId ? await tx.foodDeliveryZone.findUnique({ where: { id: zoneId } }) : null;
  return tx.foodDelivery.create({ data: { tenantId, foodOrderId, zoneId: zone?.id ?? null, fee: zone?.fee ?? 0, address: address as never } });
}

const FLUXO: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'PENDING', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: ['ASSIGNED'],
  CANCELLED: [],
};

export async function atribuirEntregador(deliveryId: string, courierId: string) {
  const { db } = ctx();
  const c = await db.foodCourier.findUnique({ where: { id: courierId } });
  if (!c?.isActive) throw AppError.validation('Entregador inválido ou inativo.');
  return moverEntrega(deliveryId, 'ASSIGNED', { courierId });
}

export async function moverEntrega(deliveryId: string, to: DeliveryStatus, extra: { courierId?: string; failReason?: string } = {}) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const d = await tx.foodDelivery.findUnique({ where: { id: deliveryId }, include: { foodOrder: true } });
    if (!d) throw AppError.notFound('Entrega');
    if (!FLUXO[d.status].includes(to)) throw new AppError('INVALID_TRANSITION', `Entrega ${d.status} → ${to} não permitida.`);
    const upd = await tx.foodDelivery.update({
      where: { id: deliveryId },
      data: {
        status: to, courierId: extra.courierId ?? d.courierId, failReason: extra.failReason ?? null,
        assignedAt: to === 'ASSIGNED' ? new Date() : undefined, pickedUpAt: to === 'PICKED_UP' ? new Date() : undefined, deliveredAt: to === 'DELIVERED' ? new Date() : undefined,
      },
    });
    // Entregue = pedido completo no core (se já pago). Se não pago, fica READY aguardando baixa.
    if (to === 'DELIVERED') {
      const o = await tx.order.findUnique({ where: { id: d.foodOrder.orderId }, include: { payments: true } });
      const pago = o ? o.payments.reduce((s, p) => s.plus(p.amount), D(0)) : null;
      if (o && pago && pago.gte(o.total)) {
        await tx.order.update({ where: { id: o.id }, data: { status: OrderStatus.COMPLETED, completedAt: new Date() } });
      }
    }
    events.emit('delivery.status', { tenantId, deliveryId, status: to, orderId: d.foodOrder.orderId });
    return upd;
  });
}

export async function painelEntregas() {
  return ctx().db.foodDelivery.findMany({
    where: { status: { in: ['PENDING', 'ASSIGNED', 'PICKED_UP'] } },
    include: { courier: { select: { name: true, phone: true } }, foodOrder: { include: { order: { select: { number: true, total: true, customer: { select: { name: true, phone: true } } } } } } },
    orderBy: { createdAt: 'asc' },
  });
}

export const listarZonas = () => ctx().db.foodDeliveryZone.findMany({ orderBy: { name: 'asc' } });
export const criarZona = (input: { name: string; fee: number; etaMin?: number; rule?: Record<string, unknown> }) => ctx().db.foodDeliveryZone.create({ data: { ...input, tenantId: ctx().tenantId, rule: (input.rule ?? {}) as never } });
export const atualizarZona = (id: string, input: { name?: string; fee?: number; etaMin?: number | null; isActive?: boolean; rule?: Record<string, unknown> }) => ctx().db.foodDeliveryZone.update({ where: { id }, data: { ...input, rule: input.rule as never } });

/** Localiza a zona pelo CEP (prefixos em `rule.zipPrefixes`). */
export async function zonaPorCep(cep: string) {
  const digits = cep.replace(/\D/g, '');
  const zonas = await ctx().db.foodDeliveryZone.findMany({ where: { isActive: true } });
  return zonas.find((z) => ((z.rule as { zipPrefixes?: string[] })?.zipPrefixes ?? []).some((p) => digits.startsWith(p))) ?? null;
}

/** ACERTO do entregador: entregas concluídas no período, taxas e o que ele recebeu em dinheiro. */
export async function acertoDoEntregador(courierId: string, from: Date, to: Date) {
  const { db } = ctx();
  const entregas = await db.foodDelivery.findMany({ where: { courierId, status: 'DELIVERED', deliveredAt: { gte: from, lte: to } }, include: { foodOrder: { include: { order: { include: { payments: true } } } } } });
  const taxas = entregas.reduce((s, e) => s.plus(e.fee), D(0));
  const dinheiroRecebido = entregas.reduce((s, e) => s.plus(e.foodOrder.order.payments.filter((p) => p.method === 'CASH').reduce((a, p) => a.plus(p.amount), D(0))), D(0));
  return { courierId, periodo: { from, to }, entregas: entregas.length, taxasDeEntrega: taxas, dinheiroEmMaos: dinheiroRecebido, aRepassarParaLoja: dinheiroRecebido.minus(taxas) };
}
