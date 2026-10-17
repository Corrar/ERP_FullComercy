// modules/academia/services/turmas.service.ts — TURMAS (aulas coletivas), sessões e reservas.
// O `schedule` da turma é a recorrência semanal; o job `gerarSessoes` materializa as sessões
// dos próximos N dias para que o aluno reserve vaga. Reservar exige acesso liberado
// (decidirAcesso): inadimplente não reserva spinning.
import { BookingStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { decidirAcesso } from './acesso.service';

interface Slot { weekday: number; time: string }

export const listarTurmas = () => ctx().db.gymClass.findMany({ where: { isActive: true }, include: { instructor: { select: { name: true } } }, orderBy: { name: 'asc' } });
export const criarTurma = (input: { name: string; instructorUserId?: string; capacity?: number; durationMin?: number; schedule?: Slot[] }) =>
  ctx().db.gymClass.create({ data: { ...input, tenantId: ctx().tenantId, schedule: (input.schedule ?? []) as never } });
export const atualizarTurma = (id: string, input: { name?: string; instructorUserId?: string | null; capacity?: number; durationMin?: number; schedule?: Slot[]; isActive?: boolean }) =>
  ctx().db.gymClass.update({ where: { id }, data: { ...input, schedule: input.schedule as never } });

/** Materializa as sessões das turmas ativas para os próximos `dias` (idempotente por turma+horário). */
export async function gerarSessoes(dias = 14, hoje = new Date()) {
  const { db, tenantId } = ctx();
  const turmas = await db.gymClass.findMany({ where: { isActive: true } });
  let criadas = 0;
  for (const t of turmas) {
    for (const slot of (t.schedule as unknown as Slot[]) ?? []) {
      for (let d = 0; d <= dias; d++) {
        const dia = new Date(hoje); dia.setDate(dia.getDate() + d); dia.setHours(0, 0, 0, 0);
        if (dia.getDay() !== slot.weekday) continue;
        const [h, m] = slot.time.split(':').map(Number);
        const startsAt = new Date(dia); startsAt.setHours(h, m, 0, 0);
        if (startsAt < hoje) continue;
        const r = await db.gymClassSession.upsert({ where: { tenantId_classId_startsAt: { tenantId, classId: t.id, startsAt } }, create: { tenantId, classId: t.id, startsAt, capacity: t.capacity }, update: {} });
        if (r.createdAt.getTime() > Date.now() - 5000) criadas++;
      }
    }
  }
  return { turmas: turmas.length, sessoesCriadas: criadas };
}

export const agenda = (from: Date, to: Date) => ctx().db.gymClassSession.findMany({
  where: { startsAt: { gte: from, lte: to }, cancelled: false },
  include: { class: { select: { name: true, durationMin: true, instructor: { select: { name: true } } } }, _count: { select: { bookings: { where: { status: { in: ['BOOKED', 'ATTENDED'] } } } } } },
  orderBy: { startsAt: 'asc' },
});

export async function reservar(sessionId: string, customerId: string) {
  const { db, tenantId } = ctx();
  const s = await db.gymClassSession.findUnique({ where: { id: sessionId }, include: { _count: { select: { bookings: { where: { status: { in: ['BOOKED', 'ATTENDED'] } } } } } } });
  if (!s || s.cancelled) throw AppError.notFound('Sessão');
  if (s.startsAt < new Date()) throw AppError.conflict('Sessão já começou.');
  if (s._count.bookings >= s.capacity) throw AppError.conflict('Turma lotada.');
  const acesso = await decidirAcesso(db, tenantId, customerId, s.startsAt);
  if (!acesso.allowed) throw new AppError('FORBIDDEN', `Aluno sem acesso: ${acesso.reason}`, acesso);
  return db.gymClassBooking.upsert({
    where: { tenantId_sessionId_customerId: { tenantId, sessionId, customerId } },
    create: { tenantId, sessionId, customerId }, update: { status: BookingStatus.BOOKED },
  });
}

export const cancelarReserva = (sessionId: string, customerId: string) =>
  ctx().db.gymClassBooking.update({ where: { tenantId_sessionId_customerId: { tenantId: ctx().tenantId, sessionId, customerId } }, data: { status: BookingStatus.CANCELLED } });

/** Chamada: marca presença (e registra check-in) ou falta. */
export async function chamada(sessionId: string, presentes: string[]) {
  const { db, tenantId } = ctx();
  const reservas = await db.gymClassBooking.findMany({ where: { sessionId, status: { in: ['BOOKED', 'ATTENDED', 'NO_SHOW'] } } });
  for (const r of reservas) {
    const veio = presentes.includes(r.customerId);
    await db.gymClassBooking.update({ where: { id: r.id }, data: { status: veio ? BookingStatus.ATTENDED : BookingStatus.NO_SHOW } });
    if (veio) await db.gymCheckIn.create({ data: { tenantId, customerId: r.customerId, source: 'MANUAL' } });
  }
  return { reservas: reservas.length, presentes: presentes.length };
}
