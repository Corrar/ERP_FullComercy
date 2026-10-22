// e2e/primeiro-dia.spec.ts — o PRIMEIRO DIA de cada comércio, só pela tela, numa empresa vazia
// (como o cliente recebe depois de comprar): os cadastros que o guia pede e a primeira operação.
// Nada é preparado pela API — se uma tela exigir algo que o cliente não tem como fazer por ela,
// este teste quebra.
import { test, expect, type Page } from '@playwright/test';
import { cadastrarClienteNoSeletor, empresaNova, run, uiLogin } from './_helpers';

const amanha = (h = 10) => { const d = new Date(Date.now() + 86_400_000); d.setHours(h, 0, 0, 0); return d; };
const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
async function modal(page: Page, titulo: string) { const m = page.getByRole('dialog', { name: titulo }); await expect(m).toBeVisible(); return m; }

test('restaurante: cardápio do zero (sem produto cadastrado) → comanda com o prato', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-food', 'FOOD');
  await uiLogin(page, slug);
  await page.goto('/food/cardapio');
  await expect(page.getByText('Nenhum cardápio ainda.')).toBeVisible();
  await page.getByRole('button', { name: 'Novo cardápio' }).click();
  let m = await modal(page, 'Novo cardápio');
  await m.locator('input[name=name]').fill('Almoço Executivo');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: 'Categoria', exact: true }).click();
  m = await modal(page, 'Nova categoria');
  await m.locator('input[name=name]').fill('Pratos');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: 'Item', exact: true }).click();
  m = await modal(page, 'Novo item');
  await m.locator('input[name=displayName]').fill('Parmegiana');
  await m.locator('input[name=price]').fill('42.5');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Parmegiana')).toBeVisible();

  await page.goto('/food/salao');
  await page.locator('.mesa', { hasText: 'Mesa 1' }).first().click();
  m = await modal(page, 'Mesa 1');
  await m.getByRole('button', { name: 'Abrir comanda' }).click();
  await m.getByRole('button', { name: /Parmegiana/ }).click();
  await m.getByRole('button', { name: 'Enviar para a cozinha' }).click();
  await expect(m.getByTestId('conta-falta')).toHaveText(/R\$\s*46,75/); // 42,50 + 10%
});

test('academia: plano → aluno novo matriculado pagando → check-in na recepção', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-gym', 'ACADEMIA');
  await uiLogin(page, slug);
  await page.goto('/academia/planos');
  await page.getByRole('button', { name: 'Novo plano' }).click();
  let m = await modal(page, 'Novo plano');
  await m.locator('input[name=name]').fill('Mensal');
  await m.locator('input[name=price]').fill('99.90');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Mensal')).toBeVisible();

  await page.goto('/academia/matriculas');
  await page.getByRole('button', { name: 'Nova adesão' }).click();
  m = await modal(page, 'Nova adesão');
  await cadastrarClienteNoSeletor(m, `Aluno Novo ${run}`, 'aluno');
  await expect(m.locator('input[name=amount]')).toHaveValue('99.90');
  await m.getByRole('button', { name: 'Registrar adesão' }).click();
  await expect(page.getByText(`Aluno Novo ${run} matriculado(a) no Mensal.`)).toBeVisible();
  await expect(page.locator('table')).toContainText(`Aluno Novo ${run}`);

  await page.goto('/academia/recepcao');
  await page.getByPlaceholder('nome ou telefone do aluno').fill('Aluno Novo');
  await page.getByRole('row', { name: /Aluno Novo/ }).getByRole('button', { name: 'Check-in' }).click();
  await expect(page.getByText(`Aluno Novo ${run}: acesso liberado`)).toBeVisible();
});

test('varejo: produto sem SKU → entrada no estoque → abrir caixa → venda no PDV pelo nome', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-loja', 'VAREJO');
  await uiLogin(page, slug);
  await page.goto('/produtos');
  await page.getByRole('button', { name: 'Novo produto' }).click();
  let m = await modal(page, 'Novo produto');
  await m.locator('input[name=name]').fill(`Caneca ${run}`);
  await m.locator('input[name=salePrice]').fill('25');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByText(`Caneca ${run}`)).toBeVisible();

  await page.goto('/estoque');
  await page.getByRole('button', { name: 'Movimentar' }).click();
  m = await modal(page, 'Movimento manual');
  await m.getByLabel('Buscar produto').fill(`Caneca ${run}`);
  await m.getByRole('button', { name: new RegExp(`Caneca ${run}`) }).first().click();
  await m.locator('input[name=quantity]').fill('10');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m).toBeHidden();

  await page.goto('/varejo/caixa');
  await page.locator('input[name=openingAmount]').fill('100');
  await page.getByRole('button', { name: 'Abrir' }).click();
  await page.goto('/varejo/pdv');
  await page.getByPlaceholder('Bipe o código de barras ou digite o SKU e Enter').fill(`Caneca ${run}`);
  await page.getByPlaceholder('Bipe o código de barras ou digite o SKU e Enter').press('Enter');
  await expect(page.locator('.card', { hasText: 'Itens' })).toContainText(`Caneca ${run}`);
  // Venda rápida: o meio escolhido (Pix) leva o total; F12 finaliza, como diz o botão.
  await page.keyboard.press('F12');
  await expect(page.locator('.toast')).toHaveText(/Venda #\d+ concluída/);
  await expect(page.locator('.card', { hasText: 'Itens' })).toContainText('Carrinho vazio');
});

