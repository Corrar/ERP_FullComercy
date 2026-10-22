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
import { D, round2 } from '../../shared/money';
import { onboardTenant } from '../platform/onboarding.service';
import { issueTenantSession } from '../auth/auth.service';
import { invalidateTenantCache, enableModule, disableModule } from '../tenancy/tenant-modules.service';
import { ctx } from '../tenancy/tenant-context';
import { semearModulo } from '../rbac/role-templates';
import { enviarBoasVindas } from './boas-vindas';
import { avisarFaturaAberta, avisarPagamentoRecebido, avisarPagamentoRecusado, avisarSuspensa, avisarTesteAcabando, CARD_MAX_ATTEMPTS } from './avisos';
import { googleMode } from '../account/google';
import { FEATURES, MODULE_OFFERS, resolveSelection, type Resolved } from './catalog';
import { addDays, addMonths, normalizeDocument } from './periods';
import { billingProvider } from './providers';
import type { BillingProvider, Payer } from './providers/types';

/** Boleto vence 3 dias depois de emitido (prazo usual para compensar). */
const BOLETO_DUE_DAYS = 3;
/** Aviso de fim do teste sai quando faltam até 2 dias. */
const TRIAL_NOTICE_DAYS = 2;
// Cartão recusado: nova tentativa a cada 24 h, até CARD_MAX_ATTEMPTS (4) no total — o número mora em
// avisos.ts, que avisa na primeira e na última.

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
    // `permissions` vai junto de propósito: a PRÉVIA do ERP filtra o menu com as mesmas chaves que
    // o menu real usa (`can(perm)`) — um segundo mapeamento "função → tela" no front divergiria.
    features: FEATURES,
    trialDays: env.BILLING_TRIAL_DAYS,
    // Só o que o gateway configurado sabe cobrar (Stripe nesta conta: cartão).
    methods: [...billingProvider().methods],
    provider: env.BILLING_PROVIDER,
    /// Chave PUBLICÁVEL do Stripe (pública por definição): o navegador monta o campo do cartão com ela.
    stripe: env.BILLING_PROVIDER === 'stripe' ? { publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null } : null,
    /// Cloudflare Turnstile: o navegador desenha o desafio com a chave do SITE (pública).
    security: { turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null },
    /// A loja mostra "ambiente de demonstração: pagamento simulado" fora de produção.
    stage: env.APP_STAGE,
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
async function setupPayment(p: BillingProvider, customerId: string, payer: Payer, method: BillingMethod, cardToken: string | undefined, maxAmount: string) {
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
  if (!billingProvider().methods.includes(input.payment.method)) throw AppError.validation('Forma de pagamento indisponível neste momento.', { method: input.payment.method });

  // Teste: primeira compra da conta E documento sem teste anterior.
  const docHadTrial = await prisma.subscription.findFirst({ where: { trialEndsAt: { not: null }, tenant: { document } }, select: { id: true } });
  const trial = !account.trialUsedAt && !docHadTrial && env.BILLING_TRIAL_DAYS > 0;

  // Provedor ANTES de criar qualquer linha: cartão recusado não deixa empresa órfã para trás.
  const payer: Payer = { name: input.company.name, email: account.email, document };
  const provider = billingProvider();
  const { customerId } = await provider.createCustomer(payer);
  const pay = await setupPayment(provider, customerId, payer, input.payment.method, input.payment.cardToken, total);

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
  // Dados de acesso por e-mail (com link para definir a senha; senha nunca vai no e-mail).
  await enviarBoasVindas({ tenantId: tenant.id, slug: tenant.slug, adminUserId, nome: account.name, email: account.email, temSenha: !!account.passwordHash, modulos: resolved.modules, funcoes: resolved.items.map((i) => i.label), total, trialAte: trial ? periodEnd : null });

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
  dueAt: i.dueAt, paidAt: i.paidAt, attempts: i.attempts, failureReason: i.failureReason, boletoUrl: i.boletoUrl, boletoLine: i.boletoLine, pixCode: i.pixCode, note: i.note,
});

