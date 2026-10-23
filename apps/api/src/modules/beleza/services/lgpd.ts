// LGPD do salão: agenda e pacotes. Pacote com sessão a usar é crédito pago da pessoa: bloqueia.
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const belezaLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const { db } = ctx();
    const [agenda, pacotes] = await Promise.all([
      db.belAppointment.findMany({ where: { customerId }, orderBy: { startsAt: 'asc' }, include: { professional: { select: { name: true } }, service: { select: { name: true } } } }),
      db.belCustomerPackage.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' }, include: { package: { select: { name: true } } } }),
    ]);
    return {
      agendamentos: agenda.map((a) => ({ em: a.startsAt, servico: a.service.name, profissional: a.professional.name, situacao: a.status, observacoes: a.notes })),
      pacotes: pacotes.map((p) => ({ pacote: p.package.name, sessoes: p.sessionsTotal, usadas: p.sessionsUsed, validade: p.expiresAt, compradoEm: p.createdAt })),
    };
  },
  async pendencias(customerId) {
    const { db } = ctx();
    const agora = new Date();
    const out: string[] = [];
    const futuros = await db.belAppointment.count({ where: { customerId, OR: [{ status: 'IN_SERVICE' }, { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gte: agora } }] } });
    if (futuros) out.push(`${futuros} horário(s) agendado(s) no salão: conclua ou cancele antes.`);
    const pacotes = await db.belCustomerPackage.findMany({ where: { customerId, expiresAt: { gte: agora } }, select: { sessionsTotal: true, sessionsUsed: true } });
    const abertos = pacotes.filter((p) => p.sessionsUsed < p.sessionsTotal).length;
    if (abertos) out.push(`${abertos} pacote(s) com sessões ainda a usar (crédito pago do cliente).`);
    return out;
  },
  async anonimizar(customerId, tx) {
    await tx.belAppointment.updateMany({ where: { customerId }, data: { notes: null } });
  },
};
