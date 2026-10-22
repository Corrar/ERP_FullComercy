// e2e/primeiros-passos.spec.ts — a entrega a quem comprou: empresa nova abre o painel com o guia do
// módulo, "Fazer agora" leva à tela, o passo feito aparece marcado, e o dono pode dispensar e rever.
import { test, expect } from '@playwright/test';
import { API, SENHA, run, uiLogin } from './_helpers';

test('primeiros passos: guia do Varejo no painel, marca o feito, dispensa e volta', async ({ page, request }) => {
  const slug = `guia-${run.toLowerCase()}`;
  const r = await request.post(`${API}/platform/tenants`, { headers: { 'x-platform-key': process.env.PLATFORM_API_KEY! }, data: { slug, name: 'Guia Ltda', adminEmail: `admin@${slug}.local`, adminPassword: SENHA, modules: ['VAREJO'] } });
  expect(r.status()).toBe(201);

  await uiLogin(page, slug);
  const guia = page.locator('.card', { has: page.getByText('Primeiros passos', { exact: true }) });
  await expect(guia).toContainText('Faltam 6 de 6 passos');
  // O primeiro passo pendente é o destaque; "Fazer agora" leva à tela certa.
  await guia.locator('[data-passo="varejo.produtos"]').getByRole('link', { name: 'Fazer agora' }).click();
  await expect(page).toHaveURL(/\/produtos$/);
  await page.getByRole('button', { name: 'Novo produto' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[name=name]').fill(`Boné ${run}`);
  await dlg.locator('input[name=sku]').fill(`BON-${run}`);
  await dlg.locator('input[name=salePrice]').fill('40');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg).toBeHidden();

  await page.goto('/');
  await expect(guia).toContainText('Faltam 5 de 6 passos');
  await expect(guia.locator('[data-passo="varejo.produtos"]')).toHaveClass(/feito/);
  await expect(guia.locator('[data-passo="varejo.estoque"]')).toHaveClass(/proximo/);

  await guia.getByRole('button', { name: 'Não mostrar mais' }).click();
  await expect(guia).toHaveCount(0);
  await page.goto('/empresa');
  await page.getByRole('button', { name: 'Mostrar de novo' }).click();
  await page.goto('/');
  await expect(guia).toContainText('Faltam 5 de 6 passos');
});
