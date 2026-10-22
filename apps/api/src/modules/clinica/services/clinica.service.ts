// modules/clinica/services/clinica.service.ts — profissionais, convênios, ficha do paciente
// (paciente = cliente do core), AGENDA por profissional sem sobreposição, prontuário e recibo.
// A cobrança da consulta nasce em POST /orders (clinica-sales.strategy.ts): particular paga na
// hora; convênio fica em aberto até o repasse (o pagamento entra no mesmo pedido).
import { CliAppointmentStatus, CliPayer } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction, type TenantTx } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';

// ── Cadastros ──
export const profissionais = () => ctx().db.cliProfessional.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
type ProfInput = { name: string; specialty?: string; registry?: string; defaultDurationMin?: number; defaultPrice?: number; userId?: string };
export const criarProfissional = (input: ProfInput) => ctx().db.cliProfessional.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarProfissional = (id: string, input: Partial<ProfInput> & { isActive?: boolean }) => ctx().db.cliProfessional.update({ where: { id }, data: input });

export const convenios = () => ctx().db.cliInsurance.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
export const criarConvenio = (input: { name: string; code?: string; price: number }) => ctx().db.cliInsurance.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarConvenio = (id: string, input: { name?: string; code?: string; price?: number; isActive?: boolean }) => ctx().db.cliInsurance.update({ where: { id }, data: input });

// ── Paciente ──
export async function fichaDoPaciente(customerId: string, comProntuario: boolean) {
  const { db } = ctx();
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, document: true, phone: true, email: true, birthDate: true } });
  if (!customer) throw AppError.notFound('Paciente');
  const [perfil, consultas, prontuario] = await Promise.all([
    db.cliPatientProfile.findUnique({ where: { tenantId_customerId: { tenantId: ctx().tenantId, customerId } }, include: { insurance: true } }),
    db.cliAppointment.findMany({ where: { customerId }, include: { professional: { select: { name: true } }, insurance: { select: { name: true } } }, orderBy: { startsAt: 'desc' }, take: 50 }),
    comProntuario ? db.cliRecord.findMany({ where: { customerId }, include: { professional: { select: { name: true } } }, orderBy: { date: 'desc' } }) : Promise.resolve(null),
  ]);
  return { ...customer, perfil, consultas, prontuario };
}
export async function salvarPerfil(customerId: string, input: { birthDate?: Date | null; insuranceId?: string | null; insuranceCard?: string | null; allergies?: string | null; notes?: string | null }) {
  const { db, tenantId } = ctx();
  if (!(await db.customer.findUnique({ where: { id: customerId } }))) throw AppError.notFound('Paciente');
  return db.cliPatientProfile.upsert({ where: { tenantId_customerId: { tenantId, customerId } }, create: { ...input, tenantId, customerId }, update: input });
}

// ── Agenda ──
const OCUPA: CliAppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'DONE'];
export const agenda = (from: Date, to: Date, professionalId?: string) => ctx().db.cliAppointment.findMany({
  where: { startsAt: { gte: from, lt: to }, professionalId },
  include: { customer: { select: { id: true, name: true, phone: true } }, professional: { select: { id: true, name: true, specialty: true } }, insurance: { select: { id: true, name: true } } },
  orderBy: { startsAt: 'asc' },
});

async function garantirLivre(tx: TenantTx, professionalId: string, startsAt: Date, endsAt: Date, ignorar?: string) {
  await tx.$queryRaw`SELECT id FROM cli_professionals WHERE id = ${professionalId}::uuid FOR UPDATE`;
  const choque = await tx.cliAppointment.findFirst({ where: { professionalId, status: { in: OCUPA }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(ignorar ? { id: { not: ignorar } } : {}) } });
  if (choque) throw AppError.conflict('Horário ocupado para este profissional.');
}

export async function agendar(input: { customerId: string; professionalId: string; startsAt: Date; durationMin?: number; kind?: string; payer?: CliPayer; insuranceId?: string; price?: number; notes?: string }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const prof = await tx.cliProfessional.findUnique({ where: { id: input.professionalId } });
    if (!prof?.isActive) throw AppError.validation('Profissional inválido ou inativo.');
    const payer = input.payer ?? 'PARTICULAR';
    let insuranceId: string | null = null; let price = input.price;
    if (payer === 'CONVENIO') {
      const perfil = await tx.cliPatientProfile.findUnique({ where: { tenantId_customerId: { tenantId, customerId: input.customerId } } });
      insuranceId = input.insuranceId ?? perfil?.insuranceId ?? null;
      const conv = insuranceId ? await tx.cliInsurance.findUnique({ where: { id: insuranceId } }) : null;
      if (!conv?.isActive) throw AppError.validation('Consulta por convênio: escolha o convênio (ou cadastre na ficha do paciente).');
      price ??= Number(conv.price);
    }
    price ??= Number(prof.defaultPrice);
    const endsAt = new Date(input.startsAt.getTime() + (input.durationMin ?? prof.defaultDurationMin) * 60000);
    await garantirLivre(tx, prof.id, input.startsAt, endsAt);
    return tx.cliAppointment.create({ data: { tenantId, customerId: input.customerId, professionalId: prof.id, startsAt: input.startsAt, endsAt, kind: input.kind ?? 'CONSULTA', payer, insuranceId, price, notes: input.notes } });
  });
}

