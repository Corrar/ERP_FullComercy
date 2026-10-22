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
import { manualProvider, type ConfigPixManual } from './providers/manual';
import { assinarPagamento, lerPagamento } from '../../shared/track-token';
import { normalizarChavePix } from '../../shared/pix';
import { appUrl } from '../../infra/mailer';
import { marcaPublica } from '../tenancy/marca.service';
import { mockProvider } from './providers/mock';
import { contaDoToken, mercadoPagoProvider, type ConfigMercadoPago } from './providers/mercadopago';
import { seal } from '../../shared/crypto';
import { env } from '../../config/env';

// O simulador não existe em produção: lá ninguém "paga" mandando um aviso com token próprio.
const providers = new Map<string, PaymentProvider>([[manualProvider.key, manualProvider], [mercadoPagoProvider.key, mercadoPagoProvider], ...(env.APP_STAGE === 'production' ? [] : [[mockProvider.key, mockProvider] as const])]);
export const registerProvider = (p: PaymentProvider) => { providers.set(p.key, p); };
export const listProviders = () => [...providers.values()].map((p) => ({ key: p.key, methods: p.methods }));
const provider = (key: string) => { const p = providers.get(key); if (!p) throw AppError.validation(`Provedor de pagamento desconhecido: ${key}`); return p; };
const providerConfig = (settings: Record<string, unknown>, key: string) => ((settings.payments as Record<string, Record<string, unknown>> | undefined)?.[key] ?? {});

/** Por onde a empresa recebe Pix: conta do Mercado Pago conectada (baixa automática) vence a chave
 *  Pix (confirmação à mão); nenhum dos dois = não cobra Pix online. Quem decide é o servidor. */
export function provedorPix(settings: Record<string, unknown>): 'mercadopago' | 'manual' | null {
  if ((providerConfig(settings, 'mercadopago') as ConfigMercadoPago).accessToken) return 'mercadopago';
  if ((providerConfig(settings, 'manual') as ConfigPixManual).pixKey) return 'manual';
  return null;
}

export async function createIntent(input: { provider?: string; method: PaymentMethod; orderId?: string; financeEntryId?: string; amount?: number }) {
  const { db, tenantId, tenantSettings } = ctx();
  const key = input.provider ?? (input.method === 'PIX' ? provedorPix(tenantSettings) : null);
  if (!key) throw AppError.validation('Cadastre a chave Pix da empresa ou conecte o Mercado Pago em "Cobranças online" para cobrar por Pix.');
  const p = provider(key);
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
  const r = await p.create({ tenantId, intentId: intent.id, amount: amount!.toFixed(2), method: input.method, description, payer, config: providerConfig(tenantSettings, p.key) })
    .catch(async (e) => { await db.paymentIntent.delete({ where: { id: intent.id } }); throw e; });
  // Sem página do provedor, o link é a NOSSA página pública (/pagar/<token>): Pix e situação.
  const checkoutUrl = r.checkoutUrl ?? (r.qrCode ? appUrl(`/pagar/${assinarPagamento(tenantId, intent.id)}`) : undefined);
  const upd = await db.paymentIntent.update({ where: { id: intent.id }, data: { externalId: r.externalId, qrCode: r.qrCode, checkoutUrl, expiresAt: r.expiresAt, raw: (r.raw ?? {}) as never } });
  return comQr(upd);
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
/** QR em SVG do copia e cola (o front mostra como imagem; o cliente lê com o app do banco). */
async function qrSvg(texto: string | null) {
  if (!texto) return null;
  const bwip = await import('bwip-js');
  return bwip.toSVG({ bcid: 'qrcode', text: texto, scale: 4, eclevel: 'M' } as never);
}
const comQr = async <T extends { qrCode: string | null }>(it: T) => ({ ...it, qrSvg: await qrSvg(it.qrCode) });

export async function getIntent(id: string) {
  const it = await ctx().db.paymentIntent.findUnique({ where: { id }, include: { order: { select: { number: true } } } });
  if (!it) throw AppError.notFound('Cobrança');
  return comQr(it);
}

/** Configuração do Pix pela chave (provedor manual): chave, nome e cidade do recebedor. */
export function configPix() {
  const c = providerConfig(ctx().tenantSettings, 'manual') as ConfigPixManual;
  return { chave: c.pixKey ?? null, nome: c.nome ?? null, cidade: c.cidade ?? null };
}
export async function salvarConfigPix(input: { chave: string; nome: string; cidade: string }) {
  const chave = normalizarChavePix(input.chave);
  if (!chave) throw AppError.validation('Chave Pix inválida. Use CPF, CNPJ, e-mail, celular com +55 ou a chave aleatória.');
  await gravarConfig('manual', (atual) => ({ ...atual, pixKey: chave, nome: input.nome.trim(), cidade: input.cidade.trim() }), 'payments.pix.config', { chave });
  return { chave, nome: input.nome.trim(), cidade: input.cidade.trim() };
}

/** Regrava `settings.payments[key]` da empresa (null apaga) com auditoria e invalida o cache. */
async function gravarConfig(key: string, mudar: (atual: Record<string, unknown>) => Record<string, unknown> | null, acao: string, detalhes: Record<string, unknown>) {
  const { tenantId, userId } = ctx();
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const settings = { ...((t.settings ?? {}) as Record<string, unknown>) };
  const payments = { ...((settings.payments ?? {}) as Record<string, Record<string, unknown>>) };
  const novo = mudar({ ...(payments[key] ?? {}) });
  if (novo) payments[key] = novo; else delete payments[key];
  settings.payments = payments;
  await tenantTransaction(ctx().db, tenantId, async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as never } });
    await tx.auditLog.create({ data: { tenantId, userId, action: acao, entity: 'Tenant', entityId: tenantId, details: detalhes as never } });
  });
  const { invalidateTenantCache } = await import('../tenancy/tenant-modules.service');
  invalidateTenantCache(tenantId);
}

