// LGPD da oficina: veículo e agenda. A placa leva ao dono (é dado pessoal) e sai; a OS fica com o
// pedido, que o núcleo guarda pela obrigação fiscal.
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const servicosLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const { db } = ctx();
    const [veiculos, agenda] = await Promise.all([
      db.svcVehicle.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } }),
      db.svcAppointment.findMany({ where: { customerId }, orderBy: { scheduledAt: 'asc' }, include: { vehicle: { select: { plate: true } } } }),
    ]);
    return {
      veiculos: veiculos.map((v) => ({ placa: v.plate, marca: v.brand, modelo: v.model, ano: v.year, cor: v.color, chassi: v.vin, km: v.mileage, observacoes: v.notes, ativo: v.isActive })),
      agendamentos: agenda.map((a) => ({ em: a.scheduledAt, servico: a.service, placa: a.vehicle?.plate ?? null, situacao: a.status, observacoes: a.notes })),
    };
  },
  async pendencias(customerId) {
    const n = await ctx().db.svcAppointment.count({ where: { customerId, status: { in: ['SCHEDULED', 'CONFIRMED', 'ARRIVED'] }, scheduledAt: { gte: new Date() } } });
    return n ? [`${n} agendamento(s) na oficina: conclua ou cancele antes.`] : [];
  },
  async anonimizar(customerId, tx) {
    const veiculos = await tx.svcVehicle.findMany({ where: { customerId }, select: { id: true } });
    // Placa é única por empresa e tem 10 posições: "ANON" + 6 do id não colide com placa real (7).
    for (const v of veiculos) await tx.svcVehicle.update({ where: { id: v.id }, data: { plate: `ANON${v.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`, vin: null, color: null, notes: null, isActive: false } });
    await tx.svcAppointment.updateMany({ where: { customerId }, data: { notes: null } });
  },
};
