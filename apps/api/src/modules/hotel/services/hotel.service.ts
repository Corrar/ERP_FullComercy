// modules/hotel/services/hotel.service.ts — quartos, RESERVAS por período sem sobreposição no
// mesmo quarto, governança (limpeza/manutenção), check-out e relatórios de ocupação.
// O CHECK-IN é a abertura da conta: POST /orders com moduleData.reservationId (hotel-sales.strategy).
// O consumo entra como itens no pedido (POST /orders/:id/items) e o CHECK-OUT conclui o pedido.
import { HotReservationStatus, HotRoomStatus, OrderStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction, type TenantTx } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';
import * as orders from '../../../core/orders/order.service';

const DIA = 86400000;
/** Data de calendário (meia-noite UTC), que é como `@db.Date` grava. */
export const soData = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const noites = (checkIn: Date, checkOut: Date) => Math.round((soData(checkOut).getTime() - soData(checkIn).getTime()) / DIA);
const ATIVAS: HotReservationStatus[] = ['BOOKED', 'CHECKED_IN'];

// ── Quartos ──
export const quartos = () => ctx().db.hotRoom.findMany({ orderBy: { number: 'asc' } });
type QuartoInput = { number: string; type: string; capacity: number; dailyRate: number; notes?: string };
export const criarQuarto = (input: QuartoInput) => ctx().db.hotRoom.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarQuarto = (id: string, input: Partial<QuartoInput> & { isActive?: boolean }) => ctx().db.hotRoom.update({ where: { id }, data: input });

/** Governança: limpo, em limpeza, em manutenção. OCUPADO só o check-in põe e só o check-out tira. */
export async function statusDoQuarto(id: string, status: HotRoomStatus) {
  const q = await ctx().db.hotRoom.findUnique({ where: { id } });
  if (!q) throw AppError.notFound('Quarto');
  if (status === 'OCCUPIED' || q.status === 'OCCUPIED') throw AppError.conflict('Ocupação muda só no check-in e no check-out.');
  return ctx().db.hotRoom.update({ where: { id }, data: { status } });
}

// ── Reservas ──
export const reservas = (from: Date, to: Date) => ctx().db.hotReservation.findMany({
  where: { checkIn: { lt: soData(to) }, checkOut: { gt: soData(from) } },
  include: { customer: { select: { id: true, name: true, phone: true } }, room: { select: { id: true, number: true, type: true } } },
  orderBy: [{ checkIn: 'asc' }],
});

