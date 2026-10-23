// e2e/baixa-automatica.spec.ts — "Cobrança online … com baixa automática no pedido", pela tela:
// a oficina conecta a conta do Mercado Pago (servidor falso, e2e/mercadopago-falso.mjs), cobra o
// pedido por Pix e, quando o cliente paga, a janela avisa sozinha e o pagamento aparece no pedido —
// sem botão de "Recebi o Pix". Depois desconecta e a tela volta a pedir a chave.
import { test, expect } from '@playwright/test';
import { API, empresaNova, run, uiLogin } from './_helpers';

const FALSO = 'http://127.0.0.1:3399';

test('Mercado Pago: conectar, cobrar por Pix e o pagamento entrar sozinho no pedido', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'mp-ui', 'SERVICOS');
  const cli = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Cliente MP ${run}` } })).json();
  const pedido = await (await request.post(`${API}/orders`, { headers: h, data: { customerId: cli.id, items: [{ kind: 'SERVICE', description: `Revisão ${run}`, quantity: 1, unitPrice: 150 }], moduleData: { plate: `MPU${String(Date.now()).slice(-4)}` } } })).json();

  await uiLogin(page, slug);
  await page.goto('/cobrancas');
  const card = page.locator('.card', { hasText: 'Mercado Pago — baixa automática' });
  await card.locator('input[name=accessToken]').fill('APP_USR-0000-errado-0000000000000000');
  await card.getByRole('button', { name: 'Conectar Mercado Pago' }).click();
  await expect(card.getByText(/recusou o Access Token/)).toBeVisible();
  await card.locator('input[name=accessToken]').fill(`APP_USR-TESTE-UI-${run}-0000000000`);
  await card.getByRole('button', { name: 'Conectar Mercado Pago' }).click();
  await expect(card.getByTestId('mp-conectado')).toContainText('Conectado como LOJA-FALSA');

  await page.goto(`/pedidos/${pedido.id}`);
  await page.getByRole('button', { name: 'Cobrar por Pix' }).click();
  const dlg = page.getByRole('dialog', { name: 'Cobrar por Pix' });
  await expect(dlg.getByRole('img', { name: 'QR Code do Pix' })).toBeVisible();
  await expect(dlg.getByText(/a baixa é automática/)).toBeVisible();
  await expect(dlg.getByRole('button', { name: /Recebi o Pix/ })).toHaveCount(0);

  // O cliente paga no app do banco → o Mercado Pago avisa a API.
  const it = (await (await request.get(`${API}/payments/intents?orderId=${pedido.id}`, { headers: h })).json())[0];
  expect(it.provider).toBe('mercadopago');
  expect((await request.post(`${FALSO}/__aprovar/${it.externalId}`)).ok()).toBeTruthy();
  const aviso = await request.post(`${API}/public/payments/mercadopago/webhook`, { data: { type: 'payment', data: { id: it.externalId } } });
  expect((await aviso.json()).status).toBe('PAID');

  await expect(dlg.getByText('Pagamento recebido — entrou no pedido.')).toBeVisible();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.card', { hasText: 'Pagamentos' })).toContainText('PIX');
  await expect(page.getByRole('button', { name: 'Cobrar por Pix' })).toHaveCount(0); // não falta nada

  await page.goto('/cobrancas');
  await expect(page.locator('table')).toContainText('PIX · Mercado Pago');
  await card.getByRole('button', { name: 'Desconectar' }).click();
  await expect(card.getByRole('button', { name: 'Conectar Mercado Pago' })).toBeVisible();
  await expect(page.getByText('Conecte o Mercado Pago ou cadastre a chave para começar a cobrar por Pix.')).toBeVisible();
});