/**
 * Tenta receber a fatura pelo meio atual da assinatura. Devolve a fatura atualizada. Todo caminho
 * de cobrança passa por aqui (checkout, ciclo, nova tentativa, "pagar agora", troca de cartão): é
 * aqui que sai o aviso de recusa ou de boleto gerado (o de pagamento recebido sai em markInvoicePaid).
 */
export async function collectInvoice(invoiceId: string): Promise<InvoiceRow> {
  const inv = await cobrar(invoiceId);
  if (inv.status === 'FAILED') await avisarPagamentoRecusado(inv);
  else if (inv.status === 'OPEN') await avisarFaturaAberta(inv);
  return inv;
}

async function cobrar(invoiceId: string): Promise<InvoiceRow> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { subscription: { include: { tenant: true, account: true } } } });
  if (inv.status === 'PAID' || inv.status === 'VOID') return inv;
  const sub = inv.subscription;
  const p = billingProvider(sub.provider);
  const description = `Mensalidade ${sub.tenant.name} · ${inv.periodStart.toISOString().slice(0, 10)}`;
  const amount = inv.amount.toFixed(2);
  const customerId = sub.providerCustomerId ?? '';

  if (sub.method === 'CARD') {
    if (!sub.paymentRef) return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', method: 'CARD', failureReason: 'Nenhum cartão cadastrado.' } });
    const r = await p.chargeCard({ customerId, cardRef: sub.paymentRef, amount, description, invoiceId: inv.id, attempt: inv.attempts + 1 });
    if (r.ok) return markInvoicePaid(inv.id, r.providerRef);
    // Aceito e ainda não liquidado: fica em aberto com a referência; o webhook fecha.
    if (r.pending) return prisma.invoice.update({ where: { id: inv.id }, data: { status: 'OPEN', method: 'CARD', attempts: { increment: 1 }, providerRef: r.providerRef, failureReason: null } });
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
  // Idempotente: o gateway confirma pela resposta da cobrança E pelo webhook; a segunda não muda nada.
  const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (before.status === 'PAID') return before;
  const inv = await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt: new Date(), failureReason: null, ...(providerRef ? { providerRef } : {}) } });
  const stillOpen = await prisma.invoice.count({ where: { subscriptionId: inv.subscriptionId, status: { in: ['OPEN', 'FAILED'] }, dueAt: { lt: new Date() } } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: inv.subscriptionId } });
  let reativou = false;
  if (!stillOpen && sub.status !== 'CANCELED') {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', pastDueSince: null, suspendedByBilling: false } });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } });
    reativou = sub.suspendedByBilling && tenant.status === 'SUSPENDED';
    if (reativou || tenant.status === 'TRIAL') {
      await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: 'ACTIVE' } });
    }
    invalidateTenantCache(sub.tenantId);
  }
  await avisarPagamentoRecebido(inv, reativou);
  return inv;
}

// ── O ciclo (job `core.billing-cycle`) ───────────────────────────────────────────────────

/**
 * Uma passada do faturamento. `now` é parâmetro para o e2e "viajar no tempo" sem relógio falso.
 *   0. teste grátis acabando em até 2 dias → aviso por e-mail (uma vez por período);
 *   1. período vencido → nova fatura e cobrança (fim do teste vira a 1ª cobrança); cancelamento
 *      pedido → encerra no fim do período;
 *   2. cartão recusado → nova tentativa a cada 24 h, até 4;
 *   3. fatura vencida sem pagamento → assinatura PAST_DUE;
 *   4. PAST_DUE além da carência → empresa SUSPENDED (só as rotas de assinatura seguem abertas).
 * Recusa, boleto gerado, pagamento recebido e suspensão também viram e-mail (avisos.ts).
 */
export async function runBillingCycle(now = new Date()) {
  const out = { renewed: 0, canceled: 0, retried: 0, pastDue: 0, suspended: 0 };

  // 0. Teste grátis terminando nos próximos 2 dias: avisa quando, quanto e por onde vai cobrar.
  const acabando = await prisma.subscription.findMany({ where: { status: 'TRIALING', cancelAtPeriodEnd: false, currentPeriodEnd: { gt: now, lte: addDays(now, TRIAL_NOTICE_DAYS) } }, select: { id: true } });
  for (const s of acabando) await avisarTesteAcabando(s.id);

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
    await avisarSuspensa(s.id);
    out.suspended++;
  }
  return out;
}