const diaAmanha = () => isoLocal(amanha()).slice(0, 10);

test('salão de beleza: profissional e serviço → agenda com cliente nova', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-bel', 'BELEZA');
  await uiLogin(page, slug);
  await page.goto('/beleza/cadastros');
  await page.getByRole('button', { name: 'Novo profissional' }).click();
  let m = await modal(page, 'Novo profissional');
  await m.locator('input[name=name]').fill('Carla');
  await m.locator('input[name=commissionRate]').fill('40');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: 'Novo serviço' }).click();
  m = await modal(page, 'Novo serviço');
  await m.locator('input[name=name]').fill('Escova');
  await m.locator('input[name=durationMin]').fill('45');
  await m.locator('input[name=price]').fill('60');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Escova')).toBeVisible();

  await page.goto('/beleza/agenda');
  await page.getByLabel('Dia', { exact: true }).fill(diaAmanha());
  await page.getByRole('button', { name: 'Agendar' }).click();
  m = await modal(page, 'Agendar');
  await cadastrarClienteNoSeletor(m, `Cliente Nova ${run}`);
  await m.getByRole('button', { name: 'Agendar' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByText(`Cliente Nova ${run}`)).toBeVisible();
});

test('pet shop: pet com tutor novo → banho agendado', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-pet', 'PET');
  await uiLogin(page, slug);
  await page.goto('/pet/pets');
  await page.getByRole('button', { name: 'Novo pet' }).click();
  const m = await modal(page, 'Novo pet');
  await cadastrarClienteNoSeletor(m, `Tutor Novo ${run}`, 'tutor');
  await m.locator('input[name=name]').fill(`Rex ${run}`);
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(`Rex ${run}`).first()).toBeVisible();

  await page.goto('/pet/banho-tosa');
  await page.locator('input[type=date]').first().fill(diaAmanha());
  await page.getByRole('button', { name: 'Agendar' }).click();
  const b = await modal(page, 'Agendar banho/tosa');
  await b.getByPlaceholder('Nome do pet ou do tutor').fill(`Rex ${run}`);
  await b.getByRole('row', { name: new RegExp(`Rex ${run}`) }).click();
  await b.locator('input[name=services]').fill('Banho completo');
  await b.locator('input[name=price]').fill('70');
  await b.getByRole('button', { name: 'Salvar' }).click();
  await expect(b).toBeHidden();
  await expect(page.getByText('Banho completo')).toBeVisible();
});

test('clínica: profissional → consulta com paciente novo', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-cli', 'CLINICA');
  await uiLogin(page, slug);
  // Sem profissional: a agenda diz onde cadastrar (antes, um erro técnico da API).
  await page.goto('/clinica/agenda');
  await page.getByRole('button', { name: 'Agendar' }).click();
  await (await modal(page, 'Agendar consulta')).getByRole('link', { name: 'Profissionais' }).click();
  await expect(page).toHaveURL(/\/clinica\/cadastros$/);
  await page.getByRole('button', { name: 'Novo profissional' }).click();
  let m = await modal(page, 'Novo profissional');
  await m.locator('input[name=name]').fill('Dra. Paula');
  await m.locator('input[name=specialty]').fill('Clínica geral');
  await m.locator('input[name=defaultPrice]').fill('250');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dra. Paula')).toBeVisible();

  await page.goto('/clinica/agenda');
  await page.getByLabel('Dia', { exact: true }).fill(diaAmanha());
  await page.getByRole('button', { name: 'Agendar' }).click();
  m = await modal(page, 'Agendar consulta');
  await cadastrarClienteNoSeletor(m, `Paciente Novo ${run}`, 'paciente');
  await m.getByRole('button', { name: 'Agendar' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByText(`Paciente Novo ${run}`)).toBeVisible();
});

test('pousada: quarto → reserva com hóspede novo', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-hot', 'HOTEL');
  await uiLogin(page, slug);
  await page.goto('/hotel/quartos');
  await page.getByRole('button', { name: 'Novo quarto' }).click();
  let m = await modal(page, 'Novo quarto');
  await m.locator('input[name=number]').fill('101');
  await m.locator('input[name=type]').fill('Casal');
  await m.locator('input[name=capacity]').fill('2');
  await m.locator('input[name=dailyRate]').fill('280');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Casal')).toBeVisible();

  await page.goto('/hotel/reservas');
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  m = await modal(page, 'Nova reserva');
  await cadastrarClienteNoSeletor(m, `Hóspede Novo ${run}`, 'hóspede');
  await m.getByRole('row', { name: /101/ }).getByRole('button', { name: 'Reservar' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByText(`Hóspede Novo ${run}`)).toBeVisible();
});

test('oficina: serviço do catálogo pronto → OS com cliente novo', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'dia-svc', 'SERVICOS');
  await uiLogin(page, slug);
  await page.goto('/servicos/nova');
  await cadastrarClienteNoSeletor(page, `Motorista ${run}`);
  await page.locator('input[name=plate]').fill(`DIA${String(Date.now()).slice(-4)}`);
  // O catálogo nasce com serviços comuns: já dá para escolher um.
  const opcoes = await page.locator('select[name=servicoId] option').count();
  expect(opcoes).toBeGreaterThan(1);
  await page.locator('select[name=servicoId]').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Abrir OS' }).click();
  await expect(page).toHaveURL(/\/servicos\/os\//);
  await expect(page.getByText(`Motorista ${run}`)).toBeVisible();
});