/** Conta do Mercado Pago da empresa: o que a tela mostra (nunca o token). */
export function configMercadoPago() {
  const c = providerConfig(ctx().tenantSettings, 'mercadopago') as ConfigMercadoPago;
  return { conectado: !!c.accessToken, conta: c.conta ?? null, conectadoEm: c.conectadoEm ?? null, assinaturaDoAviso: !!c.webhookSecret, emUso: provedorPix(ctx().tenantSettings) };
}
/** Conecta: confere o token NA API do Mercado Pago (token errado não grava) e guarda selado. */
export async function conectarMercadoPago(input: { accessToken: string; webhookSecret?: string }) {
  const token = input.accessToken.trim();
  const conta = await contaDoToken(token);
  await gravarConfig('mercadopago', () => ({
    accessToken: seal(token), ...(input.webhookSecret?.trim() ? { webhookSecret: seal(input.webhookSecret.trim()) } : {}),
    conta, conectadoEm: new Date().toISOString(),
  }), 'payments.mercadopago.conectar', { conta: conta.id, teste: conta.teste });
  return { conectado: true, conta };
}
export async function desconectarMercadoPago() {
  await gravarConfig('mercadopago', () => null, 'payments.mercadopago.desconectar', {});
  return { conectado: false };
}

/** Página PÚBLICA do link de pagamento: só o que o cliente precisa para pagar. */
export async function paginaDePagamento(token: string) {
  const t = lerPagamento(token);
  if (!t) throw AppError.notFound('Cobrança');
  const it = await prisma.paymentIntent.findFirst({ where: { id: t.intentId, tenantId: t.tenantId }, include: { order: { select: { number: true } }, tenant: { select: { slug: true } } } });
  if (!it) throw AppError.notFound('Cobrança');
  const marca = await marcaPublica(it.tenant.slug);
  return {
    empresa: marca,
    descricao: it.order ? `Pedido #${it.order.number}` : 'Pagamento',
    valor: it.amount, metodo: it.method, status: it.status, expiraEm: it.expiresAt, pagoEm: it.paidAt,
    /** Pago, o gateway avisa sozinho (Mercado Pago); senão a empresa confere no banco e confirma. */
    baixaAutomatica: it.provider !== 'manual',
    // Pago, cancelado ou vencido: não mostra mais o Pix (ninguém paga duas vezes pelo link).
    pix: it.status === PaymentIntentStatus.PENDING ? it.qrCode : null,
    qrSvg: it.status === PaymentIntentStatus.PENDING ? await qrSvg(it.qrCode) : null,
  };
}

export const listIntents = (filter: { orderId?: string; status?: PaymentIntentStatus }) => ctx().db.paymentIntent.findMany({ where: filter, orderBy: { createdAt: 'desc' }, take: 200 });

/** Webhook PÚBLICO do provedor: acha a intenção pelo externalId em QUALQUER tenant (client de
 *  plataforma), depois roda como aquele tenant. O provedor valida a autenticidade com a config
 *  da empresa dona da intenção. */
export async function handleWebhook(providerKey: string, headers: Record<string, string | string[] | undefined>, body: unknown) {
  const p = provider(providerKey);
  const probe = body as { externalId?: string; data?: { id?: string } };
  const id = probe?.externalId ?? probe?.data?.id;
  const externalId = id === undefined || id === null ? '' : String(id);
  if (!externalId) throw AppError.validation('Webhook sem identificador.');
  const it = await prisma.paymentIntent.findFirst({ where: { provider: providerKey, externalId }, include: { tenant: { select: { id: true, settings: true } } } });
  if (!it) throw AppError.notFound('Intenção');
  const parsed = await p.parseWebhook({ headers, body, config: providerConfig(it.tenant.settings as Record<string, unknown>, providerKey) }).catch((e) => {
    if (e instanceof AppError && e.code === 'UNAVAILABLE') throw e; // o gateway reenvia o aviso
    throw new AppError('UNAUTHENTICATED', `Webhook rejeitado: ${e instanceof Error ? e.message : e}`);
  });
  // A situação relida tem de ser da MESMA cobrança do aviso.
  if (parsed.externalId !== it.externalId) throw new AppError('UNAUTHENTICATED', 'Webhook rejeitado: cobrança diferente da avisada.');
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
