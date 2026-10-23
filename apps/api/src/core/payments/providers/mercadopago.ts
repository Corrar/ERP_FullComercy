// Provedor MERCADO PAGO: Pix dinâmico pela conta da PRÓPRIA empresa, com baixa automática.
// A empresa conecta em "Cobranças online" com o Access Token da conta dela (Suas integrações →
// Credenciais de produção). O token fica SELADO no banco (`shared/crypto.ts`) e nunca volta à tela.
//
// Webhook: o aviso do Mercado Pago só diz "o pagamento N mudou". A situação NUNCA vem do corpo:
// com o token da empresa dona da cobrança, relemos GET /v1/payments/N na API deles — um aviso forjado
// só faria a gente reler um pagamento que já é da empresa. Se a empresa cadastrou a "assinatura
// secreta" do webhook, a assinatura (`x-signature`, HMAC-SHA256) também é conferida.
import { createHmac } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import { env } from '../../../config/env';
import { open, safeEqual } from '../../../shared/crypto';
import { AppError } from '../../../shared/errors';
import type { PaymentProvider, WebhookParse } from './types';

export interface ConfigMercadoPago {
  /** Selado. */
  accessToken?: string;
  /** Selado. Opcional: sem ela, vale só a releitura na API (que já basta para não aceitar forjado). */
  webhookSecret?: string;
  conta?: { id: string; apelido: string | null; email: string | null; teste: boolean };
  conectadoEm?: string;
}

const base = () => env.MERCADOPAGO_API_URL.replace(/\/$/, '');

async function chamar<T>(token: string, method: 'GET' | 'POST', path: string, body?: unknown, idempotencia?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(idempotencia ? { 'x-idempotency-key': idempotencia } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError('UNAVAILABLE', 'O Mercado Pago não respondeu. Tente de novo em instantes.');
  }
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 401 || res.status === 403) throw AppError.validation('O Mercado Pago recusou o Access Token. Confira se é o de PRODUÇÃO da conta da empresa.');
  if (!res.ok) throw AppError.validation(`Mercado Pago: ${json.message ?? `erro ${res.status}`}`);
  return json;
}

const tokenDe = (c: ConfigMercadoPago) => {
  if (!c.accessToken) throw AppError.validation('Conecte a conta do Mercado Pago em "Cobranças online" para cobrar por ela.');
  return open(c.accessToken);
};

/** Confere o token e diz de quem é a conta (é o que a tela mostra: "conectado como …"). */
export async function contaDoToken(token: string) {
  const u = await chamar<{ id: number | string; nickname?: string; email?: string }>(token, 'GET', '/users/me');
  return { id: String(u.id), apelido: u.nickname ?? null, email: u.email ?? null, teste: token.startsWith('TEST-') };
}

/** Data no formato que a API aceita (com fuso explícito, não "Z"): horário de Brasília. */
export function dataMp(d: Date) {
  const brt = new Date(d.getTime() - 3 * 3_600_000);
  return `${brt.toISOString().slice(0, 23)}-03:00`;
}

/** Assinatura do aviso: `x-signature: ts=…,v1=…` sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. */
export function assinaturaValida(secret: string, dataId: string, requestId: string, header: string) {
  const partes = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `id:${id};${requestId ? `request-id:${requestId};` : ''}ts:${partes.ts};`;
  return safeEqual(createHmac('sha256', secret).update(manifesto).digest('hex'), partes.v1);
}

interface PagamentoMp {
  id: number | string; status: string; status_detail?: string; date_approved?: string | null; date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; ticket_url?: string } };
}

export function situacao(p: PagamentoMp): WebhookParse['status'] {
  if (p.status === 'approved') return 'PAID';
  if (p.status === 'rejected') return 'FAILED';
  if (p.status === 'cancelled') return p.status_detail === 'expired' ? 'EXPIRED' : 'CANCELLED';
  return 'PENDING'; // pending, in_process, authorized; estorno depois de pago não desfaz a baixa sozinho
}

const header = (h: Record<string, string | string[] | undefined>, k: string) => { const v = h[k]; return Array.isArray(v) ? v[0] ?? '' : v ?? ''; };

export const mercadoPagoProvider: PaymentProvider = {
  key: 'mercadopago',
  methods: ['PIX'] as readonly PaymentMethod[],
  async create({ intentId, amount, description, payer, config }) {
    const token = tokenDe(config as ConfigMercadoPago);
    const doc = payer?.document?.replace(/\D/g, '');
    const notificar = env.API_PUBLIC_URL ? `${env.API_PUBLIC_URL.replace(/\/$/, '')}/public/payments/mercadopago/webhook` : undefined;
    const p = await chamar<PagamentoMp>(token, 'POST', '/v1/payments', {
      transaction_amount: Number(amount),
      description: description.slice(0, 120),
      payment_method_id: 'pix',
      external_reference: intentId,
      date_of_expiration: dataMp(new Date(Date.now() + 24 * 3_600_000)),
      // O Pix do Mercado Pago exige um e-mail do pagador; sem o do cliente, um genérico por cobrança.
      payer: {
        email: payer?.email || `cliente-${intentId.slice(0, 8)}@example.com`,
        ...(payer?.name ? { first_name: payer.name.slice(0, 60) } : {}),
        ...(doc && (doc.length === 11 || doc.length === 14) ? { identification: { type: doc.length === 11 ? 'CPF' : 'CNPJ', number: doc } } : {}),
      },
      // Só https público: o Mercado Pago recusa endereço local.
      ...(notificar?.startsWith('https://') ? { notification_url: notificar } : {}),
    }, intentId);
    const qr = p.point_of_interaction?.transaction_data;
    if (!qr?.qr_code) throw AppError.validation('O Mercado Pago não devolveu o Pix. Confira se a conta tem chave Pix cadastrada.');
    return { externalId: String(p.id), qrCode: qr.qr_code, expiresAt: p.date_of_expiration ? new Date(p.date_of_expiration) : undefined, raw: { id: p.id, status: p.status, ticketUrl: qr.ticket_url ?? null } };
  },
  async parseWebhook({ headers, body, config }) {
    const c = config as ConfigMercadoPago;
    const dataId = String((body as { data?: { id?: unknown } })?.data?.id ?? '');
    if (!dataId) throw new Error('aviso sem data.id');
    if (c.webhookSecret && !assinaturaValida(open(c.webhookSecret), dataId, header(headers, 'x-request-id'), header(headers, 'x-signature'))) throw new Error('assinatura x-signature inválida');
    const p = await chamar<PagamentoMp>(tokenDe(c), 'GET', `/v1/payments/${encodeURIComponent(dataId)}`);
    const status = situacao(p);
    return { externalId: String(p.id), status, paidAt: status === 'PAID' && p.date_approved ? new Date(p.date_approved) : undefined, raw: { id: p.id, status: p.status, detail: p.status_detail } };
  },
};
