// src/core/billing/billing.service.ts — A ASSINATURA DO SAAS: o checkout da loja de módulos, o
// ciclo de cobrança mensal e o que a empresa pode mudar no próprio plano.
//
// ONDE ROda cada parte (e por que o client de plataforma aparece aqui):
//   • checkout: a conta do comprador ainda NÃO tem empresa — nasce uma aqui (`onboardTenant`),
//     então é plataforma por definição, como o onboarding;
//   • ciclo (`runBillingCycle`) e webhook do provedor: varrem/achavam empresas sem contexto de
//     request, como todo job;
//   • rotas da empresa (`/billing/*`): LEEM pelo `ctx().db` (RLS) e as mudanças de itens vão em
//     `tenantTransaction`. A cobrança de uma fatura (`collectInvoice`) é o MESMO caminho do job —
//     duas implementações de "cobrar" divergiriam no primeiro gateway real.
//
// Preço: SEMPRE de `catalog.ts`, recalculado aqui. O valor que o navegador mostra é exibição.
// Teste grátis: só na PRIMEIRA compra da conta (`trialUsedAt`) e de um documento (CPF/CNPJ) que
// nunca teve teste — senão bastava criar outra conta para ganhar outros 7 dias.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { BillingMethod, ModuleKey, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma, tenantTransaction } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { D } from '../../shared/money';
import { onboardTenant } from '../platform/onboarding.service';
import { issueTenantSession } from '../auth/auth.service';
import { invalidateTenantCache, enableModule, disableModule } from '../tenancy/tenant-modules.service';
import { ctx } from '../tenancy/tenant-context';
import { moduleRegistry } from '../../modules/module.registry';
import { googleMode } from '../account/google';
import { FEATURES, MODULE_OFFERS, resolveSelection, type Resolved } from './catalog';
import { addDays, addMonths, normalizeDocument } from './periods';
import { billingProvider } from './providers';
import type { Payer } from './providers/types';

/** Boleto vence 3 dias depois de emitido (prazo usual para compensar). */
const BOLETO_DUE_DAYS = 3;
/** Cartão recusado: nova tentativa a cada 24 h, até 4 no total. */
const CARD_MAX_ATTEMPTS = 4;

const serializeResolved = (r: Resolved) => ({
  modules: r.modules,
  items: r.items,
  total: r.total.toFixed(2),
});

// ── Vitrine ───────────────────────────────────────────────────────────────────────────────

/** Tudo que a loja precisa para desenhar: comércios, funções com preço, teste, meios e Google. */
export function publicCatalog() {
  return {
    modules: MODULE_OFFERS,
    // `permissions` é detalhe interno: a vitrine fala de função, não de chave.
    features: FEATURES.map(({ permissions: _p, ...f }) => f),
    trialDays: env.BILLING_TRIAL_DAYS,
    methods: ['CARD', 'BOLETO', 'PIX_AUTO'] as BillingMethod[],
    provider: env.BILLING_PROVIDER,
    google: { mode: googleMode(), clientId: env.GOOGLE_CLIENT_ID ?? null },
  };
}

export const quote = (input: { modules: ModuleKey[]; features: string[] }) => serializeResolved(resolveSelection(input));

// ── Checkout ──────────────────────────────────────────────────────────────────────────────

export interface CheckoutInput {
  company: { name: string; document: string };
  modules: ModuleKey[];
  features: string[];
  payment: { method: BillingMethod; cardToken?: string };
}

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';