// ── Webhook do provedor ───────────────────────────────────────────────────────────────────

export async function handleWebhook(providerKey: string, headers: Record<string, string | string[] | undefined>, body: unknown, rawBody?: Buffer) {
  let p;
  try { p = billingProvider(providerKey); } catch { throw AppError.notFound('Provedor'); }
  let ev;
  try { ev = await p.parseWebhook({ headers, body, rawBody }); } catch (e) { throw new AppError('UNAUTHENTICATED', e instanceof Error ? e.message : 'webhook inválido'); }

  if (ev.kind === 'ignored') return { ok: true, ignored: ev.type };
  if (ev.kind === 'invoice') {
    const inv = await prisma.invoice.findFirst({ where: { providerRef: ev.providerRef, subscription: { provider: providerKey } } });
    // Evento autêntico de cobrança que não é nossa (outro produto na mesma conta Stripe): 200 e nada.
    // Um 404 faria o gateway reenviar por dias.
    if (!inv) return { ok: true, ignored: 'fatura desconhecida' };
    if (ev.status === 'PAID') await markInvoicePaid(inv.id);
    else if (inv.status !== 'PAID') await avisarPagamentoRecusado(await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'FAILED', failureReason: 'Pagamento não confirmado pelo banco.' } }));
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

// ── Cartão com autenticação do banco (Stripe) ─────────────────────────────────────────────

/** Preparo do cartão na COMPRA: ainda não há Customer (ele nasce no checkout, que prende o cartão). */
export async function cardSetupForCheckout() {
  const p = billingProvider();
  if (!p.createCardSetup) throw AppError.validation('Este gateway não usa preparo de cartão.');
  return p.createCardSetup({ customerId: null });
}

/** Preparo do cartão na TROCA de forma de pagamento: já existe Customer; o cartão nasce preso a ele. */
export async function cardSetupForTenant() {
  const sub = await mySubscription();
  const p = billingProvider();
  if (!p.createCardSetup) throw AppError.validation('Este gateway não usa preparo de cartão.');
  // Customer só se a assinatura já é deste gateway; senão o cartão nasce solto e a troca o prende
  // ao Customer novo (mesmo caminho do checkout).
  return p.createCardSetup({ customerId: sub.provider === p.key ? sub.providerCustomerId : null });
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
// ── Proporcional (pro rata) ao ligar função no meio do período ──────────────────────────────

/** Mínimo cobrável: o do Stripe em BRL. Abaixo disso a diferença fica por nossa conta. */
const PRORATA_MIN = D('0.50');
const DIA_MS = 86_400_000;
export type Proporcional = { valor: string; dias: number; diasPeriodo: number; funcoes: string[]; motivo?: 'teste' | 'sem_novas' | 'nao_ativa' | 'abaixo_minimo' };

/**
 * Quanto cobrar AGORA pelas funções que entram: o preço delas × dias que faltam ÷ dias do período,
 * em dias inteiros (hoje conta). Só com o mês pago correndo (ACTIVE): no teste grátis nada é
 * cobrado. Função que sai não devolve nada do mês em curso; o valor menor vale na próxima fatura.
 */
export function calcularProporcional(
  sub: { status: string; currentPeriodStart: Date; currentPeriodEnd: Date; items: { featureKey: string }[] },
  resolved: Resolved, now = new Date(),
): Proporcional {
  const novas = resolved.items.filter((i) => !sub.items.some((x) => x.featureKey === i.key));
  const funcoes = novas.map((i) => i.label);
  const zero = (motivo: Proporcional['motivo'], dias = 0, diasPeriodo = 0): Proporcional => ({ valor: '0.00', dias, diasPeriodo, funcoes, motivo });
  if (!novas.length) return zero('sem_novas');
  if (sub.status === 'TRIALING') return zero('teste');
  if (sub.status !== 'ACTIVE') return zero('nao_ativa');
  const diasPeriodo = Math.max(1, Math.round((sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / DIA_MS));
  const dias = Math.min(diasPeriodo, Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / DIA_MS)));
  const valor = round2(novas.reduce((a, i) => a.plus(i.price), D(0)).times(dias).div(diasPeriodo));
  if (valor.lt(PRORATA_MIN)) return zero('abaixo_minimo', dias, diasPeriodo);
  return { valor: valor.toFixed(2), dias, diasPeriodo, funcoes };
}

