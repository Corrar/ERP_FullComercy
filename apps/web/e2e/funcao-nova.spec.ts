// e2e/funcao-nova.spec.ts — função contratada depois já chega pronta: a oficina compra sem Agenda,
// adiciona em Assinatura e, SEM sair e entrar, o menu ganha "Agenda", o painel mostra o passo de
// como começar e o primeiro agendamento sai. E a Cobrança online: chave Pix, "Cobrar por Pix" no
// pedido, link que o cliente abre sem login, confirmação e pedido pago.
// Que TODA função opcional responde ao ser contratada é provado no e2e da API (funcoes-prontas).
import { test, expect } from '@playwright/test';
import { API, apiLogin, run, uiLogin } from './_helpers';

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 104_729) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

test('função nova: adicionar Agenda na assinatura e já agendar', async ({ page, request }) => {
  const conta = await (await request.post(`${API}/account/register`, { data: { name: 'Dono Oficina', email: `agenda-ui-${run.toLowerCase()}@exemplo.com`, password: 'Senha-forte-123' } })).json();
  const compra = await request.post(`${API}/account/checkout`, {
    headers: { authorization: `Bearer ${conta.token}` },
    data: { company: { name: `Oficina Agenda ${run}`, document: cpf(23) }, modules: ['SERVICOS'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } },
  });
  expect(compra.status()).toBe(201);
  const { session } = await compra.json();
  await request.post(`${API}/customers`, { headers: { authorization: `Bearer ${session.accessToken}` }, data: { name: `Cliente Agenda ${run}` } });
  // Só na primeira carga: depois quem manda é a sessão que o app atualizou (com a função nova).
  await page.addInitScript((s) => { if (!localStorage.getItem('fc.session')) localStorage.setItem('fc.session', s); }, JSON.stringify(session));

  await page.goto('/');
  const menu = page.locator('.sidebar');
  await expect(menu.getByRole('link', { name: 'Painel de OS' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Agenda' }), 'sem a função, sem o item').toHaveCount(0);

  await page.goto('/assinatura');
  await page.getByRole('button', { name: 'Alterar funções' }).click();
  const modal = page.getByRole('dialog', { name: 'Alterar funções do plano' });
  await modal.locator('[data-feature="svc.agenda"] [role=switch]').click();
  await modal.getByRole('button', { name: 'Salvar plano' }).click();
  await expect(page.getByText(/Plano atualizado/)).toBeVisible();

  // Sem recarregar a página: o menu já tem a Agenda e o painel diz como começar.
  await expect(menu.getByRole('link', { name: 'Agenda' })).toBeVisible();
  await menu.getByRole('link', { name: 'Painel', exact: true }).click();
  const guia = page.locator('.card', { has: page.getByText('Primeiros passos', { exact: true }) });
  await guia.locator('[data-passo="svc.agenda"]').getByRole('link', { name: 'Fazer agora' }).click();
  await expect(page).toHaveURL(/\/servicos\/agenda$/);

  await page.getByRole('button', { name: 'Agendar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Agendar' });
  const amanha = new Date(Date.now() + 86_400_000); amanha.setHours(10, 0, 0, 0);
  const local = new Date(amanha.getTime() - amanha.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await dlg.locator('input[name=scheduledAt]').fill(local);
  await dlg.locator('input[name=service]').fill(`Revisão ${run}`);
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText(`Revisão ${run}`)).toBeVisible();

  await page.goto('/');
  await expect(guia.locator('[data-passo="svc.agenda"]')).toHaveClass(/feito/);
});

test('cobrança online: chave Pix, cobrar o pedido por Pix, cliente abre o link, confirmar', async ({ page, request, context }) => {
  const T = 'oficina-demo';
  const { h } = await apiLogin(request, T);
  const cli = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Cliente Pix ${run}` } })).json();
  const pedido = await (await request.post(`${API}/orders`, { headers: h, data: { customerId: cli.id, items: [{ kind: 'SERVICE', description: `Troca de óleo ${run}`, quantity: 1, unitPrice: 89.9 }], moduleData: { plate: `PXU${String(Date.now()).slice(-4)}` } } })).json();

  await uiLogin(page, T);
  await page.getByRole('link', { name: 'Cobranças online' }).click();
  await page.locator('input[name=chave]').fill('+55 11 98888-7777');
  await page.locator('input[name=nome]').fill('Oficina Demo');
  await page.locator('input[name=cidade]').fill('Campinas');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByText('Chave Pix salva.')).toBeVisible();

  await page.goto(`/pedidos/${pedido.id}`);
  await page.getByRole('button', { name: 'Cobrar por Pix' }).click();
  const dlg = page.getByRole('dialog', { name: 'Cobrar por Pix' });
  await expect(dlg.getByRole('img', { name: 'QR Code do Pix' })).toBeVisible();
  await expect(dlg.getByText('R$ 89,90')).toBeVisible();

  // O cliente abre o link sem login e vê a empresa, o valor e o Pix.
  const it = (await (await request.get(`${API}/payments/intents?orderId=${pedido.id}`, { headers: h })).json())[0];
  const cliente = await context.newPage();
  await cliente.goto(new URL(it.checkoutUrl).pathname);
  await expect(cliente.getByText('R$ 89,90')).toBeVisible();
  await expect(cliente.getByRole('img', { name: 'QR Code do Pix' })).toBeVisible();
  await expect(cliente.getByRole('button', { name: 'Copiar código Pix' })).toBeVisible();

  // Caiu na conta: confirma e o pedido fica pago; o link passa a dizer "confirmado".
  await dlg.getByRole('button', { name: /Recebi o Pix/ }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.card', { hasText: 'Pagamentos' })).toContainText('PIX');
  await cliente.getByRole('button', { name: /Já paguei/ }).click();
  await expect(cliente.getByText('Pagamento confirmado. Obrigado!')).toBeVisible();
});