async function uniqueSlug(name: string) {
  const base = slugify(name).padEnd(4, '0');
  for (let i = 0; i < 6; i++) {
    const slug = `${base}-${randomBytes(2).toString('hex')}`;
    if (!(await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new AppError('INTERNAL', 'Não foi possível gerar o identificador da empresa. Tente de novo.');
}

/** O meio de pagamento no provedor: cartão guardado ou autorização do Pix Automático pedida. */
async function setupPayment(customerId: string, payer: Payer, method: BillingMethod, cardToken: string | undefined, maxAmount: string) {
  const p = billingProvider();
  if (method === 'CARD') {
    if (!cardToken) throw AppError.validation('Informe os dados do cartão.');
    try {
      const card = await p.attachCard({ customerId, cardToken });
      return { paymentRef: card.ref, paymentInfo: { brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear } };
    } catch (e) {
      throw AppError.validation(e instanceof Error ? e.message : 'Cartão recusado.');
    }
  }
  if (method === 'PIX_AUTO') {
    const auth = await p.authorizePixAuto({ customerId, payer, maxAmount, description: 'Mensalidade do ERP' });
    return { paymentRef: auth.authorizationId, paymentInfo: { pixStatus: auth.status, pixAuthorizationQr: auth.qrCode, maxAmount } };
  }
  return { paymentRef: null, paymentInfo: {} };
}

export async function checkout(accountId: string, input: CheckoutInput, meta: { ip?: string; userAgent?: string }) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError('UNAUTHENTICATED', 'Conta não encontrada. Entre de novo.');
  const document = normalizeDocument(input.company.document);
  if (!document) throw AppError.validation('CPF ou CNPJ inválido.', { field: 'document' });
  const resolved = resolveSelection({ modules: input.modules, features: input.features });
  const total = resolved.total.toFixed(2);

  // Teste: primeira compra da conta E documento sem teste anterior.
  const docHadTrial = await prisma.subscription.findFirst({ where: { trialEndsAt: { not: null }, tenant: { document } }, select: { id: true } });
  const trial = !account.trialUsedAt && !docHadTrial && env.BILLING_TRIAL_DAYS > 0;

  // Provedor ANTES de criar qualquer linha: cartão recusado não deixa empresa órfã para trás.
  const payer: Payer = { name: input.company.name, email: account.email, document };
  const provider = billingProvider();
  const { customerId } = await provider.createCustomer(payer);
  const pay = await setupPayment(customerId, payer, input.payment.method, input.payment.cardToken, total);

  const slug = await uniqueSlug(input.company.name);
  const { tenant, adminUserId } = await onboardTenant({
    slug, name: input.company.name.trim(), document,
    adminName: account.name, adminEmail: account.email,
    // Senha descartável: logo abaixo o admin herda o hash da conta (ou fica só-Google).
    adminPassword: randomBytes(24).toString('base64url'),
    modules: resolved.modules,
    settings: { defaultSalesModule: resolved.modules[0] },
  });

  const now = new Date();
  const periodEnd = trial ? addDays(now, env.BILLING_TRIAL_DAYS) : addMonths(now, 1);
  const sub = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: adminUserId },
      data: { accountId: account.id, ...(account.passwordHash ? { passwordHash: account.passwordHash } : { passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10) }) },
    });
    await tx.tenant.update({ where: { id: tenant.id }, data: { status: trial ? 'TRIAL' : 'ACTIVE' } });
    if (trial) await tx.account.update({ where: { id: account.id }, data: { trialUsedAt: now } });
    return tx.subscription.create({
      data: {
        tenantId: tenant.id, accountId: account.id, status: trial ? 'TRIALING' : 'ACTIVE', method: input.payment.method,
        amount: D(total), trialEndsAt: trial ? periodEnd : null, currentPeriodStart: now, currentPeriodEnd: periodEnd,
        provider: provider.key, providerCustomerId: customerId, paymentRef: pay.paymentRef, paymentInfo: pay.paymentInfo as Prisma.InputJsonValue,
        // Aninhado sob FK composta: o `tenantId` vem do pai (passar de novo é erro do Prisma).
        items: { create: resolved.items.map((i) => ({ featureKey: i.key, moduleKey: i.module, label: i.label, price: D(i.price) })) },
      },
    });
  });

  // Sem teste, a primeira mensalidade é cobrada agora (cartão debita; boleto/Pix geram o título).
  let firstInvoice = null;
  if (!trial) {
    const inv = await prisma.invoice.create({
      data: { tenantId: tenant.id, subscriptionId: sub.id, amount: D(total), method: sub.method, periodStart: now, periodEnd, dueAt: sub.method === 'BOLETO' ? addDays(now, BOLETO_DUE_DAYS) : now },
    });
    firstInvoice = await collectInvoice(inv.id);
  }
  invalidateTenantCache(tenant.id);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
  return {
    trial,
    trialEndsAt: trial ? periodEnd : null,
    amount: total,
    subscriptionId: sub.id,
    firstInvoice: firstInvoice && invoiceView(firstInvoice),
    paymentInfo: pay.paymentInfo,
    session: await issueTenantSession(user, tenant, meta),
  };
}

