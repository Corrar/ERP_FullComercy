// e2e/gestao.spec.ts — telas que a loja vendia sem existir: trocas e devoluções (com o vale abatido
// no PDV), regras de comissão, zonas de entrega e acerto do entregador.
import { test, expect } from '@playwright/test';
import { API, apiLogin, run, uiLogin } from './_helpers';

test('troca: devolve em vale na tela de Trocas e o PDV abate o vale na venda nova', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'loja-demo');
  const sku = `TRC-${run}`; const terminal = `TRC-${run}`;
  const prod = await (await request.post(`${API}/products`, { headers: h, data: { name: `Jaqueta ${run}`, sku, salePrice: 150, trackStock: true } })).json();
  await request.post(`${API}/stock/movements`, { headers: h, data: { variantId: prod.variants[0].id, kind: 'RECEIVE', quantity: 5 } });
  const cliente = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Cliente Vale ${run}` } })).json();
  const caixa = await (await request.post(`${API}/m/varejo/caixa/abrir`, { headers: h, data: { terminal, openingAmount: 0 } })).json();
  const venda = await (await request.post(`${API}/orders`, { headers: h, data: { channel: 'POS', customerId: cliente.id, items: [{ variantId: prod.variants[0].id, quantity: 2 }], payments: [{ method: 'PIX', amount: 300 }], moduleData: { posSessionId: caixa.id } } })).json();
  expect(venda.status).toBe('COMPLETED');

  await page.addInitScript((t) => localStorage.setItem('fc.terminal', t), terminal);
  await uiLogin(page, 'loja-demo');
  await page.goto('/varejo/devolucoes');
  await page.getByPlaceholder(/Número da venda/).fill(String(venda.number));
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText(`Venda #${venda.number}`)).toBeVisible();
  await page.getByLabel(`Devolver Jaqueta ${run}`).fill('1');
  await expect(page.locator('strong.mono')).toHaveText(/150,00/);
  await page.getByRole('button', { name: 'Gerar vale' }).click();
  await expect(page.locator('.toast')).toHaveText(new RegExp(`Vale de R\\$\\s?150,00 para Cliente Vale ${run}`));
  await expect(page.locator('.card:has-text("Últimas devoluções")').getByRole('cell', { name: `#${venda.number}` }).first()).toBeVisible();
  // Já devolvida 1 de 2: o campo agora só aceita mais 1.
  await expect(page.getByLabel(`Devolver Jaqueta ${run}`)).toHaveAttribute('max', '1');

  // PDV: leva a mesma jaqueta (150) pagando só com o vale.
  await page.goto('/varejo/pdv');
  const bipe = page.getByPlaceholder(/Bipe o código/);
  await bipe.fill(sku); await bipe.press('Enter');
  await expect(page.locator('.total')).toHaveText(/150,00/);
  await page.getByRole('button', { name: 'Usar vale' }).click();
  await page.getByPlaceholder(/Nome, telefone ou documento/).fill(`Cliente Vale ${run}`);
  await page.getByRole('cell', { name: `Cliente Vale ${run}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Usar' }).click();
  await expect(page.getByText(`Vale de Cliente Vale ${run}`)).toBeVisible();
  await expect(page.getByText('Troco')).toBeVisible(); // nada falta: o vale cobre tudo
  await page.getByRole('button', { name: /Finalizar venda/ }).click();
  await expect(page.locator('.toast')).toHaveText(/Venda #\d+ concluída/);

  const vales = await (await request.get(`${API}/m/varejo/devolucoes/vales/${cliente.id}`, { headers: h })).json();
  expect(vales).toHaveLength(0);
  // A venda paga só com vale CONCLUI (antes ficava aberta: sem pagamento no rascunho o core não fechava).
  const { rows } = await (await request.get(`${API}/orders?customerId=${cliente.id}`, { headers: h })).json();
  const nova = rows.find((o: any) => o.id !== venda.id);
  expect(nova.status).toBe('COMPLETED');
  expect(nova.total).toBe('150');
});

test('comissões: cria regra por categoria e exclui', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'loja-demo');
  const cat = await (await request.post(`${API}/products/categories`, { headers: h, data: { name: `Acessórios ${run}` } })).json();
  await request.post(`${API}/m/varejo/vendedores`, { headers: h, data: { name: `Vend ${run}`, defaultCommissionRate: 3 } });

  await uiLogin(page, 'loja-demo');
  await page.goto('/varejo/comissoes');
  await page.getByRole('button', { name: 'Nova regra' }).click();
  const dlg = page.getByRole('dialog');
  // Sem vendedor e sem categoria a API recusa (a regra não casaria com nada).
  await dlg.locator('input[name=rate]').fill('7');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Escolha um vendedor, uma categoria');
  await dlg.locator('select[name=categoryId]').selectOption(cat.id);
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg).toBeHidden();
  const linha = page.locator('tr', { hasText: `Acessórios ${run}` });
  await expect(linha).toContainText('Todos');
  await expect(linha).toContainText('7%');
  await linha.getByRole('button', { name: /Excluir regra/ }).click();
  await expect(page.locator('tr', { hasText: `Acessórios ${run}` })).toHaveCount(0);
});

test('entregas: zona por CEP, conferência do CEP, entregador novo e acerto', async ({ page }) => {
  // CEP inteiro como prefixo: único por rodada, não casa com zona de rodada anterior.
  const prefixo = String(Date.now() % 100000000).padStart(8, '0');
  await uiLogin(page, 'burger-demo');
  await page.goto('/food/entregas');

  await page.getByRole('tab', { name: 'Zonas e taxas' }).click();
  await page.getByRole('button', { name: 'Nova zona' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[name=name]').fill(`Zona ${run}`);
  await dlg.locator('input[name=ceps]').fill(`${prefixo.slice(0, 5)}-${prefixo.slice(5)}`);
  await dlg.locator('input[name=fee]').fill('7.5');
  await dlg.locator('input[name=etaMin]').fill('40');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg).toBeHidden();
  const linha = page.locator('tr', { hasText: `Zona ${run}` });
  await expect(linha).toContainText(prefixo);
  await expect(linha).toContainText('7,50');
  await page.getByPlaceholder('CEP do cliente').fill(`${prefixo.slice(0, 5)}-${prefixo.slice(5)}`);
  await page.getByRole('button', { name: 'Conferir' }).click();
  const conferencia = page.locator('.card:has-text("Qual zona atende")');
  await expect(conferencia).toContainText(`Zona ${run} · taxa R$`);
  // Desativada, a zona deixa de atender.
  await linha.getByRole('switch').click();
  await expect(linha.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Conferir' }).click();
  await expect(conferencia).toContainText('Nenhuma zona ativa atende este CEP.');

  await page.getByRole('tab', { name: 'Entregadores e acerto' }).click();
  await page.getByRole('button', { name: 'Novo entregador' }).click();
  await page.getByRole('dialog').locator('input[name=name]').fill(`Moto ${run}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  const ent = page.locator('tr', { hasText: `Moto ${run}` });
  await ent.getByRole('button', { name: 'Acerto' }).click();
  await expect(page.getByRole('dialog').getByText('Entregas', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Entregador repassa para a loja');
});
