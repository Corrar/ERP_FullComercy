// e2e/operacao.spec.ts — as telas do dia a dia funcionando de ponta a ponta numa empresa recém-
// criada (como o cliente recebe depois de comprar):
//   • restaurante: abrir comanda, lançar rodada, cozinha (KDS) inicia e marca pronto, conta
//     dividida entre duas pessoas, relatórios por garçom e de tempo de cozinha;
//   • academia: recepção libera quem tem matrícula, barra quem não tem, registra a saída;
//   • oficina: abrir OS, ela aparece no kanban, diagnóstico → orçamento → cliente aprovou.
import { test, expect, type APIRequestContext } from '@playwright/test';
import { API, SENHA, run, uiLogin } from './_helpers';

async function empresaNova(request: APIRequestContext, prefixo: string, modulo: string) {
  const slug = `${prefixo}-${run.toLowerCase()}`;
  const r = await request.post(`${API}/platform/tenants`, { headers: { 'x-platform-key': process.env.PLATFORM_API_KEY! }, data: { slug, name: `${prefixo} ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: SENHA, modules: [modulo] } });
  expect(r.status()).toBe(201);
  const l = await (await request.post(`${API}/auth/login`, { data: { tenant: slug, email: `admin@${slug}.local`, password: SENHA } })).json();
  return { slug, h: { authorization: `Bearer ${l.accessToken}` } };
}

test('restaurante: comanda → cozinha → conta dividida → relatórios', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'op-food', 'FOOD');
  const p = await (await request.post(`${API}/products`, { headers: h, data: { name: 'Burger', sku: `BRG-${run}`, salePrice: 30, trackStock: false } })).json();
  const menu = await (await request.post(`${API}/m/food/menus`, { headers: h, data: { name: 'Principal', slug: `principal-${run.toLowerCase()}` } })).json();
  const cat = await (await request.post(`${API}/m/food/menus/${menu.id}/categorias`, { headers: h, data: { name: 'Lanches' } })).json();
  await request.post(`${API}/m/food/menus/${menu.id}/itens`, { headers: h, data: { categoryId: cat.id, variantId: p.variants[0].id, displayName: 'Burger', price: 30, station: 'CHAPA' } });

  await uiLogin(page, slug);
  await page.goto('/food/salao');
  await page.locator('.mesa', { hasText: 'Mesa 1' }).first().click();
  const mesa = page.getByRole('dialog', { name: 'Mesa 1' });
  await mesa.locator('input[name=guests]').fill('2');
  await mesa.getByRole('button', { name: 'Abrir comanda' }).click();
  await mesa.getByRole('button', { name: /Burger/ }).click();
  await mesa.getByRole('button', { name: /Burger/ }).click();
  await mesa.getByRole('button', { name: 'Enviar para a cozinha' }).click();
  await expect(mesa.getByTestId('conta-falta')).toHaveText(/R\$\s*66,00/); // 2 × 30 + 10%

  // Cozinha: o pedido chega, inicia e fica pronto.
  await page.goto('/food/cozinha');
  const ticket = page.locator('.ticket', { hasText: 'Mesa 1' });
  await ticket.getByRole('button', { name: 'Iniciar' }).click();
  await ticket.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByText('Fila vazia.')).toBeVisible();

  // Conta dividida: cada um paga a sua parte; a última fecha e libera a mesa.
  await page.goto('/food/salao');
  await page.locator('.mesa', { hasText: 'Mesa 1' }).first().click();
  await expect(mesa.getByTestId('por-pessoa')).toHaveText(/R\$\s*33,00 por pessoa/);
  await mesa.getByRole('button', { name: 'Receber parte' }).click();
  await expect(mesa.getByTestId('conta-falta')).toHaveText(/R\$\s*33,00/);
  await mesa.getByRole('combobox').filter({ has: page.locator('option[value=CASH]') }).selectOption('CASH');
  await mesa.getByRole('button', { name: 'Receber e fechar conta' }).click();
  await expect(mesa).toBeHidden();
  await expect(page.locator('.mesa', { hasText: 'Mesa 1' }).first()).toContainText('livre');

  await page.goto('/food/relatorios');
  await page.getByRole('tab', { name: 'Por garçom' }).click();
  await expect(page.locator('table')).toContainText('R$ 60,00');
  await page.getByRole('tab', { name: 'Tempo de cozinha' }).click();
  await expect(page.locator('table')).toContainText('CHAPA');
});

test('academia: recepção libera matriculado, barra quem não tem matrícula e registra a saída', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'op-gym', 'ACADEMIA');
  const plano = await (await request.post(`${API}/m/academia/planos`, { headers: h, data: { name: 'Mensal', price: 99.9 } })).json();
  const aluno = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Aluna Ana ${run}` } })).json();
  await request.post(`${API}/customers`, { headers: h, data: { name: `Visitante Beto ${run}` } });
  const adesao = await (await request.post(`${API}/orders`, { headers: h, data: { channel: 'SUBSCRIPTION', customerId: aluno.id, items: [], moduleData: { planId: plano.id } } })).json();
  await request.post(`${API}/orders/${adesao.id}/payments`, { headers: h, data: { payments: [{ method: 'PIX', amount: 99.9 }] } });

  await uiLogin(page, slug);
  await page.goto('/academia/recepcao');
  const busca = page.getByPlaceholder('nome ou telefone do aluno');
  await busca.fill('Visitante Beto');
  await page.getByRole('row', { name: /Visitante Beto/ }).getByRole('button', { name: 'Check-in' }).click();
  await expect(page.getByText(/acesso negado — sem matrícula ativa/)).toBeVisible();

  await busca.fill('Aluna Ana');
  await page.getByRole('row', { name: /Aluna Ana/ }).getByRole('button', { name: 'Check-in' }).click();
  await expect(page.getByText(`Aluna Ana ${run}: acesso liberado`)).toBeVisible();
  const presentes = page.locator('.card', { hasText: 'Presentes agora' });
  await expect(presentes).toContainText('Presentes agora (1)');
  await presentes.getByRole('button', { name: 'Saída' }).click();
  await expect(presentes).toContainText('Presentes agora (0)');
});

