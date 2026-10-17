// src/core/payments/payments.service.ts — intenções de pagamento online.
// Fluxo: criar intenção (pedido ou título) → provedor devolve QR/link → cliente paga → webhook
// do provedor → `confirmPaid` → `orders.addPayments` (ou baixa do título) → evento payment.paid.
import { PaymentIntentStatus, PaymentMethod } from '@prisma/client';
import { prisma, prismaForTenant } from '../../infra/prisma';
import { ctx } from '../tenancy/tenant-context';
import { runAsTenant } from '../tenancy/run-as-tenant';
import { AppError } from '../../shared/errors';
import { D, round2 } from '../../shared/money';
import { events } from '../../shared/events';
import * as orders from '../orders/order.service';
import * as finance from '../finance/finance.service';
import { tenantTransaction } from '../../infra/prisma';
import type { PaymentProvider } from './providers/types';
import { manualProvider } from './providers/manual';
import { mockProvider } from './providers/mock';

const providers = new Map<string, PaymentProvider>([[manualProvider.key, manualProvider], [mockProvider.key, mockProvider]]);
export const registerProvider = (p: PaymentProvider) => { providers.set(p.key, p); };
export const listProviders = () => [...providers.values()].map((p) => ({ key: p.key, methods: p.methods }));
const provider = (key: string) => { const p = providers.get(key); if (!p) throw AppError.validation(`Provedor de pagamento desconhecido: ${key}`); return p; };
const providerConfig = (settings: Record<string, unknown>, key: string) => ((settings.payments as Record<string, Record<string, unknown>> | undefined)?.[key] ?? {});

export async function createIntent(input: { provider: string; method: PaymentMethod; orderId?: string; financeEntryId?: string; amount?: number }) {
  const { db, tenantId, tenantSettings } = ctx();
  const p = provider(input.provider);
  if (!p.methods.includes(input.method)) throw AppError.validation(`Provedor ${p.key} não aceita ${input.method}.`);
  if (!input.orderId && !input.financeEntryId) throw AppError.validation('Informe orderId ou financeEntryId.');

  let amount = input.amount !== undefined ? round2(D(input.amount)) : null; let description = 'Pagamento'; let payer = null as { name?: string; document?: string; email?: string } | null;
  if (input.orderId) {
    const o = await db.order.findUnique({ where: { id: input.orderId }, include: { payments: true, customer: true } });
    if (!o) throw AppError.notFound('Pedido');
    const falta = D(o.total).minus(o.payments.reduce((s, x) => s.plus(x.amount), D(0)));
    amount = amount ?? round2(falta);
    if (amount.lte(0) || amount.gt(falta)) throw AppError.validation(`Valor inválido: faltam ${falta}.`);
    description = `Pedido #${o.number}`; payer = o.customer ? { name: o.customer.name, document: o.customer.document ?? undefined, email: o.customer.email ?? undefined } : null;
  } else if (input.financeEntryId) {
    const e = await db.financeEntry.findUnique({ where: { id: input.financeEntryId }, include: { customer: true } });
    if (!e) throw AppError.notFound('Título');
    const falta = D(e.amount).minus(e.paidAmount);
    amount = amount ?? round2(falta);
    if (amount.lte(0) || amount.gt(falta)) throw AppError.validation(`Valor inválido: faltam ${falta}.`);
    description = e.description; payer = e.customer ? { name: e.customer.name } : null;
  }

  const intent = await db.paymentIntent.create({ data: { tenantId, provider: p.key, method: input.method, amount: amount!, orderId: input.orderId ?? null, financeEntryId: input.financeEntryId ?? null } });
  const r = await p.create({ tenantId, intentId: intent.id, amount: amount!.toFixed(2), method: input.method, description, payer, config: providerConfig(tenantSettings, p.key) });
  return db.paymentIntent.update({ where: { id: intent.id }, data: { externalId: r.externalId, qrCode: r.qrCode, checkoutUrl: r.checkoutUrl, expiresAt: r.expiresAt, raw: (r.raw ?? {}) as never } });
}