async function garantirLivre(tx: TenantTx, roomId: string, checkIn: Date, checkOut: Date, ignorar?: string) {
  await tx.$queryRaw`SELECT id FROM hot_rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
  const choque = await tx.hotReservation.findFirst({
    where: { roomId, status: { in: ATIVAS }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn }, ...(ignorar ? { id: { not: ignorar } } : {}) },
    include: { customer: { select: { name: true } } },
  });
  if (choque) throw AppError.conflict(`Quarto reservado no período (${choque.customer.name}, ${choque.checkIn.toISOString().slice(0, 10)} a ${choque.checkOut.toISOString().slice(0, 10)}).`);
}

export async function reservar(input: { customerId: string; roomId: string; checkIn: Date; checkOut: Date; guests?: number; dailyRate?: number; source?: string; notes?: string }) {
  const { db, tenantId } = ctx();
  const checkIn = soData(input.checkIn); const checkOut = soData(input.checkOut);
  if (noites(checkIn, checkOut) < 1) throw AppError.validation('A saída tem de ser depois da entrada (mínimo uma diária).');
  return tenantTransaction(db, tenantId, async (tx) => {
    const q = await tx.hotRoom.findUnique({ where: { id: input.roomId } });
    if (!q?.isActive) throw AppError.validation('Quarto inválido ou inativo.');
    const guests = input.guests ?? 1;
    if (guests > q.capacity) throw AppError.validation(`O quarto ${q.number} acomoda ${q.capacity}.`);
    await garantirLivre(tx, q.id, checkIn, checkOut);
    return tx.hotReservation.create({ data: { tenantId, customerId: input.customerId, roomId: q.id, checkIn, checkOut, guests, dailyRate: input.dailyRate ?? q.dailyRate, source: input.source, notes: input.notes } });
  });
}

/** Remarcar (datas ou quarto) ou cancelar / não comparecimento, antes do check-in. */
export async function atualizarReserva(id: string, input: { checkIn?: Date; checkOut?: Date; roomId?: string; guests?: number; status?: 'CANCELLED' | 'NO_SHOW' | 'BOOKED'; notes?: string }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const r = await tx.hotReservation.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('Reserva');
    if (r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT') throw AppError.conflict('Hóspede já entrou: mudanças pela conta (check-out ou estorno do check-in).');
    const checkIn = input.checkIn ? soData(input.checkIn) : r.checkIn; const checkOut = input.checkOut ? soData(input.checkOut) : r.checkOut;
    if (noites(checkIn, checkOut) < 1) throw AppError.validation('A saída tem de ser depois da entrada.');
    const roomId = input.roomId ?? r.roomId;
    const status = input.status ?? r.status;
    if (status === 'BOOKED' && (input.checkIn || input.checkOut || input.roomId || r.status !== 'BOOKED')) await garantirLivre(tx, roomId, checkIn, checkOut, r.id);
    return tx.hotReservation.update({ where: { id }, data: { checkIn, checkOut, roomId, guests: input.guests, status, notes: input.notes } });
  });
}

/** Quartos livres no período (para a recepção oferecer). */
export async function disponiveis(checkIn: Date, checkOut: Date, guests = 1) {
  const { db } = ctx();
  const ocupados = await db.hotReservation.findMany({ where: { status: { in: ATIVAS }, checkIn: { lt: soData(checkOut) }, checkOut: { gt: soData(checkIn) } }, select: { roomId: true } });
  const fora = new Set(ocupados.map((o) => o.roomId));
  return (await db.hotRoom.findMany({ where: { isActive: true, capacity: { gte: guests } }, orderBy: { number: 'asc' } })).filter((q) => !fora.has(q.id));
}

/** CHECK-OUT: conclui a conta (o gancho da estratégia exige tudo pago e libera o quarto). */
export async function checkout(id: string) {
  const r = await ctx().db.hotReservation.findUnique({ where: { id } });
  if (!r) throw AppError.notFound('Reserva');
  if (r.status !== 'CHECKED_IN' || !r.orderId) throw AppError.conflict('Só sai quem entrou.');
  await orders.transition(r.orderId, OrderStatus.COMPLETED, 'Check-out');
  return ctx().db.hotReservation.findUnique({ where: { id }, include: { room: true } });
}

/** Painel do dia: mapa dos quartos, quem chega e quem sai hoje. */
export async function painel(hoje = new Date()) {
  const { db } = ctx(); const d = soData(hoje);
  const [rooms, chegam, saem, hospedados] = await Promise.all([
    db.hotRoom.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    db.hotReservation.findMany({ where: { checkIn: d, status: 'BOOKED' }, include: { customer: { select: { name: true, phone: true } }, room: { select: { number: true } } } }),
    db.hotReservation.findMany({ where: { checkOut: d, status: 'CHECKED_IN' }, include: { customer: { select: { name: true } }, room: { select: { number: true } } } }),
    db.hotReservation.findMany({ where: { status: 'CHECKED_IN' }, include: { customer: { select: { name: true } } } }),
  ]);
  const porQuarto = new Map(hospedados.map((h) => [h.roomId, h]));
  return { quartos: rooms.map((q) => ({ ...q, hospede: porQuarto.get(q.id)?.customer.name ?? null, reservaId: porQuarto.get(q.id)?.id ?? null, orderId: porQuarto.get(q.id)?.orderId ?? null, saida: porQuarto.get(q.id)?.checkOut ?? null })), chegam, saem };
}

// ── Relatórios ──
/** Ocupação, diária média (ADR) e receita por quarto disponível (RevPAR) no período [from, to). */
export async function ocupacao(from: Date, to: Date) {
  const { db } = ctx();
  const ini = soData(from); const fim = soData(to);
  const dias = Math.max(1, noites(ini, fim));
  const [qtdQuartos, rs] = await Promise.all([
    db.hotRoom.count({ where: { isActive: true } }),
    db.hotReservation.findMany({ where: { status: { in: ['CHECKED_IN', 'CHECKED_OUT'] }, checkIn: { lt: fim }, checkOut: { gt: ini } } }),
  ]);
  let vendidas = 0; let receita = D(0);
  for (const r of rs) {
    const n = noites(r.checkIn < ini ? ini : r.checkIn, r.checkOut > fim ? fim : r.checkOut);
    vendidas += n; receita = receita.plus(D(r.dailyRate).mul(n));
  }
  const disponiveis = qtdQuartos * dias;
  return {
    dias, quartos: qtdQuartos, noitesDisponiveis: disponiveis, noitesVendidas: vendidas,
    ocupacao: disponiveis ? round2(D(vendidas).div(disponiveis).mul(100)).toString() : '0',
    diariaMedia: vendidas ? round2(receita.div(vendidas)).toString() : '0',
    revpar: disponiveis ? round2(receita.div(disponiveis)).toString() : '0',
    receitaDiarias: round2(receita).toString(),
  };
}
