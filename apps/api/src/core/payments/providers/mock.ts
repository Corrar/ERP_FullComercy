// Provedor MOCK: simula um gateway. Devolve um "QR" e aceita webhook com o token da empresa
// (`settings.payments.mock.webhookToken`). É o que os testes e o ambiente de demonstração usam —
// e o molde de como um provedor real (PIX dinâmico de banco, cartão) se encaixa.
import { randomBytes } from 'node:crypto';
import { safeEqual } from '../../../shared/crypto';
import type { PaymentProvider } from './types';

export const mockProvider: PaymentProvider = {
  key: 'mock',
  methods: ['PIX', 'CREDIT'],
  async create({ intentId, amount }) {
    const externalId = `mock_${randomBytes(6).toString('hex')}`;
    return { externalId, qrCode: `00020126MOCK${externalId}5204000053039865406${amount}5802BR`, checkoutUrl: `https://pay.mock.local/${externalId}`, expiresAt: new Date(Date.now() + 30 * 60_000), raw: { intentId } };
  },
  async parseWebhook({ headers, body, config }) {
    const token = String(headers['x-mock-token'] ?? '');
    const want = String(config.webhookToken ?? '');
    if (!want || !safeEqual(token, want)) throw new Error('token do webhook inválido');
    const b = body as { externalId?: string; status?: string; paidAt?: string };
    if (!b.externalId || !b.status) throw new Error('payload incompleto');
    const status = (['PAID', 'EXPIRED', 'CANCELLED', 'FAILED', 'PENDING'] as const).find((s) => s === b.status) ?? 'PENDING';
    return { externalId: b.externalId, status, paidAt: b.paidAt ? new Date(b.paidAt) : new Date(), raw: body };
  },
};
