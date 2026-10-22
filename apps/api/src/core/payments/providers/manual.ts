// Provedor MANUAL: Pix pela CHAVE da empresa (copia e cola com o valor, `shared/pix.ts`) e
// maquininha/dinheiro avulsos. Não há webhook: o banco não avisa ninguém, então o operador confirma
// na tela (POST /payments/intents/:id/confirm) quando vê o dinheiro na conta. Serve a empresa que
// ainda não integrou um PSP — e já cobra de verdade.
import { AppError } from '../../../shared/errors';
import { brCodePix } from '../../../shared/pix';
import type { PaymentProvider } from './types';

export interface ConfigPixManual { pixKey?: string; nome?: string; cidade?: string }

export const manualProvider: PaymentProvider = {
  key: 'manual',
  methods: ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'TRANSFER'],
  async create({ intentId, amount, method, description, config }) {
    const c = config as ConfigPixManual;
    if (method !== 'PIX') return { externalId: `manual:${intentId}`, raw: { manual: true } };
    if (!c.pixKey) throw AppError.validation('Cadastre a chave Pix da empresa em "Cobranças online" para cobrar por Pix.');
    // txid = o id da intenção sem hífens (25 caracteres): aparece no extrato e ajuda a conciliar.
    const qrCode = brCodePix({ chave: c.pixKey, nome: c.nome ?? '', cidade: c.cidade ?? '', valor: amount, txid: intentId.replace(/-/g, ''), descricao: description });
    return { externalId: `manual:${intentId}`, qrCode, raw: { manual: true } };
  },
  async parseWebhook() { throw new Error('Provedor manual não recebe webhook.'); },
};