// ── Cobrança de uma fatura (job, rota "pagar agora", troca de cartão) ────────────────────

type InvoiceRow = Prisma.InvoiceGetPayload<object>;
export const invoiceView = (i: InvoiceRow) => ({
  id: i.id, amount: i.amount.toFixed(2), status: i.status, method: i.method, periodStart: i.periodStart, periodEnd: i.periodEnd,
  dueAt: i.dueAt, paidAt: i.paidAt, attempts: i.attempts, failureReason: i.failureReason, boletoUrl: i.boletoUrl, boletoLine: i.boletoLine, pixCode: i.pixCode,
});

/** Tenta receber a fatura pelo meio atual da assinatura. Devolve a fatura atualizada. */
export async function collectInvoice(invoiceId: string): Promise<InvoiceRow> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { subscription: { include: { tenant: true, account: true } } } });
  if (inv.status === 'PAID' || inv.status === 'VOID') return inv;
  const sub = inv.subscription;
  const p = billingProvider(sub.provider);
  const description = `Mensalidade ${sub.tenant.name} · ${inv.periodStart.toISOString().slice(0, 10)}`;
  const amount = inv.amount.toFixed(2);
  const customerId = sub.providerCustomerId ?? '';

  if (sub.method === 'CARD') {
    if (!sub.paymentRef) return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', method: 'CARD', failureReason: 'Nenhum cartão cadastrado.' } });
    const r = await p.chargeCard({ customerId, cardRef: sub.paymentRef, amount, description, invoiceId: inv.id });
    if (r.ok) return markInvoicePaid(inv.id, r.providerRef);
    return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', method: 'CARD', attempts: { increment: 1 }, failureReason: r.failureReason ?? 'Cartão recusado.', providerRef: r.providerRef } });
  }
  if (sub.method === 'BOLETO') {
    const dueAt = inv.dueAt < new Date() ? addDays(new Date(), BOLETO_DUE_DAYS) : inv.dueAt;
    const b = await p.createBoleto({ customerId, payer: { name: sub.tenant.name, email: sub.account.email, document: sub.tenant.document }, amount, dueAt, description, invoiceId: inv.id });
    return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'OPEN', method: 'BOLETO', dueAt, attempts: { increment: 1 }, providerRef: b.providerRef, boletoUrl: b.url, boletoLine: b.line, pixCode: b.pixCode ?? null, failureReason: null } });
  }
  // PIX_AUTO
  if (!sub.paymentRef) return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', method: 'PIX_AUTO', failureReason: 'Pix Automático não autorizado.' } });
  const r = await p.chargePixAuto({ authorizationId: sub.paymentRef, amount, dueAt: inv.dueAt, description, invoiceId: inv.id });
  if (r.status === 'PAID') return markInvoicePaid(inv.id, r.providerRef);
  return prisma.invoice.update({
    where: { id: inv.id },
    data: { status: r.status === 'FAILED' ? 'FAILED' : 'OPEN', method: 'PIX_AUTO', attempts: { increment: 1 }, providerRef: r.providerRef, pixCode: r.pixCode ?? null, failureReason: r.failureReason ?? null },
  });
}

