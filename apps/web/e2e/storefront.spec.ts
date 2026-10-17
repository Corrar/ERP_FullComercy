import { test, expect } from '@playwright/test';
import { apiLogin, run, API } from './_helpers';

test('vitrine pública: cardápio → carrinho → pedido como convidado → acompanhamento', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'burger-demo');
  const prod = await (await request.post(`${API}/products`, { headers: h, data: { name: `Combo UI ${run}`, sku: `CUI-${run}`, salePrice: 30, trackStock: false } })).json();
  const slug = `ui-${run.toLowerCase()}`;
  const menu = await (await request.post(`${API}/m/food/menus`, { headers: h, data: { name: `UI ${run}`, slug } })).json();
  const cat = await (await request.post(`${API}/m/food/menus/${menu.id}/categorias`, { headers: h, data: { name: 'Lanches' } })).json();
  await request.post(`${API}/m/food/menus/${menu.id}/itens`, { headers: h, data: { categoryId: cat.id, variantId: prod.variants[0].id, displayName: 'Combo da casa', price: 34.9 } });
  await request.patch(`${API}/m/food/menus/${menu.id}`, { headers: h, data: { isPublished: true } });

  await page.goto(`/cardapio/burger-demo/${slug}`);
  await expect(page.getByRole('heading', { name: 'Burger Demo (Food)' })).toBeVisible();
  await page.locator('.card:has-text("Combo da casa") button').click();
  await page.locator('.card:has-text("Combo da casa") button').click();
  await page.getByRole('button', { name: /Carrinho \(2\)/ }).click();
  await page.locator('input[name=nome]').fill('Cliente Vitrine');
  await page.locator('input[name=telefone]').fill(`11 97${run.slice(0, 3)}-0000`);
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
  await expect(page.getByText('R$ 69,80')).toBeVisible();

  // A loja vê o pedido na cozinha.
  const fila = await (await request.get(`${API}/m/food/cozinha/fila`, { headers: h })).json();
  expect(fila.some((t: any) => t.items.some((i: any) => i.display.nome === 'Combo da casa'))).toBeTruthy();
});
