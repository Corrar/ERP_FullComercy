// e2e/lgpd.spec.ts — ficha do cliente: exportar os dados do titular (arquivo baixado com o token) e
// anonimizar confirmando pelo nome. O que é apagado e o que fica é provado no e2e da API
// (lgpd.test.ts); aqui vale a jornada na tela.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { API, apiLogin, run, uiLogin } from './_helpers';

test('LGPD: exportar e anonimizar pela ficha do cliente', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'posto-demo');
  const nome = `Titular Tela ${run}`;
  const cli = await (await request.post(`${API}/customers`, { headers: h, data: { name: nome, email: `tela-${run.toLowerCase()}@exemplo.com`, phone: '11 90000-4242' } })).json();

  await uiLogin(page, 'posto-demo');
  await page.goto(`/clientes/${cli.id}`);
  const card = page.locator('.card', { hasText: 'Privacidade (LGPD)' });
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Exportar dados' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^dados-titular-.*\.json$/);
  const doc = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(doc.titular.nome).toBe(nome);
  expect(doc.titular.telefone).toBe('11900004242');

  await card.getByRole('button', { name: 'Anonimizar' }).click();
  const modal = page.getByRole('dialog', { name: 'Anonimizar cliente' });
  const confirmar = modal.getByRole('button', { name: 'Anonimizar de vez' });
  await expect(confirmar).toBeDisabled();
  await modal.getByRole('textbox').fill('nome errado');
  await expect(confirmar).toBeDisabled();
  await modal.getByRole('textbox').fill(nome.toLowerCase());
  await confirmar.click();
  await expect(page.getByRole('heading', { name: /^Titular anonimizado / })).toBeVisible();
  await expect(page.getByText('Cliente anonimizado.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Anonimizar' })).toHaveCount(0);
  await expect(page.locator('input[name=phone]')).toHaveValue('');
});
