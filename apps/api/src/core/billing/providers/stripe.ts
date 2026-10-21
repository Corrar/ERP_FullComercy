// Provedor STRIPE da assinatura. Conta brasileira (BRL), cartão:
//   1. o navegador pede um SetupIntent (`createCardSetup`) e confirma o cartão com Stripe.js — o
//      número fica no iframe do Stripe, e o 3-D Secure do banco acontece AQUI, com o cliente na tela;
//   2. o checkout manda o `pm_…` resultante; `attachCard` prende ao Customer e vira o padrão;
//   3. cada mensalidade é um PaymentIntent `off_session` + `confirm` (o cliente não está presente),
//      com chave de idempotência por fatura+tentativa: rede que cai no meio não cobra duas vezes.
// Boleto e Pix ficam fora enquanto não estão ativos na conta Stripe (`methods`); Pix Automático o
// Stripe não oferece — com Stripe, a loja só mostra cartão.
// O cliente do Stripe entra por parâmetro (`StripeLike`): os testes passam um dublê sem rede.
import type Stripe from 'stripe';
import type { BillingProvider, ChargeResult } from './types';

export type StripeLike = Pick<Stripe, 'customers' | 'paymentMethods' | 'paymentIntents' | 'setupIntents' | 'webhooks'>;

/** Recusa do emissor em português (a mensagem do Stripe vem em inglês e vai para a tela). */
const DECLINE_PT: Record<string, string> = {
  insufficient_funds: 'Saldo ou limite insuficiente.',
  card_declined: 'Cartão recusado pelo emissor.',
  generic_decline: 'Cartão recusado pelo emissor.',
  expired_card: 'Cartão vencido.',
  incorrect_cvc: 'Código de segurança (CVV) incorreto.',
  incorrect_number: 'Número do cartão incorreto.',
  lost_card: 'Cartão recusado pelo emissor.',
  stolen_card: 'Cartão recusado pelo emissor.',
  fraudulent: 'Cartão recusado pelo emissor.',
  do_not_honor: 'Cartão recusado pelo emissor.',
  processing_error: 'Erro ao processar o cartão. Tente de novo.',
  authentication_required: 'O banco pediu autenticação. Atualize o cartão em Assinatura para confirmar.',
};
export const declineMessage = (code?: string | null) => (code && DECLINE_PT[code]) || 'Cartão recusado pelo emissor.';

/** "124.40" → 12440 centavos, sem passar por float acumulado. */
export function toCents(amount: string): number {
  const [int, frac = ''] = amount.split('.');
  return Number(int) * 100 + Number((frac + '00').slice(0, 2)) * (amount.trim().startsWith('-') ? -1 : 1);
}

type StripeErr = { type?: string; code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string } };

export function createStripeProvider(client: StripeLike, opts: { webhookSecret?: string }): BillingProvider {
  const unavailable = () => { throw new Error('Este meio de pagamento não está ativo na conta Stripe.'); };
  return {
    key: 'stripe',
    methods: ['CARD'],

    async createCustomer(payer) {
      const c = await client.customers.create({ name: payer.name, email: payer.email, preferred_locales: ['pt-BR'], metadata: payer.document ? { document: payer.document } : {} });
      return { customerId: c.id };
    },

    async createCardSetup({ customerId }) {
      const si = await client.setupIntents.create({ usage: 'off_session', payment_method_types: ['card'], ...(customerId ? { customer: customerId } : {}) });
      if (!si.client_secret) throw new Error('Stripe não devolveu o segredo do SetupIntent.');
      return { clientSecret: si.client_secret, setupId: si.id };
    },

    async attachCard({ customerId, cardToken }) {
      if (!/^pm_[A-Za-z0-9]+$/.test(cardToken)) throw new Error('Cartão inválido. Confira os dados e tente de novo.');
      try {
        const pm = await client.paymentMethods.retrieve(cardToken);
        if (pm.type !== 'card' || !pm.card) throw new Error('O método informado não é um cartão.');
        const owner = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
        if (owner && owner !== customerId) throw new Error('Este cartão já está vinculado a outro cliente.');
        if (!owner) await client.paymentMethods.attach(pm.id, { customer: customerId });
        await client.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
        return { ref: pm.id, brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
      } catch (e) {
        const err = e as StripeErr;
        if (err.type === 'StripeCardError') throw new Error(declineMessage(err.decline_code ?? err.code));
        throw e;
      }
    },

    async chargeCard({ customerId, cardRef, amount, description, invoiceId, attempt }): Promise<ChargeResult> {
      try {
        const pi = await client.paymentIntents.create(
          { amount: toCents(amount), currency: 'brl', customer: customerId, payment_method: cardRef, off_session: true, confirm: true, description, metadata: { invoiceId } },
          { idempotencyKey: `invoice-${invoiceId}-attempt-${attempt}` },
        );
        if (pi.status === 'succeeded') return { ok: true, providerRef: pi.id };
        if (pi.status === 'processing') return { ok: false, pending: true, providerRef: pi.id };
        return { ok: false, providerRef: pi.id, failureReason: declineMessage(pi.status === 'requires_action' ? 'authentication_required' : pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code) };
      } catch (e) {
        const err = e as StripeErr;
        if (err.type === 'StripeCardError') {
          return { ok: false, providerRef: err.payment_intent?.id ?? `failed-${invoiceId}-${attempt}`, failureReason: declineMessage(err.decline_code ?? err.code) };
        }
        // Rede/gateway fora: a fatura fica recusada AGORA e o ciclo tenta de novo (24 h, até 4 vezes).
        // Não é "cartão recusado" — a mensagem diz o que houve.
        if (err.type === 'StripeConnectionError' || err.type === 'StripeAPIError' || err.type === 'StripeRateLimitError') {
          return { ok: false, providerRef: `unavailable-${invoiceId}-${attempt}`, failureReason: 'Gateway de pagamento indisponível. Nova tentativa automática.' };
        }
        throw e; // chave inválida, parâmetro errado: defeito de configuração, tem de aparecer
      }
    },

    createBoleto: unavailable,
    authorizePixAuto: unavailable,
    chargePixAuto: unavailable,

    async parseWebhook({ headers, rawBody }) {
      if (!opts.webhookSecret) throw new Error('webhook do Stripe não configurado (STRIPE_WEBHOOK_SECRET)');
      const sig = String(headers['stripe-signature'] ?? '');
      if (!sig || !rawBody) throw new Error('assinatura do Stripe ausente');
      // constructEvent confere o HMAC sobre o CORPO CRU e a janela de tempo (anti-replay).
      const ev = client.webhooks.constructEvent(rawBody, sig, opts.webhookSecret);
      if (ev.type === 'payment_intent.succeeded') return { kind: 'invoice', providerRef: ev.data.object.id, status: 'PAID', paidAt: new Date(ev.created * 1000) };
      if (ev.type === 'payment_intent.payment_failed') return { kind: 'invoice', providerRef: ev.data.object.id, status: 'FAILED' };
      return { kind: 'ignored', type: ev.type };
    },
  };
}