/** Marca como PAGO e propaga: pedido (addPayments) ou título (settle). Idempotente. */
async function confirmPaid(intentId: string, paidAt = new Date()) {
  const { db, tenantId } = ctx();
  const it = await db.paymentIntent.findUnique({ where: { id: intentId } });
  if (!it) throw AppError.notFound('Intenção');
  if (it.status === PaymentIntentStatus.PAID) return it;
  if (it.status !== PaymentIntentStatus.PENDING) throw AppError.conflict(`Intenção ${it.status}.`);
  if (it.orderId) {
    await orders.addPayments(it.orderId, [{ method: it.method, amount: D(it.amount).toNumber(), reference: `${it.provider}:${it.externalId}` }]);
  } else if (it.financeEntryId) {
    await tenantTransaction(db, tenantId, (tx) => finance.settle(tx, tenantId, { entryId: it.financeEntryId!, amount: D(it.amount), method: it.method, reference: `${it.provider}:${it.externalId}`, paidAt }));
  }
  const upd = await db.paymentIntent.update({ where: { id: intentId }, data: { status: PaymentIntentStatus.PAID, paidAt } });
  events.emit('payment.paid', { tenantId, intentId, orderId: it.orderId, amount: D(it.amount).toString(), provider: it.provider });
  return upd;
}

/** Confirmação pelo operador (provedor manual, ou conciliação à mão). */
export const confirmManual = (intentId: string) => confirmPaid(intentId);
export const cancelIntent = (intentId: string) => ctx().db.paymentIntent.update({ where: { id: intentId, status: PaymentIntentStatus.PENDING }, data: { status: PaymentIntentStatus.CANCELLED } });
export const listIntents = (filter: { orderId?: string; status?: PaymentIntentStatus }) => ctx().db.paymentIntent.findMany({ where: filter, orderBy: { createdAt: 'desc' }, take: 200 });

/** Webhook PÚBLICO do provedor: acha a intenção pelo externalId em QUALQUER tenant (client de
 *  plataforma), depois roda como aquele tenant. O provedor valida a autenticidade com a config
 *  da empresa dona da intenção. */
export async function handleWebhook(providerKey: string, headers: Record<string, string | string[] | undefined>, body: unknown) {
  const p = provider(providerKey);
  const probe = body as { externalId?: string; data?: { id?: string } };
  const externalId = probe?.externalId ?? probe?.data?.id;
  if (!externalId) throw AppError.validation('Webhook sem identificador.');
  const it = await prisma.paymentIntent.findFirst({ where: { provider: providerKey, externalId }, include: { tenant: { select: { id: true, settings: true } } } });
  if (!it) throw AppError.notFound('Intenção');
  const parsed = await p.parseWebhook({ headers, body, config: providerConfig(it.tenant.settings as Record<string, unknown>, providerKey) }).catch((e) => { throw new AppError('UNAUTHENTICATED', `Webhook rejeitado: ${e instanceof Error ? e.message : e}`); });
  return runAsTenant(it.tenantId, async () => {
    if (parsed.status === 'PAID') return confirmPaid(it.id, parsed.paidAt);
    if (parsed.status === 'PENDING') return it;
    return prismaForTenant(it.tenantId).paymentIntent.update({ where: { id: it.id, status: PaymentIntentStatus.PENDING }, data: { status: parsed.status as PaymentIntentStatus } }).catch(() => it);
  });
}

/** JOB: intenções PENDING vencidas viram EXPIRED. */
export async function expirarIntencoes() {
  const r = await prisma.paymentIntent.updateMany({ where: { status: PaymentIntentStatus.PENDING, expiresAt: { lt: new Date() } }, data: { status: PaymentIntentStatus.EXPIRED } });
  return { expiradas: r.count };
}
