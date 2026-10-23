// e2e/marca.spec.ts — marca da empresa na tela: enviar a logo e escolher a cor na tela Empresa, ver o
// menu repintar na hora, e o aparelho da equipe voltar para a página DA EMPRESA (logo e nome dela)
// ao sair. Recusas de arquivo, permissão e e-mail são provadas no e2e da API (marca.test.ts).
import { test, expect } from '@playwright/test';
import { API, SENHA, apiLogin, uiLogin } from './_helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const T = 'pousada-demo';

test('Marca: logo e cor da empresa no sistema e na página de acesso da equipe', async ({ page, request }) => {
  const { h } = await apiLogin(request, T);
  try {
    await uiLogin(page, T);
    await page.goto('/empresa');
    const card = page.locator('.card', { hasText: 'Marca da empresa' });
    await expect(page.locator('.sidebar .sb-logo')).toHaveCount(0);

    await card.getByLabel('Arquivo do logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Logo salvo.')).toBeVisible();
    await expect(card.getByTestId('logo-atual')).toBeVisible();
    await expect(page.locator('.sidebar .sb-logo img'), 'o menu troca sem sair e entrar').toBeVisible();

    await card.getByLabel('Cor da empresa').fill('#7a1f3d');
    await card.getByRole('checkbox').check();
    await card.getByRole('button', { name: 'Salvar cor' }).click();
    await expect(page.getByText('Cor salva.')).toBeVisible();
    await expect(page.locator('.sidebar .sb-item.active')).toHaveCSS('background-color', 'rgb(122, 31, 61)');

    const link = await card.getByLabel('Link de acesso da equipe').inputValue();
    expect(link).toMatch(new RegExp(`/e/${T}$`));

    // Sair: o aparelho da equipe volta para a página da empresa, não para a loja.
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${T}$`));
    await expect(page.getByRole('heading', { name: 'Pousada Demo (Hotelaria)' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Logo de Pousada Demo (Hotelaria)' })).toBeVisible();
    await expect(page.locator('input[name=tenant]'), 'a empresa já vem do link').toHaveCount(0);
    await page.locator('input[name=email]').fill(`admin@${T}.local`);
    await page.locator('input[name=password]').fill(SENHA);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/empresa$/);
    await expect(page.getByRole('heading', { name: 'Empresa e módulos' })).toBeVisible();
  } finally {
    // A pousada do seed volta ao normal para as outras specs.
    await request.delete(`${API}/tenant/marca/logo`, { headers: h });
    await request.put(`${API}/tenant/settings`, { headers: h, data: { marca: { corNoSistema: false } } });
  }
});
