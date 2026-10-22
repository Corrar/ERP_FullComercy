// modules/hotel/services/hotel-sales.strategy.ts — como a POUSADA vende: a CONTA do hóspede.
// Abrir o pedido com `moduleData.reservationId` É o check-in: a estratégia injeta a linha das
// diárias (noites × diária da reserva), marca a reserva como hospedada e o quarto como ocupado.
// Consumo entra depois como itens. A conta não fecha por pagamento: fecha no CHECK-OUT (transição
// para COMPLETED), que exige tudo pago e manda o quarto para a limpeza.
import { ModuleKey, OrderChannel, OrderItemKind, OrderStatus } from '@prisma/client';
import type { OrderDraft, SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';
import { noites } from './hotel.service';

const md = (d: OrderDraft) => (d.moduleData ?? {}) as { reservationId?: string };

export const hotelSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.HOTEL,
  name: 'Hotelaria · Conta do hóspede',
  channels: [OrderChannel.LODGING],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => false,

  async validate(draft) {
    const m = md(draft);
    if (!m.reservationId) throw AppError.validation('Conta de hospedagem nasce do check-in: informe a reserva.');
    const r = await ctx().db.hotReservation.findUnique({ where: { id: m.reservationId }, include: { room: true } });
    if (!r) throw AppError.notFound('Reserva');
    if (r.customerId !== draft.customerId) throw AppError.validation('A reserva é de outro hóspede.');
    if (r.status !== 'BOOKED') throw AppError.conflict('Esta reserva já fez check-in, saiu ou foi cancelada.');
    if (r.room.status === 'OCCUPIED' || r.room.status === 'MAINTENANCE') throw AppError.conflict(`Quarto ${r.room.number} ${r.room.status === 'OCCUPIED' ? 'ocupado' : 'em manutenção'}.`);
  },

  async price(items, draft) {
    const m = md(draft);
    if (!m.reservationId) return items;
    const r = await ctx().db.hotReservation.findUnique({ where: { id: m.reservationId }, include: { room: true } });
    // Só no CHECK-IN (reserva ainda BOOKED). Consumo lançado depois relê o mesmo moduleData e
    // não pode ganhar diárias de novo.
    if (!r || r.status !== 'BOOKED') return items;
    const n = noites(r.checkIn, r.checkOut); const unit = D(r.dailyRate);
    const diarias = { variantId: null, productId: null, kind: OrderItemKind.SERVICE, description: `Diárias quarto ${r.room.number} (${n} × ${unit.toFixed(2)})`, quantity: D(n), unitPrice: unit, discount: D(0), total: round2(unit.mul(n)), trackStock: false, metadata: { reservationId: r.id } };
    return [diarias, ...items];
  },

  async afterCreate(tx, order, _items, draft) {
    const r = await tx.hotReservation.findUniqueOrThrow({ where: { id: md(draft).reservationId! } });
    const ok = await tx.hotReservation.updateMany({ where: { id: r.id, status: 'BOOKED' }, data: { status: 'CHECKED_IN', orderId: order.id, checkedInAt: new Date() } });
    if (!ok.count) throw AppError.conflict('Check-in já feito.');
    await tx.hotStay.create({ data: { tenantId: order.tenantId, orderId: order.id, reservationId: r.id } });
    await tx.hotRoom.update({ where: { id: r.roomId }, data: { status: 'OCCUPIED' } });
  },

  async afterStatusChange(tx, order, _from, to) {
    const stay = await tx.hotStay.findFirst({ where: { orderId: order.id }, include: { reservation: true } });
    if (!stay) return;
    if (to === OrderStatus.COMPLETED) {
      const o = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      const pago = await tx.orderPayment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
      const falta = D(o.total).minus(pago._sum.amount ?? 0);
      if (falta.gt(0)) throw AppError.conflict(`Conta com saldo de R$ ${falta.toFixed(2)}: receba antes do check-out.`);
      await tx.hotReservation.update({ where: { id: stay.reservationId }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date() } });
      await tx.hotRoom.update({ where: { id: stay.reservation.roomId }, data: { status: 'CLEANING' } });
    }
    if (to === OrderStatus.CANCELLED) {
      // Estorno do check-in (lançado no quarto errado): a reserva volta a valer e o quarto se libera.
      await tx.hotReservation.update({ where: { id: stay.reservationId }, data: { status: 'BOOKED', orderId: null, checkedInAt: null } });
      await tx.hotStay.delete({ where: { id: stay.id } });
      await tx.hotRoom.update({ where: { id: stay.reservation.roomId }, data: { status: 'AVAILABLE' } });
    }
  },
};