const PASSOS: Partial<Record<CliAppointmentStatus, CliAppointmentStatus[]>> = {
  SCHEDULED: ['CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['SCHEDULED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
  ARRIVED: ['CONFIRMED', 'NO_SHOW'],
  NO_SHOW: ['SCHEDULED'],
  CANCELLED: ['SCHEDULED'],
};
export async function atualizarAgendamento(id: string, input: { startsAt?: Date; status?: CliAppointmentStatus; notes?: string }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const a = await tx.cliAppointment.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Consulta');
    if (a.status === 'DONE') throw AppError.conflict('Consulta já cobrada: estorne a cobrança para mexer.');
    if (input.status && input.status !== a.status && !PASSOS[a.status]?.includes(input.status)) throw AppError.validation(input.status === 'DONE' ? 'A consulta conclui na cobrança.' : `Não dá para ir de ${a.status} para ${input.status}.`);
    const startsAt = input.startsAt ?? a.startsAt;
    const endsAt = new Date(startsAt.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()));
    const ocupa = OCUPA.includes(input.status ?? a.status);
    if (ocupa && (input.startsAt || (input.status && !OCUPA.includes(a.status)))) await garantirLivre(tx, a.professionalId, startsAt, endsAt, a.id);
    return tx.cliAppointment.update({ where: { id }, data: { startsAt, endsAt, status: input.status, notes: input.notes } });
  });
}

// ── Prontuário ──
export async function registrarEvolucao(customerId: string, input: { professionalId: string; appointmentId?: string; date?: Date; anamnesis?: string; evolution?: string; prescription?: string; returnAt?: Date }) {
  const { db, tenantId, userId } = ctx();
  if (input.appointmentId) {
    const a = await db.cliAppointment.findUnique({ where: { id: input.appointmentId } });
    if (!a || a.customerId !== customerId) throw AppError.validation('A consulta é de outro paciente.');
  }
  return db.cliRecord.create({ data: { ...input, date: input.date ?? new Date(), customerId, userId, tenantId } });
}

// ── Recibo ──
export async function recibo(orderId: string) {
  const { db, tenantId } = ctx();
  const charge = await db.cliCharge.findFirst({ where: { orderId }, include: { order: { include: { items: true, payments: true, customer: { select: { name: true, document: true } } } } } });
  if (!charge) throw AppError.notFound('Cobrança da clínica');
  const [clinica, consulta] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, document: true } }),
    charge.appointmentId ? db.cliAppointment.findUnique({ where: { id: charge.appointmentId }, include: { professional: true, insurance: true } }) : null,
  ]);
  const o = charge.order;
  return {
    numero: o.number, emitidoEm: new Date(), clinica, paciente: o.customer,
    profissional: consulta ? { nome: consulta.professional.name, registro: consulta.professional.registry, especialidade: consulta.professional.specialty } : null,
    data: consulta?.startsAt ?? o.createdAt, pagador: charge.payer, convenio: consulta?.insurance?.name ?? null,
    itens: o.items.map((i) => ({ descricao: i.description, quantidade: i.quantity, total: i.total })), total: o.total,
    pago: o.payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2), status: o.status,
  };
}

// ── Relatórios ──
export const porProfissional = (from: Date, to: Date) => ctx().db.$queryRaw<{ profissional: string; consultas: number; faturado: string }[]>`
  SELECT p.name AS profissional, COUNT(*)::int AS consultas, SUM(a.price)::text AS faturado
    FROM cli_appointments a JOIN cli_professionals p ON p.id = a.professional_id
   WHERE a.tenant_id = ${ctx().tenantId}::uuid AND a.status = 'DONE' AND a.starts_at >= ${from} AND a.starts_at < ${to}
   GROUP BY p.id, p.name ORDER BY SUM(a.price) DESC`;

/** Por convênio: quanto foi atendido e quanto o convênio ainda não repassou (pedido em aberto). */
export const porConvenio = (from: Date, to: Date) => ctx().db.$queryRaw<{ convenio: string; consultas: number; faturado: string; aReceber: string }[]>`
  SELECT COALESCE(i.name, 'Particular') AS convenio, COUNT(*)::int AS consultas, SUM(o.total)::text AS faturado,
         SUM(CASE WHEN o.status = 'COMPLETED' THEN 0 ELSE o.total - COALESCE((SELECT SUM(p.amount) FROM core_order_payments p WHERE p.order_id = o.id), 0) END)::text AS "aReceber"
    FROM cli_charges c JOIN core_orders o ON o.id = c.order_id LEFT JOIN cli_insurances i ON i.id = c.insurance_id
   WHERE c.tenant_id = ${ctx().tenantId}::uuid AND o.status <> 'CANCELLED' AND o.created_at >= ${from} AND o.created_at < ${to}
   GROUP BY 1 ORDER BY SUM(o.total) DESC`;

/** Cobranças de convênio ainda abertas (a lista que a recepção confere quando o repasse chega). */
export const aReceberDeConvenio = (insuranceId?: string) => ctx().db.cliCharge.findMany({
  where: { payer: 'CONVENIO', insuranceId, order: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
  include: { order: { select: { id: true, number: true, total: true, createdAt: true, customer: { select: { name: true } }, payments: { select: { amount: true } } } } },
  orderBy: { createdAt: 'asc' },
});

export async function faltas(from: Date, to: Date) {
  const g = await ctx().db.cliAppointment.groupBy({ by: ['status'], where: { startsAt: { gte: from, lt: to } }, _count: true });
  const total = g.reduce((s, x) => s + x._count, 0); const n = g.find((x) => x.status === 'NO_SHOW')?._count ?? 0;
  return { agendadas: total, faltas: n, taxa: total ? ((n / total) * 100).toFixed(2) : '0' };
}
