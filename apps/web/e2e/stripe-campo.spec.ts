// e2e/stripe-campo.spec.ts — o campo do cartão do Stripe monta sem derrubar a tela. O Stripe.js
// TROCA o conteúdo do elemento onde monta; se o React tiver um filho ali, ele some por baixo do
// React e a tela cai com "removeChild" ao trocar o aviso de carregando (bug de 21/10/2026). As
// outras specs rodam com a cobrança simulada e nunca montam o campo — por isso esta usa um dublê
// do Stripe.js (o real não carrega aqui) com o mesmo comportamento que importa: mount() substitui
// o conteúdo e 'ready' chega depois.
import { test, expect } from '@playwright/test';

const STRIPE_STUB = `
  window.Stripe = () => ({ elements: () => ({ create: () => { const h = {}; return {
    mount(el) { el.innerHTML = ''; const f = document.createElement('iframe'); f.style.cssText = 'width:100%;height:20px;border:0'; el.appendChild(f); setTimeout(() => { h.ready && h.ready(); window.__stripeReady = true; }, 200); },
    on(ev, fn) { h[ev] = fn; }, destroy() {} }; } }) });`;

test('pagamento com Stripe: o campo do cartão monta e a tela não cai', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/public/billing/catalog', async (r) => {
    const real = await (await r.fetch()).json();
    await r.fulfill({ json: { ...real, methods: ['CARD'], provider: 'stripe', stripe: { publishableKey: 'pk_test_dublê' } } });
  });
  await page.route('https://js.stripe.com/v3/', (r) => r.fulfill({ contentType: 'text/javascript', body: STRIPE_STUB }));
  await page.addInitScript(() => {
    localStorage.setItem('fc.account', JSON.stringify({ token: 't', account: { id: 'a', email: 'dona@exemplo.com', name: 'Dona', avatarUrl: null, hasPassword: true, hasGoogle: false, trialAvailable: true } }));
    localStorage.setItem('fc.cart', JSON.stringify({ modules: ['VAREJO'], features: [] }));
  });

  await page.goto('/checkout');
  await expect(page.locator('h1', { hasText: 'Pagamento' })).toBeVisible();
  await expect(page.getByTestId('stripe-card').locator('iframe')).toHaveCount(1);
  // A tela caía quando o Stripe avisava 'ready' e o React tirava o aviso de carregando: espera esse
  // instante passar antes de olhar.
  await page.waitForFunction(() => (window as unknown as { __stripeReady?: boolean }).__stripeReady === true);
  await page.waitForTimeout(300);
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0);
  await expect(page.getByTestId('stripe-card').locator('iframe')).toHaveCount(1);
  await expect(page.getByText('Carregando campo seguro do cartão…')).toHaveCount(0);
  expect(errors).toEqual([]);
});
