// modules/beleza/services/beleza-sales.strategy.ts — como o SALÃO vende: a COMANDA do atendimento.
// Nasce aberta (o cliente está na cadeira), recebe produtos ao longo do atendimento e fecha ao
// pagar. Linha de serviço traz `metadata.serviceId`: o preço vem do cadastro, não do cliente HTTP.
// Pacote: comprar = linha com `metadata.packageId`; usar = `moduleData.customerPackageId`, que
// zera a linha do serviço do pacote e consome uma sessão. Ao CONCLUIR, gera a comissão do
// profissional (taxa do serviço, senão a do profissional; sessão de pacote comissiona pelo valor
// proporcional da sessão).
import { ModuleKey, OrderChannel, OrderStatus } from '@prisma/client';
import type { OrderDraft, PricedItem, SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2, sum } from '../../../shared/money';

interface BelModuleData { appointmentId?: string; professionalId?: string; customerPackageId?: string }
const md = (d: OrderDraft) => (d.moduleData ?? {}) as BelModuleData;
const meta = (i: { metadata: unknown }) => (i.metadata ?? {}) as { serviceId?: string; packageId?: string; packageSessionValue?: string };

export const belezaSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.BELEZA,
  name: 'Beleza · Comanda do atendimento',
  channels: [OrderChannel.SALON, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => true,

  async validate(draft) {
    const m = md(draft); const { db } = ctx();
    const compraPacote = (draft.items ?? []).some((i) => (i.metadata as { packageId?: string } | undefined)?.packageId);
    if ((m.appointmentId || m.customerPackageId || compraPacote) && !draft.customerId) throw AppError.validation('Atendimento, pacote e uso de pacote exigem o cliente.');
    if (m.appointmentId) {
      const a = await db.belAppointment.findUnique({ where: { id: m.appointmentId } });
      if (!a) throw AppError.notFound('Agendamento');
      if (a.customerId !== draft.customerId) throw AppError.validation('O agendamento é de outro cliente.');
      if (a.status !== 'SCHEDULED' && a.status !== 'CONFIRMED') throw AppError.conflict('Este horário já foi atendido, cancelado ou marcado como falta.');
    }
    if (m.professionalId) {
      const p = await db.belProfessional.findUnique({ where: { id: m.professionalId } });
      if (!p?.isActive) throw AppError.validation('Profissional inválido ou inativo.');
    }
    if (m.customerPackageId) {
      const cp = await db.belCustomerPackage.findUnique({ where: { id: m.customerPackageId } });
      if (!cp || cp.customerId !== draft.customerId) throw AppError.notFound('Pacote do cliente');
      if (cp.sessionsUsed >= cp.sessionsTotal) throw AppError.conflict('Pacote sem sessões.');
      if (cp.expiresAt < new Date()) throw AppError.conflict('Pacote vencido.');
    }
  },

  async price(items, draft) {
    const { db } = ctx(); const m = md(draft);
    // Pacote só na CRIAÇÃO (rascunho com itens). Item acrescentado depois relê o mesmo moduleData
    // (draftFromOrder) e não pode zerar de novo um serviço sem consumir sessão.
    const cp = m.customerPackageId && draft.items?.length ? await db.belCustomerPackage.findUnique({ where: { id: m.customerPackageId }, include: { package: true } }) : null;
    let sessaoUsada = false;
    const out: PricedItem[] = [];
    for (const it of items) {
      const x = meta(it);
      if (x.serviceId) {
        const s = await db.belService.findUnique({ where: { id: x.serviceId } });
        if (!s?.isActive) throw AppError.validation(`Serviço inválido: ${it.description}`);
        let unitPrice = D(s.price); const metadata: Record<string, unknown> = { ...it.metadata };
        if (cp && !sessaoUsada && cp.package.serviceId === s.id && it.quantity.eq(1)) {
          unitPrice = D(0); sessaoUsada = true;
          metadata.packageSessionValue = round2(D(cp.package.price).div(cp.package.sessions)).toString();
        }
        out.push({ ...it, description: s.name, unitPrice, metadata, total: round2(unitPrice.mul(it.quantity).minus(it.discount)) });
      } else if (x.packageId) {
        const p = await db.belPackage.findUnique({ where: { id: x.packageId }, include: { service: true } });
        if (!p?.isActive) throw AppError.validation('Pacote inválido ou inativo.');
        if (!it.quantity.eq(1)) throw AppError.validation('Pacote: um por linha.');
        out.push({ ...it, description: `Pacote ${p.name} (${p.sessions}× ${p.service.name})`, unitPrice: D(p.price), total: round2(D(p.price).minus(it.discount)) });
      } else out.push(it);
    }
    if (cp && !sessaoUsada) throw AppError.validation(`O pacote é de "${cp.package.name}": a comanda precisa ter esse serviço.`);
    return out;
  },

  async afterCreate(tx, order, items, draft) {
    const m = md(draft);
    const a = m.appointmentId ? await tx.belAppointment.findUnique({ where: { id: m.appointmentId } }) : null;
    const usouPacote = items.some((i) => meta(i).packageSessionValue !== undefined);
    if (usouPacote) {
      const r = await tx.belCustomerPackage.updateMany({ where: { id: m.customerPackageId!, sessionsUsed: { lt: tx.belCustomerPackage.fields.sessionsTotal } }, data: { sessionsUsed: { increment: 1 } } });
      if (!r.count) throw AppError.conflict('Pacote sem sessões.');
    }
    await tx.belSale.create({ data: { tenantId: order.tenantId, orderId: order.id, professionalId: m.professionalId ?? a?.professionalId ?? null, appointmentId: a?.id ?? null, customerPackageId: usouPacote ? m.customerPackageId! : null } });
    if (a) await tx.belAppointment.update({ where: { id: a.id }, data: { status: 'IN_SERVICE', orderId: order.id } });
    for (const it of items) {
      const pkg = meta(it).packageId;
      if (!pkg) continue;
      const p = await tx.belPackage.findUniqueOrThrow({ where: { id: pkg } });
      await tx.belCustomerPackage.create({ data: { tenantId: order.tenantId, customerId: order.customerId!, packageId: p.id, sessionsTotal: p.sessions, expiresAt: new Date(Date.now() + p.validityDays * 86400000), orderId: order.id } });
    }
  },

  async afterStatusChange(tx, order, _from, to) {
    const sale = await tx.belSale.findFirst({ where: { orderId: order.id }, include: { professional: true } });
    if (!sale) return;
    if (to === OrderStatus.COMPLETED) {
      if (sale.appointmentId) await tx.belAppointment.update({ where: { id: sale.appointmentId }, data: { status: 'DONE' } });
      if (!sale.professional) return;
      const linhas = await tx.orderItem.findMany({ where: { orderId: order.id, kind: 'SERVICE' } });
      const parcelas: { base: ReturnType<typeof D>; valor: ReturnType<typeof D> }[] = [];
      for (const l of linhas) {
        const x = meta(l);
        if (!x.serviceId) continue; // venda de pacote não comissiona: comissiona a sessão quando usada
        const s = await tx.belService.findUnique({ where: { id: x.serviceId } });
        const base = D(l.total).gt(0) ? D(l.total) : D(x.packageSessionValue ?? 0);
        const rate = D(s?.commissionRate ?? sale.professional.commissionRate);
        parcelas.push({ base, valor: base.mul(rate).div(100) });
      }
      const base = round2(sum(parcelas.map((p) => p.base))); const amount = round2(sum(parcelas.map((p) => p.valor)));
      if (amount.gt(0)) await tx.belCommission.create({ data: { tenantId: order.tenantId, saleId: sale.id, professionalId: sale.professional.id, baseAmount: base, rate: round2(amount.div(base).mul(100)), amount } });
    }
    if (to === OrderStatus.CANCELLED) {
      if (sale.appointmentId) await tx.belAppointment.update({ where: { id: sale.appointmentId }, data: { status: 'CONFIRMED', orderId: null } });
      if (sale.customerPackageId) await tx.belCustomerPackage.update({ where: { id: sale.customerPackageId }, data: { sessionsUsed: { decrement: 1 } } });
      const comprados = await tx.belCustomerPackage.findMany({ where: { orderId: order.id } });
      if (comprados.some((c) => c.sessionsUsed > 0)) throw AppError.conflict('Pacote desta venda já teve sessão usada: cancele os atendimentos antes.');
      await tx.belCustomerPackage.deleteMany({ where: { orderId: order.id } });
      await tx.belCommission.updateMany({ where: { saleId: sale.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    }
  },
};