/** Recebeu: fatura paga, assinatura em dia, e a empresa volta se foi a COBRANÇA que a suspendeu. */
export async function markInvoicePaid(invoiceId: string, providerRef?: string) {
  const inv = await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt: new Date(), failureReason: null, ...(providerRef ? { providerRef } : {}) } });
  const stillOpen = await prisma.invoice.count({ where: { subscriptionId: inv.subscriptionId, status: { in: ['OPEN', 'FAILED'] }, dueAt: { lt: new Date() } } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: inv.subscriptionId } });
  if (!stillOpen && sub.status !== 'CANCELED') {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', pastDueSince: null, suspendedByBilling: false } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } });
    if ((sub.suspendedByBilling && tenant.status === 'SUSPENDED') || tenant.status === 'TRIAL') {
      await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: 'ACTIVE' } });
    }
    invalidateTenantCache(sub.tenantId);
  }
  return inv;
}

// ── O ciclo (job `core.billing-cycle`) ───────────────────────────────────────────────────

/**
 * Uma passada do faturamento. `now` é parâmetro para o e2e "viajar no tempo" sem relógio falso.
 *   1. período vencido → nova fatura e cobrança (fim do teste vira a 1ª cobrança); cancelamento
 *      pedido → encerra no fim do período;
 *   2. cartão recusado → nova tentativa a cada 24 h, até 4;
 *   3. fatura vencida sem pagamento → assinatura PAST_DUE;
 *   4. PAST_DUE além da carência → empresa SUSPENDED (só as rotas de assinatura seguem abertas).
 */
export async function runBillingCycle(now = new Date()) {
  const out = { renewed: 0, canceled: 0, retried: 0, pastDue: 0, suspended: 0 };

  const due = await prisma.subscription.findMany({ where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: now } }, include: { items: true } });
  for (const sub of due) {
    if (sub.cancelAtPeriodEnd) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED', canceledAt: now } });
      await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: 'CANCELLED' } });
      invalidateTenantCache(sub.tenantId);
      out.canceled++;
      continue;
    }
    const start = sub.currentPeriodEnd;
    const end = addMonths(start, 1);
    const amount = sub.items.reduce((a, i) => a.plus(i.price), D(0));
    // Avança o período ANTES de cobrar: se o processo cair no meio, a próxima passada não gera
    // uma segunda fatura do mesmo período.
    const advanced = await prisma.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
      data: { currentPeriodStart: start, currentPeriodEnd: end, amount, ...(sub.status === 'TRIALING' ? { status: 'ACTIVE' } : {}) },
    });
    if (!advanced.count) continue; // outra instância já pegou
    const inv = await prisma.invoice.create({
      data: { tenantId: sub.tenantId, subscriptionId: sub.id, amount, method: sub.method, periodStart: start, periodEnd: end, dueAt: sub.method === 'BOLETO' ? addDays(now, BOLETO_DUE_DAYS) : now },
    });
    await collectInvoice(inv.id);
    if (sub.status === 'TRIALING') { await prisma.tenant.updateMany({ where: { id: sub.tenantId, status: 'TRIAL' }, data: { status: 'ACTIVE' } }); invalidateTenantCache(sub.tenantId); }
    out.renewed++;
  }

  const retry = await prisma.invoice.findMany({ where: { status: 'FAILED', method: 'CARD', attempts: { lt: CARD_MAX_ATTEMPTS }, updatedAt: { lte: addDays(now, -1) }, subscription: { method: 'CARD', status: { not: 'CANCELED' } } }, select: { id: true } });
  for (const i of retry) { await collectInvoice(i.id); out.retried++; }

  const overdue = await prisma.invoice.findMany({ where: { status: { in: ['OPEN', 'FAILED'] }, dueAt: { lt: now }, subscription: { status: { in: ['ACTIVE', 'TRIALING'] } } }, select: { subscriptionId: true, dueAt: true } });
  for (const i of overdue) {
    await prisma.subscription.update({ where: { id: i.subscriptionId }, data: { status: 'PAST_DUE', pastDueSince: i.dueAt } });
    out.pastDue++;
  }

  const limit = addDays(now, -env.BILLING_GRACE_DAYS);
  const late = await prisma.subscription.findMany({ where: { status: 'PAST_DUE', pastDueSince: { lte: limit }, suspendedByBilling: false, tenant: { status: { in: ['ACTIVE', 'TRIAL'] } } } });
  for (const s of late) {
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'SUSPENDED' } }),
      prisma.subscription.update({ where: { id: s.id }, data: { suspendedByBilling: true } }),
    ]);
    invalidateTenantCache(s.tenantId);
    out.suspended++;
  }
  return out;
}

