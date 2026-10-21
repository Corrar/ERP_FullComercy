// Provedor MOCK da assinatura: simula cartão, boleto e Pix Automático sem sair da máquina.
// É o que dev, testes e demonstração usam — e o molde de um gateway real. Recusado em produção
// (`config/env.ts`).
//
// Cartão: o "token" é o que `apps/web/src/lib/billing.ts` gera NO NAVEGADOR —
// `tok_mock_<bandeira>_<final>_<MM><AA>` — e só carrega bandeira, final e validade. Os finais de
// teste seguem a convenção dos gateways: 0002 recusa sempre; 0341 aceita guardar e recusa a
// cobrança (cartão sem limite). Todo o resto aprova.
// Pix Automático: a autorização nasce PENDING; o pagador "autoriza no banco" pelo webhook mock
// (`kind: 'pix_authorization'`). Cobrança com autorização AUTHORIZED liquida na hora.
// Boleto: nasce em aberto; o pagamento chega pelo webhook mock (`kind: 'invoice'`).
import { randomBytes } from 'node:crypto';
import { env } from '../../../config/env';
import { safeEqual } from '../../../shared/crypto';
import type { BillingProvider } from './types';

const id = (p: string) => `${p}_${randomBytes(8).toString('hex')}`;
const TOKEN = /^tok_mock_([a-z]+)_(\d{4})_(\d{2})(\d{2})$/;
/** Estado das autorizações Pix do mock (em memória — o mock não tem banco próprio). */
const pixAuth = new Map<string, 'PENDING' | 'AUTHORIZED' | 'REVOKED'>();

export const mockBillingProvider: BillingProvider = {
  key: 'mock',
  methods: ['CARD', 'BOLETO', 'PIX_AUTO'],
  async createCustomer() { return { customerId: id('cus_mock') }; },
  async attachCard({ cardToken }) {
    const m = TOKEN.exec(cardToken);
    if (!m) throw new Error('Cartão inválido. Confira os dados e tente de novo.');
    const [, brand, last4, mm, yy] = m;
    const expMonth = Number(mm), expYear = 2000 + Number(yy);
    const now = new Date();
    if (expMonth < 1 || expMonth > 12 || expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      throw new Error('Cartão vencido.');
    }
    if (last4 === '0002') throw new Error('Cartão recusado pelo emissor.');
    return { ref: id('card_mock') + `_${last4}`, brand, last4, expMonth, expYear };
  },
  async chargeCard({ cardRef }) {
    if (cardRef.endsWith('_0341')) return { ok: false, providerRef: id('ch_mock'), failureReason: 'Saldo ou limite insuficiente.' };
    return { ok: true, providerRef: id('ch_mock') };
  },
  async createBoleto({ amount }) {
    const ref = id('bol_mock');
    const cents = String(Math.round(Number(amount) * 100)).padStart(10, '0');
    return { providerRef: ref, url: `https://boleto.mock.local/${ref}.pdf`, line: `00190.00009 01234.567890 12345.678901 1 0000${cents}`, pixCode: `00020126MOCKBOLETO${ref}` };
  },
  async authorizePixAuto() {
    const authorizationId = id('pixauth_mock');
    pixAuth.set(authorizationId, 'PENDING');
    return { authorizationId, qrCode: `00020126PIXAUTOMATICO${authorizationId}5802BR`, status: 'PENDING' };
  },
  async chargePixAuto({ authorizationId }) {
    const st = pixAuth.get(authorizationId);
    const providerRef = id('pix_mock');
    if (st === 'AUTHORIZED') return { providerRef, status: 'PAID' };
    // Sem autorização (ou revogada) o débito automático não acontece: vira cobrança Pix avulsa.
    return { providerRef, status: 'SCHEDULED', pixCode: `00020126PIXCOBRANCA${providerRef}5802BR` };
  },
  async parseWebhook({ headers, body }) {
    const want = env.BILLING_MOCK_WEBHOOK_TOKEN ?? '';
    const got = String(headers['x-billing-token'] ?? '');
    if (!want || !safeEqual(got, want)) throw new Error('token do webhook inválido');
    const b = body as { kind?: string; providerRef?: string; status?: string; authorizationId?: string };
    if (b.kind === 'pix_authorization' && b.authorizationId && (b.status === 'AUTHORIZED' || b.status === 'REVOKED')) {
      pixAuth.set(b.authorizationId, b.status);
      return { kind: 'pix_authorization', authorizationId: b.authorizationId, status: b.status };
    }
    if (b.kind === 'invoice' && b.providerRef && (b.status === 'PAID' || b.status === 'FAILED')) {
      return { kind: 'invoice', providerRef: b.providerRef, status: b.status, paidAt: new Date() };
    }
    throw new Error('payload incompleto');
  },
};
