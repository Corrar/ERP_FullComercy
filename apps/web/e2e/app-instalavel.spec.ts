// e2e/app-instalavel.spec.ts — o site como app: manifesto e ícones, service worker no build de
// produção (sem guardar API), página "sem conexão" e o botão "Instalar app" (Chrome e iPhone).
import { test, expect, devices } from '@playwright/test';

const PREVIEW = 'http://127.0.0.1:5181';

test('build de produção: manifesto, ícones, service worker sem API no cache e página offline', async ({ page, context, request }) => {
  const html = await (await request.get(`${PREVIEW}/`)).text();
  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  expect(html).toContain('rel="apple-touch-icon"');
  const m = await (await request.get(`${PREVIEW}/manifest.webmanifest`)).json();
  expect(m.display).toBe('standalone'); expect(m.start_url).toMatch(/^\//); expect(m.scope).toBe('/');
  expect(m.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable')).toBeTruthy();
  for (const i of m.icons) {
    const r = await request.get(`${PREVIEW}${i.src}`);
    expect(r.status(), i.src).toBe(200); expect(r.headers()['content-type']).toMatch(/^image\//);
  }

  await page.goto(`${PREVIEW}/login`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'o service worker controla a página').toBe(true);
  const guardado = await page.evaluate(async () => (await (await caches.open('erp-casca-v1')).keys()).map((r) => new URL(r.url).pathname));
  expect(guardado).toContain('/offline.html');
  expect(guardado.some((p) => p.startsWith('/api') || p.startsWith('/socket.io')), 'API nunca vai para o cache').toBe(false);

  await context.setOffline(true);
  await page.goto(`${PREVIEW}/pedidos`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();
  await context.setOffline(false);
});

test('botão Instalar app: usa o convite do navegador e some depois de instalar', async ({ page }) => {
  await page.goto('/comecar');
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0); // sem convite, sem botão
  // O Chromium de teste não dispara o convite sozinho: simulamos o evento do navegador.
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as any;
    e.prompt = () => { (window as any).__pediuInstalacao = true; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.getByRole('button', { name: 'Instalar app' }).click();
  expect(await page.evaluate(() => (window as any).__pediuInstalacao)).toBe(true);
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});

test('iPhone: o botão explica o "Adicionar à Tela de Início"', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL: 'http://127.0.0.1:5180' });
  const page = await ctx.newPage();
  await page.goto('/comecar');
  await page.getByRole('button', { name: 'Instalar app' }).click();
  await expect(page.getByRole('dialog')).toContainText('Adicionar à Tela de Início');
  await ctx.close();
});
