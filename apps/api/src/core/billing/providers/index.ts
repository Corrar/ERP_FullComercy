// core/billing/providers/index.ts — escolhe o gateway da assinatura pelo ambiente.
import { env } from '../../../config/env';
import { mockBillingProvider } from './mock';
import type { BillingProvider } from './types';

const PROVIDERS: Record<string, BillingProvider> = { mock: mockBillingProvider };

export function billingProvider(key = env.BILLING_PROVIDER): BillingProvider {
  const p = PROVIDERS[key];
  if (!p) throw new Error(`Provedor de cobrança desconhecido: ${key}`);
  return p;
}