/** O que a troca de funções faria, sem fazer: novo valor mensal e o proporcional de agora. */
export async function previewFeatures(input: { modules: ModuleKey[]; features: string[] }) {
  const sub = await mySubscription();
  const resolved = resolveSelection(input);
  return { novoValor: resolved.total.toFixed(2), valorAtual: sub.amount.toFixed(2), proporcional: calcularProporcional(sub, resolved) };
}

const notaProporcional = (p: Proporcional) => `Proporcional: ${p.funcoes.join(', ')} · ${p.dias} de ${p.diasPeriodo} dias`.slice(0, 200);

export async function changeFeatures(input: { modules: ModuleKey[]; features: string[] }) {
  const sub = await mySubscription();
  const tenantId = ctx().tenantId;
  const resolved = resolveSelection(input);

  // Cartão: cobra o proporcional ANTES de ligar. Recusou → nada muda e a pessoa vê o motivo (sem
  // e-mail de recusa: ela está na tela). Boleto/Pix: liga e gera a fatura, que segue o fluxo normal.
  const prop = calcularProporcional(sub, resolved);
  let faturaProp: InvoiceRow | null = null;
  if (Number(prop.valor) > 0) {
    const now = new Date();
    faturaProp = await prisma.invoice.create({ data: { tenantId, subscriptionId: sub.id, amount: D(prop.valor), method: sub.method, periodStart: now, periodEnd: sub.currentPeriodEnd, dueAt: sub.method === 'BOLETO' ? addDays(now, BOLETO_DUE_DAYS) : now, note: notaProporcional(prop) } });
    if (sub.method === 'CARD') {
      const r = await cobrar(faturaProp.id);
      // OPEN = aceita e ainda processando no gateway (o webhook liquida): segue como aceita.
      if (r.status === 'FAILED') {
        await prisma.invoice.update({ where: { id: r.id }, data: { status: 'VOID' } });
        throw AppError.validation(`A cobrança proporcional de ${prop.valor.replace('.', ',')} foi recusada (${r.failureReason ?? 'cartão recusado'}). As funções não foram adicionadas: troque o cartão em "Forma de pagamento" e tente de novo.`);
      }
      faturaProp = r;
    }
  }
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
  for (const m of resolved.modules) if (!active.some((a) => a.moduleKey === m)) { await enableModule(tenantId, m); await semearModulo(tenantId, m); }
  for (const a of active) if (!resolved.modules.includes(a.moduleKey)) await disableModule(tenantId, a.moduleKey);
  invalidateTenantCache(tenantId);
  if (faturaProp && sub.method !== 'CARD') await collectInvoice(faturaProp.id); // boleto/Pix: gera e avisa
  return { ...(await getSubscription()), amount: amount.toFixed(2), proporcional: prop };
}

export async function changePaymentMethod(input: { method: BillingMethod; cardToken?: string }) {
  const sub = await mySubscription();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } });
  const account = await prisma.account.findUniqueOrThrow({ where: { id: sub.accountId } });
  const payer: Payer = { name: tenant.name, email: account.email, document: tenant.document };
  // Sempre pelo gateway ATUAL. Assinatura nascida em outro (ex.: simulador antes do Stripe) migra
  // aqui: Customer novo no gateway atual, e a assinatura passa a apontar para ele.
  const target = billingProvider();
  if (!target.methods.includes(input.method)) throw AppError.validation('Forma de pagamento indisponível neste momento.', { method: input.method });
  const customerId = sub.provider === target.key && sub.providerCustomerId ? sub.providerCustomerId : (await target.createCustomer(payer)).customerId;
  const pay = await setupPayment(target, customerId, payer, input.method, input.cardToken, sub.amount.toFixed(2));
  await prisma.subscription.update({ where: { id: sub.id }, data: { provider: target.key, providerCustomerId: customerId, method: input.method, paymentRef: pay.paymentRef, paymentInfo: pay.paymentInfo as Prisma.InputJsonValue } });
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
