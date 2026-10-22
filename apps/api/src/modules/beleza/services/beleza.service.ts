// modules/beleza/services/beleza.service.ts — cadastro (profissionais, serviços, pacotes), AGENDA
// por profissional sem sobreposição, comissões e relatórios do salão. A venda (comanda do
// atendimento) nasce em POST /orders — ver beleza-sales.strategy.ts.
import { BelAppointmentStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction, type TenantTx } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D, round2, sum } from '../../../shared/money';
import * as finance from '../../../core/finance/finance.service';

// ── Profissionais e serviços ──
export const profissionais = () => ctx().db.belProfessional.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
export const criarProfissional = (input: { name: string; commissionRate?: number; color?: string; userId?: string }) =>
  ctx().db.belProfessional.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarProfissional = (id: string, input: { name?: string; commissionRate?: number; color?: string | null; isActive?: boolean }) =>
  ctx().db.belProfessional.update({ where: { id }, data: input });

export const servicos = () => ctx().db.belService.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
export const criarServico = (input: { name: string; durationMin: number; price: number; commissionRate?: number | null }) =>
  ctx().db.belService.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarServico = (id: string, input: { name?: string; durationMin?: number; price?: number; commissionRate?: number | null; isActive?: boolean }) =>
  ctx().db.belService.update({ where: { id }, data: input });

// ── Agenda ──
const OCUPA: BelAppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'IN_SERVICE', 'DONE'];

export const agenda = (from: Date, to: Date, professionalId?: string) => ctx().db.belAppointment.findMany({
  where: { startsAt: { gte: from, lt: to }, professionalId },
  include: { customer: { select: { id: true, name: true, phone: true } }, professional: { select: { id: true, name: true, color: true } }, service: { select: { id: true, name: true, price: true, durationMin: true } } },
  orderBy: { startsAt: 'asc' },
});

/** Choque de horário do profissional: [início, fim) encosta mas não sobrepõe. Trava a linha do
 *  profissional para duas recepcionistas não marcarem o mesmo horário ao mesmo tempo. */
async function garantirLivre(tx: TenantTx, professionalId: string, startsAt: Date, endsAt: Date, ignorar?: string) {
  await tx.$queryRaw`SELECT id FROM bel_professionals WHERE id = ${professionalId}::uuid FOR UPDATE`;
  const choque = await tx.belAppointment.findFirst({
    where: { professionalId, status: { in: OCUPA }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(ignorar ? { id: { not: ignorar } } : {}) },
    include: { customer: { select: { name: true } } },
  });
  if (choque) throw AppError.conflict(`Horário ocupado: ${choque.customer.name} às ${choque.startsAt.toISOString().slice(11, 16)} UTC.`);
}

export async function agendar(input: { customerId: string; professionalId: string; serviceId: string; startsAt: Date; notes?: string }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const [prof, serv] = await Promise.all([tx.belProfessional.findUnique({ where: { id: input.professionalId } }), tx.belService.findUnique({ where: { id: input.serviceId } })]);
    if (!prof?.isActive) throw AppError.validation('Profissional inválido ou inativo.');
    if (!serv?.isActive) throw AppError.validation('Serviço inválido ou inativo.');
    const endsAt = new Date(input.startsAt.getTime() + serv.durationMin * 60000);
    await garantirLivre(tx, prof.id, input.startsAt, endsAt);
    return tx.belAppointment.create({ data: { tenantId, customerId: input.customerId, professionalId: prof.id, serviceId: serv.id, startsAt: input.startsAt, endsAt, notes: input.notes } });
  });
}

const TRANSICOES: Partial<Record<BelAppointmentStatus, BelAppointmentStatus[]>> = {
  SCHEDULED: ['CONFIRMED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'NO_SHOW', 'CANCELLED'],
  NO_SHOW: ['SCHEDULED'],
  CANCELLED: ['SCHEDULED'],
};

/** Remarcar (novo início/profissional) ou mudar o status à mão. Em atendimento/concluído quem
 *  manda é a comanda (estratégia de venda). */
export async function atualizarAgendamento(id: string, input: { startsAt?: Date; professionalId?: string; status?: BelAppointmentStatus; notes?: string }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const a = await tx.belAppointment.findUnique({ where: { id }, include: { service: true } });
    if (!a) throw AppError.notFound('Agendamento');
    if (a.status === 'IN_SERVICE' || a.status === 'DONE') throw AppError.conflict('Atendimento já aberto na comanda: altere pela comanda.');
    if (input.status && input.status !== a.status && !TRANSICOES[a.status]?.includes(input.status)) throw AppError.validation(`Não dá para ir de ${a.status} para ${input.status}.`);
    const startsAt = input.startsAt ?? a.startsAt;
    const professionalId = input.professionalId ?? a.professionalId;
    const endsAt = new Date(startsAt.getTime() + a.service.durationMin * 60000);
    const voltaAOcupar = input.status ? OCUPA.includes(input.status) : OCUPA.includes(a.status);
    if (voltaAOcupar && (input.startsAt || input.professionalId || (input.status && !OCUPA.includes(a.status)))) await garantirLivre(tx, professionalId, startsAt, endsAt, a.id);
    return tx.belAppointment.update({ where: { id }, data: { startsAt, endsAt, professionalId, status: input.status, notes: input.notes } });
  });
}

