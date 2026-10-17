import { test, expect } from '@playwright/test';
import { apiLogin, uiLogin, run, API } from './_helpers';

test('login, painel com módulos ativos e menu gated', async ({ page }) => {
  await uiLogin(page, 'posto-demo');
  await expect(page.getByText('Faturamento')).toBeVisible();
  // posto-demo tem VAREJO + FOOD: os dois grupos aparecem; ACADEMIA e SERVIÇOS não.
  const side = page.locator('aside');
  await expect(side.getByText('Varejo', { exact: true })).toBeVisible();
  await expect(side.getByText('Food & Delivery')).toBeVisible();
  await expect(side.getByText('Academia')).toHaveCount(0);
  await expect(side.getByText('Serviços / Oficina')).toHaveCount(0);
  // Rota de módulo inativo explica em vez de quebrar.
  await page.goto('/academia');
  await expect(page.getByText('não está ativo para a sua empresa')).toBeVisible();
});

test('clientes: criar pelo modal e abrir o detalhe', async ({ page }) => {
  await uiLogin(page, 'loja-demo');
  await page.getByRole('link', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  await page.locator('input[name=name]').fill(`Cliente UI ${run}`);
  await page.locator('input[name=phone]').fill('11 98888-7777');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByPlaceholder('nome, telefone, documento').fill(`UI ${run}`);
  await page.getByRole('cell', { name: `Cliente UI ${run}` }).click();
  await expect(page.getByRole('heading', { name: `Cliente UI ${run}` })).toBeVisible();
  await expect(page.getByText('Total gasto')).toBeVisible();
});

test('PDV: abre caixa, bipa SKU, recebe PIX e conclui a venda', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'loja-demo');
  const sku = `UI-${run}`;
  const prod = await (await request.post(`${API}/products`, { headers: h, data: { name: `Boné ${run}`, sku, salePrice: 59.9, trackStock: true } })).json();
  await request.post(`${API}/stock/movements`, { headers: h, data: { variantId: prod.variants[0].id, kind: 'RECEIVE', quantity: 5 } });

  await uiLogin(page, 'loja-demo');
  await page.goto('/varejo/caixa');
  await page.locator('label:has-text("Terminal") input').fill(`UI-${run}`);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(page.getByText(`Caixa aberto · UI-${run}`)).toBeVisible();

  await page.goto('/varejo/pdv');
  const bipe = page.getByPlaceholder(/Bipe o código/);
  await bipe.fill(sku); await bipe.press('Enter');
  await expect(page.getByText(`Boné ${run}`)).toBeVisible();
  await bipe.fill(sku); await bipe.press('Enter');
  await expect(page.locator('.total')).toHaveText(/119,80/);
  await page.locator('.card:has-text("Pagamento") button:has-text("+")').click();
  await expect(page.getByText('Troco')).toBeVisible();
  await page.getByRole('button', { name: /Finalizar venda/ }).click();
  await expect(page.locator('.toast')).toHaveText(/Venda #\d+ concluída/);

  const saldo = await (await request.get(`${API}/stock/balances?variantId=${prod.variants[0].id}`, { headers: h })).json();
  expect(saldo[0].onHand).toBe('3');
});
