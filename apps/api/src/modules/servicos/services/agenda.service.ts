// modules/servicos/services/agenda.service.ts — a AGENDA da oficina. Horário reservado para um
// cliente/veículo; na chegada vira OS (um `POST /orders` com os dados do agendamento).
import { AppointmentStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import * as orders from '../../../core/orders/order.service';

export const agenda = (from: Date, to: Date) => ctx().db.svcAppointment.findMany({
  where: { scheduledAt: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } },
  include: { customer: { select: { name: true, phone: true } }, vehicle: { select: { plate: true, brand: true, model: true } } },
  orderBy: { scheduledAt: 'asc' },
});

export async function agendar(input: { customerId: string; vehicleId?: string; scheduledAt: Date; durationMin?: number; service?: string; notes?: string }) {
  const { db, tenantId } = ctx();
  if (input.scheduledAt < new Date()) throw AppError.validation('Horário no passado.');
  // Capacidade: config do módulo `boxes` (default 2) = quantos carros ao mesmo tempo.
  const boxes = Number((ctx().modules.get('SERVICOS') as { boxes?: number } | undefined)?.boxes ?? 2);
  const fim = new Date(input.scheduledAt.getTime() + (input.durationMin ?? 60) * 60_000);
  const sobrepostos = await db.svcAppointment.count({ where: { status: { in: ['SCHEDULED', 'CONFIRMED', 'ARRIVED'] }, scheduledAt: { lt: fim }, AND: { scheduledAt: { gte: new Date(input.scheduledAt.getTime() - 4 * 3_600_000) } } } });
  if (sobrepostos >= boxes) throw AppError.conflict(`Sem box livre nesse horário (${boxes} em uso).`);
  return db.svcAppointment.create({ data: { ...input, tenantId } });
}

export const atualizarAgendamento = (id: string, input: { scheduledAt?: Date; durationMin?: number; status?: AppointmentStatus; service?: string; notes?: string; vehicleId?: string | null }) =>
  ctx().db.svcAppointment.update({ where: { id }, data: input });

/** Cliente chegou: cria a OS a partir do agendamento e liga os dois. */
export async function chegada(id: string, extra: { mileageIn?: number; fuelLevel?: string; complaint?: string; technicianUserId?: string }) {
  const { db } = ctx();
  const a = await db.svcAppointment.findUnique({ where: { id }, include: { vehicle: true } });
  if (!a) throw AppError.notFound('Agendamento');
  if (a.orderId) throw AppError.conflict('Agendamento já virou OS.');
  const order = await orders.createOrder({
    moduleKey: 'SERVICOS', channel: 'WORKSHOP', customerId: a.customerId,
    items: a.service ? [{ kind: 'SERVICE', description: a.service, quantity: 1, unitPrice: 0, metadata: { orcamento: true } }] : [],
    notes: a.notes,
    moduleData: { vehicleId: a.vehicleId ?? undefined, complaint: extra.complaint ?? a.service, mileageIn: extra.mileageIn, fuelLevel: extra.fuelLevel, technicianUserId: extra.technicianUserId, promisedAt: undefined },
  }).catch((e) => { if (e?.code === 'VALIDATION' && /sem itens/i.test(e.message)) return null; throw e; });
  if (!order) throw AppError.validation('Informe o serviço solicitado no agendamento (ou abra a OS direto em POST /orders).');
  await db.svcAppointment.update({ where: { id }, data: { status: 'ARRIVED', orderId: order.id } });
  return order;
}