// ── Pacotes ──
export const pacotes = () => ctx().db.belPackage.findMany({ include: { service: { select: { name: true } } }, orderBy: { name: 'asc' } });
export const criarPacote = (input: { name: string; serviceId: string; sessions: number; price: number; validityDays?: number }) =>
  ctx().db.belPackage.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarPacote = (id: string, input: { name?: string; price?: number; validityDays?: number; isActive?: boolean }) =>
  ctx().db.belPackage.update({ where: { id }, data: input });
/** Pacotes do cliente com saldo e validade (os vencidos ou zerados vêm marcados, não somem). */
export async function pacotesDoCliente(customerId: string) {
  const rows = await ctx().db.belCustomerPackage.findMany({ where: { customerId }, include: { package: { include: { service: { select: { id: true, name: true } } } } }, orderBy: { expiresAt: 'asc' } });
  const agora = new Date();
  return rows.map((r) => ({ ...r, saldo: r.sessionsTotal - r.sessionsUsed, vencido: r.expiresAt < agora }));
}

// ── Comissões ──
export const comissoes = (filter: { professionalId?: string; status?: 'PENDING' | 'PAID' | 'CANCELLED' }) => ctx().db.belCommission.findMany({
  where: filter, include: { professional: { select: { name: true } }, sale: { include: { order: { select: { number: true, total: true, completedAt: true } } } } },
  orderBy: { createdAt: 'desc' }, take: 500,
});

/** Paga as comissões pendentes de um profissional até a data: vira UM título a pagar. */
export async function pagarComissoes(professionalId: string, until: Date) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const pend = await tx.belCommission.findMany({ where: { professionalId, status: 'PENDING', createdAt: { lte: until } }, include: { professional: true } });
    if (!pend.length) return { pagas: 0, total: '0' };
    const total = round2(sum(pend.map((c) => D(c.amount))));
    const entry = await finance.createEntry(tx, tenantId, { kind: 'PAYABLE', description: `Comissões ${pend[0].professional.name} até ${until.toISOString().slice(0, 10)}`, amount: total, dueDate: new Date(), origin: 'BEL_COMMISSION', originId: professionalId });
    await tx.belCommission.updateMany({ where: { id: { in: pend.map((c) => c.id) } }, data: { status: 'PAID', paidAt: new Date(), financeEntryId: entry.id } });
    return { pagas: pend.length, total: total.toString(), financeEntryId: entry.id };
  });
}

// ── Relatórios ──
export async function porProfissional(from: Date, to: Date) {
  return ctx().db.$queryRaw<{ profissional: string; atendimentos: number; faturamento: string; comissao: string }[]>`
    SELECT p.name AS profissional, COUNT(*)::int AS atendimentos, SUM(o.total)::text AS faturamento,
           COALESCE((SELECT SUM(c.amount) FROM bel_commissions c JOIN bel_sales s2 ON s2.id = c.sale_id JOIN core_orders o2 ON o2.id = s2.order_id
                      WHERE c.professional_id = p.id AND c.status <> 'CANCELLED' AND o2.completed_at >= ${from} AND o2.completed_at < ${to}), 0)::text AS comissao
      FROM bel_sales s JOIN core_orders o ON o.id = s.order_id JOIN bel_professionals p ON p.id = s.professional_id
     WHERE s.tenant_id = ${ctx().tenantId}::uuid AND o.status = 'COMPLETED' AND o.completed_at >= ${from} AND o.completed_at < ${to}
     GROUP BY p.id, p.name ORDER BY SUM(o.total) DESC`;
}

export async function porServico(from: Date, to: Date) {
  return ctx().db.$queryRaw<{ servico: string; vezes: number; total: string }[]>`
    SELECT i.description AS servico, SUM(i.quantity)::int AS vezes, SUM(i.total)::text AS total
      FROM core_order_items i JOIN core_orders o ON o.id = i.order_id
     WHERE o.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'BELEZA' AND o.status = 'COMPLETED' AND o.completed_at >= ${from} AND o.completed_at < ${to} AND i.kind = 'SERVICE'
     GROUP BY i.description ORDER BY SUM(i.total) DESC`;
}

/** Faltas: quanto da agenda do período virou NO_SHOW (o que mais dói no salão). */
export async function faltas(from: Date, to: Date) {
  const g = await ctx().db.belAppointment.groupBy({ by: ['status'], where: { startsAt: { gte: from, lt: to } }, _count: true });
  const total = g.reduce((s, x) => s + x._count, 0);
  const noShow = g.find((x) => x.status === 'NO_SHOW')?._count ?? 0;
  return { agendados: total, faltas: noShow, taxa: total ? round2(D(noShow).div(total).mul(100)).toString() : '0', porStatus: Object.fromEntries(g.map((x) => [x.status, x._count])) };
}