test('oficina: abrir OS, ver no kanban, diagnóstico, orçamento e aprovação', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'op-svc', 'SERVICOS');
  await request.post(`${API}/customers`, { headers: h, data: { name: `Cliente Carro ${run}` } });
  const placa = `OPS${String(Date.now()).slice(-4)}`;

  await uiLogin(page, slug);
  await page.goto('/servicos/nova');
  await page.locator('select[name=customerId]').selectOption({ label: `Cliente Carro ${run}` });
  await page.locator('input[name=plate]').fill(placa);
  await page.locator('textarea[name=complaint]').fill('Barulho na suspensão');
  await page.getByRole('button', { name: 'Abrir OS' }).click();
  await expect(page).toHaveURL(/\/servicos\/os\//);

  // O kanban mostra a OS na coluna de entrada; clicar abre a OS.
  await page.goto('/servicos');
  const card = page.locator('.kanban .card', { hasText: placa });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: 'Diagnóstico' }).click();
  await page.getByRole('button', { name: 'Enviar orçamento' }).click();
  const orc = page.getByRole('dialog', { name: 'Enviar orçamento' });
  await orc.locator('textarea[name=diagnosis]').fill('Bucha da bandeja gasta');
  await orc.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('button', { name: 'Cliente aprovou' }).click();
  await expect(page.getByRole('button', { name: 'Em serviço' })).toBeVisible();

  await page.goto('/servicos');
  await expect(page.locator('.kanban > div', { hasText: 'Aprovado' }).locator('.card', { hasText: placa })).toBeVisible();
});
