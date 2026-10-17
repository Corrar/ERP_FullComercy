// core/payments/providers/types.ts — O CONTRATO de um gateway de pagamento.
// O core não sabe se é PIX do banco X ou cartão do gateway Y: sabe criar uma intenção, mostrar
// ao cliente o que o provedor devolveu (QR, link) e receber a confirmação pelo webhook.
import type { PaymentMethod } from '@prisma/client';

export interface CreateIntentInput {
  tenantId: string; intentId: string; amount: string; method: PaymentMethod;
  description: string; payer?: { name?: string; document?: string; email?: string } | null;
  /** Config do provedor para ESTA empresa (`Tenant.settings.payments[provider]`). */
  config: Record<string, unknown>;
}
export interface CreateIntentResult { externalId: string; qrCode?: string; checkoutUrl?: string; expiresAt?: Date; raw?: unknown }
export interface WebhookParse { externalId: string; status: 'PAID' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | 'PENDING'; paidAt?: Date; raw?: unknown }

export interface PaymentProvider {
  readonly key: string;
  readonly methods: readonly PaymentMethod[];
  create(input: CreateIntentInput): Promise<CreateIntentResult>;
  /** Valida a autenticidade (assinatura/token) e traduz o payload. Lança se inválido. */
  parseWebhook(input: { headers: Record<string, string | string[] | undefined>; body: unknown; config: Record<string, unknown> }): Promise<WebhookParse>;
}
