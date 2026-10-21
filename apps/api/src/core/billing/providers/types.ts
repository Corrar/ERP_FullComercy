// core/billing/providers/types.ts — O CONTRATO do gateway da ASSINATURA (a mensalidade que a
// empresa paga ao SaaS). Não confundir com `core/payments/providers`, que é a empresa cobrando o
// cliente DELA. Os três meios recorrentes do Brasil cabem aqui:
//   • cartão: o navegador tokeniza no gateway (o número nunca passa pela API); a API guarda o
//     token e debita a cada ciclo;
//   • boleto: um título por ciclo, com linha digitável e PDF;
//   • Pix Automático: o pagador autoriza UMA vez no app do banco; depois o débito recorre.
// Um gateway real (Asaas, Pagar.me, Efí, Stripe…) é um arquivo novo que implementa isto.

import type { BillingMethod } from '@prisma/client';

export interface Payer { name: string; email: string; document?: string | null }

export interface CardInfo { ref: string; brand: string; last4: string; expMonth: number; expYear: number }
/** `pending`: o gateway aceitou mas ainda não liquidou (o webhook decide depois). */
export interface ChargeResult { ok: boolean; pending?: boolean; providerRef: string; failureReason?: string }
export interface BoletoResult { providerRef: string; url: string; line: string; pixCode?: string }
export interface PixAuthorization { authorizationId: string; qrCode: string; status: 'PENDING' | 'AUTHORIZED' }
export interface PixChargeResult { providerRef: string; status: 'PAID' | 'SCHEDULED' | 'FAILED'; pixCode?: string; failureReason?: string }

export type BillingWebhook =
  | { kind: 'invoice'; providerRef: string; status: 'PAID' | 'FAILED'; paidAt?: Date }
  | { kind: 'pix_authorization'; authorizationId: string; status: 'AUTHORIZED' | 'REVOKED' }
  /** Evento autêntico que não interessa (o gateway manda de tudo): responde 200 e não faz nada. */
  | { kind: 'ignored'; type: string };

export interface BillingProvider {
  readonly key: string;
  /** Meios que ESTE gateway sabe cobrar nesta conta. A loja só oferece estes. */
  readonly methods: readonly BillingMethod[];
  /** Cartão com autenticação do banco (3-D Secure) na hora da compra: devolve o segredo que o
   *  navegador usa para confirmar. Ausente = o navegador tokeniza sozinho (mock). */
  createCardSetup?(input: { customerId?: string | null }): Promise<{ clientSecret: string; setupId: string }>;
  createCustomer(payer: Payer): Promise<{ customerId: string }>;
  /** Valida e guarda o cartão tokenizado no navegador. Lança `Error` legível se recusado. */
  attachCard(input: { customerId: string; cardToken: string }): Promise<CardInfo>;
  /** `attempt` entra na chave de idempotência: a mesma tentativa repetida (rede caiu) não cobra duas vezes. */
  chargeCard(input: { customerId: string; cardRef: string; amount: string; description: string; invoiceId: string; attempt: number }): Promise<ChargeResult>;
  createBoleto(input: { customerId: string; payer: Payer; amount: string; dueAt: Date; description: string; invoiceId: string }): Promise<BoletoResult>;
  /** Pede a autorização do Pix Automático (valor máximo por ciclo). Devolve o QR que o pagador lê no banco. */
  authorizePixAuto(input: { customerId: string; payer: Payer; maxAmount: string; description: string }): Promise<PixAuthorization>;
  chargePixAuto(input: { authorizationId: string; amount: string; dueAt: Date; description: string; invoiceId: string }): Promise<PixChargeResult>;
  /** Valida a autenticidade do webhook e traduz. Lança se inválido. */
  parseWebhook(input: { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody?: Buffer }): Promise<BillingWebhook>;
}
