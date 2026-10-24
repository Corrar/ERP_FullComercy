// e2e/apresentacao.spec.ts — a APRESENTAÇÃO (/inicio): é a porta de entrada de quem não tem conta,
// mostra os ramos e os números do catálogo do servidor, e os CTAs levam à loja. A cena 3D precisa
// sair do estado "carregando" (ok, ou some sem WebGL), e com movimento reduzido o conteúdo aparece
// sem depender de animação.
import { test, expect } from '@playwright/test';
import { API } from './_helpers';

test('apresentação: raiz sem conta → /inicio, ramos e números do catálogo, CTAs levam à loja', async ({ page, request }) => {
  const catalog = await (await request.get(`${API}/public/billing/catalog`)).json();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/O sistema do seu comércio,\s+montado função por função\./);
  await expect(page.locator('canvas.lp-cena')).toHaveAttribute('data-webgl', /^(ok|indisponivel)$/);

  // Um cartão por ramo do catálogo; os números são os do servidor.
  await expect(page.locator('[data-ramo]')).toHaveCount(catalog.modules.length);
  const numeros = page.getByRole('region', { name: 'O sistema em números' });
  await numeros.scrollIntoViewIfNeeded();
  await expect(numeros).toContainText(`${catalog.modules.length}ramos de comércio`);
  await expect(numeros).toContainText(`${catalog.features.length}funções para ligar`);

  // Cartão do ramo abre a montagem daquele comércio.
  await page.locator('[data-ramo=VAREJO]').click();
  await expect(page).toHaveURL(/\/comecar\/varejo$/);
  await expect(page.getByRole('heading', { name: 'Monte o seu ERP de Varejo' })).toBeVisible();

  await page.goto('/inicio');
  await page.locator('.lp-hero').getByRole('link', { name: 'Já sou cliente' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(erros).toEqual([]);
});

test('apresentação com movimento reduzido: tudo visível sem animar, celular sem rolagem lateral', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.lp-hero').getByRole('button', { name: 'Montar meu sistema' })).toBeVisible();
  for (const id of ['#ramos', '#como-funciona', '#recursos']) {
    await page.locator(id).scrollIntoViewIfNeeded();
    await expect(page.locator(`${id} h2`)).toBeVisible();
  }
  await expect(page.locator('.lp-passo').first()).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.lp-final').getByRole('button', { name: 'Montar meu sistema' }).click();
  await expect(page).toHaveURL(/\/comecar$/);
});