// ── Webhook do provedor ───────────────────────────────────────────────────────────────────

export async function handleWebhook(providerKey: string, headers: Record<string, string | string[] | undefined>, body: unknown) {
  let p;
  try { p = billingProvider(providerKey); } catch { throw AppError.notFound('Provedor'); }
  let ev;
  try { ev = await p.parseWebhook({ headers, body }); } catch (e) { throw new AppError('UNAUTHENTICATED', e instanceof Error ? e.message : 'webhook inválido'); }

  if (ev.kind === 'invoice') {
    const inv = await prisma.invoice.findFirst({ where: { providerRef: ev.providerRef, subscription: { provider: providerKey } } });
    if (!inv) throw AppError.notFound('Fatura');
    if (ev.status === 'PAID') await markInvoicePaid(inv.id);
    else if (inv.status !== 'PAID') await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', failureReason: 'Pagamento não confirmado pelo banco.' } });
    return { ok: true, invoiceId: inv.id };
  }
  const sub = await prisma.subscription.findFirst({ where: { paymentRef: ev.authorizationId, provider: providerKey } });
  if (!sub) throw AppError.notFound('Assinatura');
  const info = { ...(sub.paymentInfo as Record<string, unknown>), pixStatus: ev.status };
  await prisma.subscription.update({ where: { id: sub.id }, data: { paymentInfo: info as Prisma.InputJsonValue } });
  // Autorizou com mensalidade em aberto: o débito automático já pode levar.
  if (ev.status === 'AUTHORIZED') {
    const open = await prisma.invoice.findMany({ where: { subscriptionId: sub.id, status: { in: ['OPEN', 'FAILED'] } }, select: { id: true } });
    for (const i of open) await collectInvoice(i.id);
  }
  return { ok: true, subscriptionId: sub.id };
}

// ── O que a empresa vê e muda (rotas /billing, permissão core.billing:manage) ─────────────

async function mySubscription() {
  const sub = await ctx().db.subscription.findFirst({ where: { tenantId: ctx().tenantId }, include: { items: { orderBy: { createdAt: 'asc' } } } });
  if (!sub) throw AppError.notFound('Assinatura (esta empresa não foi contratada pela loja de módulos)');
  return sub;
}

export async function getSubscription() {
  const sub = await mySubscription();
  const invoices = await ctx().db.invoice.findMany({ where: { tenantId: ctx().tenantId, subscriptionId: sub.id }, orderBy: { createdAt: 'desc' }, take: 24 });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId }, select: { status: true, name: true, document: true } });
  return {
    id: sub.id, status: sub.status, method: sub.method, amount: sub.amount.toFixed(2),
    trialEndsAt: sub.trialEndsAt, currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd, pastDueSince: sub.pastDueSince, paymentInfo: sub.paymentInfo,
    tenant,
    modules: [...new Set(sub.items.map((i) => i.moduleKey).filter((m): m is ModuleKey => !!m))],
    items: sub.items.map((i) => ({ key: i.featureKey, module: i.moduleKey, label: i.label, price: i.price.toFixed(2) })),
    invoices: invoices.map(invoiceView),
  };
}

/** Liga/desliga funções. Vale NA HORA para o acesso; o novo valor entra na próxima fatura (sem
 *  proporcional nesta versão — a tela avisa). Preço da função nova: o do catálogo de hoje; a que
 *  já estava mantém o preço contratado. */
