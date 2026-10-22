// e2e/nucleo.spec.ts — telas que faltavam: DRE no financeiro, auditoria, eixos da grade, vendedor
// (editar e desativar) e cadastro de mesas do salão.
import { test, expect } from '@playwright/test';
import { API, apiLogin, run, uiLogin } from './_helpers';

test('financeiro: DRE mostra o recebido no período e a auditoria registra a baixa', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'oficina-demo');
  const cat = await (await request.post(`${API}/finance/categories`, { headers: h, data: { name: `Receita UI ${run}`, kind: 'RECEIVABLE' } })).json();
  const e = await (await request.post(`${API}/finance/entries`, { headers: h, data: { kind: 'RECEIVABLE', description: `DRE ${run}`, amount: 123.45, dueDate: new Date().toISOString(), categoryId: cat.id } })).json();
  await request.post(`${API}/finance/entries/${e.id}/settle`, { headers: h, data: { amount: 123.45, method: 'PIX' } });

  await uiLogin(page, 'oficina-demo');
  await page.goto('/financeiro');
  await page.getByRole('tab', { name: 'DRE' }).click();
  const linha = page.locator('.card:has-text("Receitas") tr', { hasText: `Receita UI ${run}` });
  await expect(linha).toContainText('123,45');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^dre-.*\.pdf$/);

  await page.goto('/auditoria');
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await page.getByPlaceholder(/order\., retail\./).fill('finance.');
  await expect(page.locator('td.mono, td .mono', { hasText: /^finance\./ }).first()).toBeVisible();
});

test('varejo: eixo e valor da grade; vendedor editado e desativado', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'loja-demo');
  await request.post(`${API}/m/varejo/vendedores`, { headers: h, data: { name: `Vend Ed ${run}`, defaultCommissionRate: 2 } });

  await uiLogin(page, 'loja-demo');
  await page.goto('/varejo/grade');
  await page.getByRole('button', { name: 'Novo eixo' }).click();
  await page.getByRole('dialog').locator('input[name=name]').fill(`Eixo ${run}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  const eixo = page.locator('tr', { hasText: `Eixo ${run}` });
  await expect(eixo).toContainText('nenhum');
  await eixo.getByRole('button', { name: 'Adicionar valor' }).click();
  await page.getByRole('dialog').locator('input[name=value]').fill('XG');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(eixo).toContainText('XG');

  await page.goto('/varejo/comissoes');
  const vend = page.locator('tr', { hasText: `Vend Ed ${run}` });
  await vend.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').locator('input[name=defaultCommissionRate]').fill('4.5');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(vend).toContainText('4.5%');
  await vend.getByRole('switch').click();
  await expect(vend.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('food: nova mesa no salão, editada e desativada', async ({ page }) => {
  const numero = String(1000 + (Date.now() % 90000));
  await uiLogin(page, 'burger-demo');
  await page.goto('/food/salao');
  await page.getByRole('button', { name: 'Nova mesa' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[name=number]').fill(numero);
  await dlg.locator('input[name=area]').fill(`Varanda ${run}`);
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  const mesa = page.locator('.mesa', { hasText: `Mesa ${numero}` });
  await expect(mesa).toContainText(`Varanda ${run}`);
  await mesa.click();
  await page.getByRole('dialog').locator('input[name=area]').fill(`Terraço ${run}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar mesa' }).click();
  await expect(mesa).toContainText(`Terraço ${run}`);
  await mesa.click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Desativar mesa' }).click();
  await expect(mesa).toHaveCount(0);
});

test('listagens paginadas, CSV de pedidos com token e marca dos e-mails', async ({ page }) => {
  await uiLogin(page, 'loja-demo');
  await page.goto('/pedidos');
  await expect(page.getByText(/registro\(s\)|\d+–\d+ de \d+/)).toBeVisible();
  // Antes era um link direto para /api sem o Bearer: o arquivo vinha com o 401.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  const arq = await download;
  expect(arq.suggestedFilename()).toBe('pedidos.csv');
  const fs = await import('node:fs/promises');
  expect(await fs.readFile((await arq.path())!, 'utf8')).toMatch(/^﻿id;/);

  await page.goto('/clientes');
  await expect(page.getByText(/registro\(s\)|\d+–\d+ de \d+/)).toBeVisible();

  await page.goto('/empresa');
  const marca = page.locator('.card:has-text("Marca nos e-mails")');
  await marca.locator('input[name=logoUrl]').fill('https://cdn.exemplo.com/loja.png');
  await marca.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.toast')).toHaveText('Marca dos e-mails salva.');
});
