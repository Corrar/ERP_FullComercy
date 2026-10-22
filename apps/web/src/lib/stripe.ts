// src/lib/stripe.ts — o campo de cartão do Stripe (Elements). O número, a validade e o CVV ficam
// num iframe servido por js.stripe.com: nem este front nem a API os veem (escopo PCI mínimo).
// Fluxo: a API cria um SetupIntent → `confirmCardSetup` aqui (o banco pode pedir 3-D Secure, com o
// cliente na tela) → sai um `pm_…`, que é o que vai para a API.
import { loadScript } from './script';

declare global { interface Window { Stripe?: (pk: string, opts?: Record<string, unknown>) => any } }

let instance: { pk: string; stripe: any } | null = null;
export async function getStripe(publishableKey: string) {
  if (instance?.pk === publishableKey) return instance.stripe;
  await loadScript('https://js.stripe.com/v3/');
  if (!window.Stripe) throw new Error('Stripe.js não carregou.');
  instance = { pk: publishableKey, stripe: window.Stripe(publishableKey, { locale: 'pt-BR' }) };
  return instance.stripe;
}

/** Cores do tema atual para o iframe (ele não enxerga as variáveis CSS da página). */
export function cardStyle() {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
  return {
    base: { color: v('--text', '#1a1b1d'), fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '15px', '::placeholder': { color: v('--faint', '#9a9da3') } },
    invalid: { color: v('--danger', '#dc2626'), iconColor: v('--danger', '#dc2626') },
  };
}

/** Mensagem do Stripe.js para a tela (ele já traduz com locale pt-BR; aqui só o fallback). */
export const stripeErrorMessage = (e: { message?: string } | undefined) => e?.message || 'Não foi possível confirmar o cartão.';