export async function changeFeatures(input: { modules: ModuleKey[]; features: string[] }) {
  const sub = await mySubscription();
  const tenantId = ctx().tenantId;
  const resolved = resolveSelection(input);
  const keep = new Map(sub.items.map((i) => [i.featureKey, i]));
  const next = new Set(resolved.items.map((i) => i.key));

  const amount = await tenantTransaction(ctx().db, tenantId, async (tx) => {
    await tx.subscriptionItem.deleteMany({ where: { tenantId, subscriptionId: sub.id, featureKey: { notIn: [...next] } } });
    const add = resolved.items.filter((i) => !keep.has(i.key));
    if (add.length) await tx.subscriptionItem.createMany({ data: add.map((i) => ({ tenantId, subscriptionId: sub.id, featureKey: i.key, moduleKey: i.module, label: i.label, price: D(i.price) })) });
    const items = await tx.subscriptionItem.findMany({ where: { tenantId, subscriptionId: sub.id } });
    const total = items.reduce((a: Prisma.Decimal, i: { price: Prisma.Decimal }) => a.plus(i.price), D(0));
    await tx.subscription.update({ where: { id: sub.id }, data: { amount: total } });
    return total;
  });

  // Módulos seguem o plano: módulo com função contratada liga (com a semente), sem função desliga.
  const active = await prisma.tenantModule.findMany({ where: { tenantId, enabled: true }, select: { moduleKey: true } });
  for (const m of resolved.modules) if (!active.some((a) => a.moduleKey === m)) { await enableModule(tenantId, m); await moduleRegistry.get(m)?.onEnable?.(tenantId); }
  for (const a of active) if (!resolved.modules.includes(a.moduleKey)) await disableModule(tenantId, a.moduleKey);
  invalidateTenantCache(tenantId);
  return { ...(await getSubscription()), amount: amount.toFixed(2) };
}

export async function changePaymentMethod(input: { method: BillingMethod; cardToken?: string }) {
  const sub = await mySubscription();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } });
  const account = await prisma.account.findUniqueOrThrow({ where: { id: sub.accountId } });
  const payer: Payer = { name: tenant.name, email: account.email, document: tenant.document };
  const pay = await setupPayment(sub.providerCustomerId ?? '', payer, input.method, input.cardToken, sub.amount.toFixed(2));
  await prisma.subscription.update({ where: { id: sub.id }, data: { method: input.method, paymentRef: pay.paymentRef, paymentInfo: pay.paymentInfo as Prisma.InputJsonValue } });
  // Trocou o meio com mensalidade pendente: tenta de novo já pelo meio novo.
  const open = await prisma.invoice.findMany({ where: { subscriptionId: sub.id, status: { in: ['OPEN', 'FAILED'] } }, select: { id: true } });
  for (const i of open) await collectInvoice(i.id);
  return getSubscription();
}

export async function payInvoice(invoiceId: string) {
  const sub = await mySubscription();
  const inv = await ctx().db.invoice.findFirst({ where: { tenantId: ctx().tenantId, id: invoiceId, subscriptionId: sub.id } });
  if (!inv) throw AppError.notFound('Fatura');
  if (inv.status === 'PAID') throw AppError.conflict('Esta fatura já está paga.');
  return invoiceView(await collectInvoice(inv.id));
}

export async function cancel() {
  const sub = await mySubscription();
  if (sub.status === 'CANCELED') throw AppError.conflict('A assinatura já está cancelada.');
  await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
  return getSubscription();
}

export async function reactivate() {
  const sub = await mySubscription();
  if (sub.status === 'CANCELED') {
    // Já encerrada: volta com período novo a partir de hoje e cobra o primeiro mês.
    const now = new Date();
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', cancelAtPeriodEnd: false, canceledAt: null, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1) } });
    await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: 'ACTIVE' } });
    const inv = await prisma.invoice.create({ data: { tenantId: sub.tenantId, subscriptionId: sub.id, amount: sub.amount, method: sub.method, periodStart: now, periodEnd: addMonths(now, 1), dueAt: sub.method === 'BOLETO' ? addDays(now, BOLETO_DUE_DAYS) : now } });
    await collectInvoice(inv.id);
    invalidateTenantCache(sub.tenantId);
  } else {
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
  }
  return getSubscription();
}
