// core/billing/providers/index.ts — escolhe o gateway da assinatura pelo ambiente. Cada assinatura
// guarda o provedor com que nasceu (`Subscription.provider`), então trocar BILLING_PROVIDER não
// muda o caminho de quem já assinou: o mock continua registrado fora de produção.
import Stripe from 'stripe';
import { env } from '../../../config/env';
import { mockBillingProvider } from './mock';
import { createStripeProvider } from './stripe';
import type { BillingProvider } from './types';

const PROVIDERS: Record<string, BillingProvider> = {};
if (env.APP_STAGE !== 'production') PROVIDERS.mock = mockBillingProvider;
if (env.STRIPE_SECRET_KEY) {
  const client = new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: 'erp-modular' }, maxNetworkRetries: 2, timeout: 20_000 });
  PROVIDERS.stripe = createStripeProvider(client, { webhookSecret: env.STRIPE_WEBHOOK_SECRET });
}

export function billingProvider(key: string = env.BILLING_PROVIDER): BillingProvider {
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Provedor de cobrança indisponível neste ambiente: ${key}`);
  return p;
}
