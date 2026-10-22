// modules/clinica/services/clinica-sales.strategy.ts — como a CLÍNICA cobra: a consulta vira pedido.
// A linha da consulta traz `metadata.appointmentId` e o valor da agenda (do convênio ou do
// profissional), não o do cliente HTTP. Particular paga na criação e conclui; convênio nasce em
// aberto e conclui quando o repasse entra como pagamento. Retorno de valor zero conclui na hora.
import { ModuleKey, OrderChannel, OrderStatus } from '@prisma/client';
import type { OrderDraft, SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';

const md = (d: OrderDraft) => (d.moduleData ?? {}) as { appointmentId?: string };
const consultaDe = (i: { metadata: unknown }) => ((i.metadata ?? {}) as { appointmentId?: string }).appointmentId;
const NOME: Record<string, string> = { CONSULTA: 'Consulta', RETORNO: 'Retorno', EXAME: 'Exame', PROCEDIMENTO: 'Procedimento' };

export const clinicaSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.CLINICA,
  name: 'Clínica · Cobrança da consulta',
  channels: [OrderChannel.CLINIC, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => true,

  async validate(draft) {
    const m = md(draft);
    if (!m.appointmentId) return;
    const a = await ctx().db.cliAppointment.findUnique({ where: { id: m.appointmentId } });
    if (!a) throw AppError.notFound('Consulta');
    if (a.customerId !== draft.customerId) throw AppError.validation('A consulta é de outro paciente.');
    if (a.orderId || !['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(a.status)) throw AppError.conflict('Consulta já cobrada, cancelada ou com falta.');
  },

  async price(items, draft) {
    const m = md(draft); const { db } = ctx();
    return Promise.all(items.map(async (it) => {
      const aid = consultaDe(it);
      if (!aid) return it;
      if (aid !== m.appointmentId) throw AppError.validation('Linha de consulta sem a consulta no pedido (moduleData.appointmentId).');
      const a = await db.cliAppointment.findUniqueOrThrow({ where: { id: aid }, include: { professional: true, insurance: true } });
      const unitPrice = D(a.price);
      const quem = a.payer === 'CONVENIO' ? ` · ${a.insurance?.name}` : '';
      return { ...it, description: `${NOME[a.kind] ?? a.kind} — ${a.professional.name}${quem}`, quantity: D(1), unitPrice, total: round2(unitPrice.minus(it.discount)) };
    }));
  },

  async afterCreate(tx, order, _items, draft) {
    const m = md(draft);
    const a = m.appointmentId ? await tx.cliAppointment.findUnique({ where: { id: m.appointmentId } }) : null;
    await tx.cliCharge.create({ data: { tenantId: order.tenantId, orderId: order.id, appointmentId: a?.id ?? null, payer: a?.payer ?? 'PARTICULAR', insuranceId: a?.insuranceId ?? null } });
    if (a) {
      const r = await tx.cliAppointment.updateMany({ where: { id: a.id, orderId: null }, data: { status: 'DONE', orderId: order.id } });
      if (!r.count) throw AppError.conflict('Consulta já cobrada.');
    }
  },

  async afterStatusChange(tx, order, _from, to) {
    if (to !== OrderStatus.CANCELLED) return;
    const c = await tx.cliCharge.findFirst({ where: { orderId: order.id } });
    if (c?.appointmentId) await tx.cliAppointment.update({ where: { id: c.appointmentId }, data: { status: 'ARRIVED', orderId: null } });
  },
};
