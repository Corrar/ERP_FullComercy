// LGPD da hotelaria: reservas do hóspede. Reserva por vir ou hospedagem em curso bloqueia.
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const hotelLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const reservas = await ctx().db.hotReservation.findMany({ where: { customerId }, orderBy: { checkIn: 'asc' }, include: { room: { select: { number: true } } } });
    return {
      reservas: reservas.map((r) => ({ quarto: r.room.number, entrada: r.checkIn, saida: r.checkOut, hospedes: r.guests, diaria: r.dailyRate, situacao: r.status, origem: r.source, observacoes: r.notes, chegouEm: r.checkedInAt, saiuEm: r.checkedOutAt })),
    };
  },
  async pendencias(customerId) {
    const n = await ctx().db.hotReservation.count({ where: { customerId, status: { in: ['BOOKED', 'CHECKED_IN'] } } });
    return n ? [`${n} reserva(s) por vir ou hospedagem em curso: conclua ou cancele antes.`] : [];
  },
  async anonimizar(customerId, tx) {
    await tx.hotReservation.updateMany({ where: { customerId }, data: { notes: null } });
  },
};
