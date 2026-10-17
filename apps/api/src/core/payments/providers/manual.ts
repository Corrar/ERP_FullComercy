// Provedor MANUAL: PIX estático / maquininha avulsa. Não há webhook: o operador confirma na
// tela (POST /payments/intents/:id/confirm). Serve a empresa que ainda não integrou gateway.
import type { PaymentProvider } from './types';

export const manualProvider: PaymentProvider = {
  key: 'manual',
  methods: ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'TRANSFER'],
  async create({ intentId, config }) {
    const chave = typeof config.pixKey === 'string' ? config.pixKey : null;
    return { externalId: `manual:${intentId}`, qrCode: chave ? `PIX chave: ${chave}` : undefined, raw: { manual: true } };
  },
  async parseWebhook() { throw new Error('Provedor manual não recebe webhook.'); },
};
