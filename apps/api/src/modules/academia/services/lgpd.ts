// LGPD da academia: o que o módulo guarda do aluno. Matrícula viva bloqueia (ainda é cobrada);
// a credencial da catraca (hash da digital/cartão) é o dado mais sensível e deixa de existir.
import { Prisma } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const academiaLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const { db } = ctx();
    const [matriculas, frequencia, reservas, credenciais, acessos] = await Promise.all([
      db.gymMembership.findMany({ where: { customerId }, orderBy: { startDate: 'asc' }, select: { status: true, startDate: true, endDate: true, cancelledAt: true, cancelReason: true, plan: { select: { name: true } } } }),
      db.gymCheckIn.findMany({ where: { customerId }, orderBy: { checkedInAt: 'asc' }, select: { checkedInAt: true, checkedOutAt: true, source: true } }),
      db.gymClassBooking.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' }, select: { status: true, session: { select: { startsAt: true, class: { select: { name: true } } } } } }),
      // Só o tipo e a situação: o hash não é dado da pessoa legível, e entregá-lo ajudaria a forjar acesso.
      db.gymAccessCredential.findMany({ where: { customerId }, select: { kind: true, isActive: true, createdAt: true, revokedAt: true } }),
      db.gymAccessEvent.findMany({ where: { customerId }, orderBy: { occurredAt: 'asc' }, select: { occurredAt: true, allowed: true, reason: true } }),
    ]);
    return {
      matriculas: matriculas.map((m) => ({ plano: m.plan.name, situacao: m.status, inicio: m.startDate, fim: m.endDate, canceladaEm: m.cancelledAt, motivo: m.cancelReason })),
      frequencia: frequencia.map((f) => ({ entrada: f.checkedInAt, saida: f.checkedOutAt, origem: f.source })),
      reservasDeAula: reservas.map((r) => ({ aula: r.session.class.name, em: r.session.startsAt, situacao: r.status })),
      credenciais: credenciais.map((c) => ({ tipo: c.kind, ativa: c.isActive, criadaEm: c.createdAt, revogadaEm: c.revokedAt })),
      acessosNaCatraca: acessos.map((a) => ({ em: a.occurredAt, liberado: a.allowed, motivo: a.reason })),
    };
  },
  async pendencias(customerId) {
    const n = await ctx().db.gymMembership.count({ where: { customerId, status: { in: ['ACTIVE', 'PAUSED', 'OVERDUE'] } } });
    return n ? [`${n} matrícula(s) ativa(s), pausada(s) ou em atraso: cancele antes.`] : [];
  },
  async anonimizar(customerId, tx) {
    const agora = new Date();
    const creds = await tx.gymAccessCredential.findMany({ where: { customerId }, select: { id: true } });
    for (const c of creds) await tx.gymAccessCredential.update({ where: { id: c.id }, data: { isActive: false, revokedAt: agora, valueHash: `anon:${c.id}` } });
    await tx.gymAccessEvent.updateMany({ where: { customerId }, data: { raw: Prisma.DbNull } });
    await tx.gymClassBooking.updateMany({ where: { customerId, status: 'BOOKED', session: { startsAt: { gte: agora } } }, data: { status: 'CANCELLED' } });
  },
};
