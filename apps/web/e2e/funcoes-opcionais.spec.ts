// e2e/funcoes-opcionais.spec.ts — o primeiro uso das funções OPCIONAIS, pela tela, numa empresa
// nova: turmas, catraca, pacotes, convênios, vacina, compras, contas a pagar e o convite da equipe.
// O que já foi provado no primeiro-dia (cadastros obrigatórios) entra pela API para encurtar.
import { test, expect, type Page } from '@playwright/test';
import { API, cadastrarClienteNoSeletor, empresaNova, run, uiLogin } from './_helpers';

async function modal(page: Page, titulo: string | RegExp) { const m = page.getByRole('dialog', { name: titulo }); await expect(m).toBeVisible(); return m; }
const amanha = () => { const d = new Date(Date.now() + 86_400_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

test('academia: turma em vários dias → reserva do aluno → chamada; catraca e credencial', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-gym', 'ACADEMIA');
  const plano = await (await request.post(`${API}/m/academia/planos`, { headers: h, data: { name: 'Mensal', price: 99.9 } })).json();
  const aluno = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Aluna Turma ${run}` } })).json();
  const ad = await (await request.post(`${API}/orders`, { headers: h, data: { channel: 'SUBSCRIPTION', customerId: aluno.id, items: [], moduleData: { planId: plano.id } } })).json();
  await request.post(`${API}/orders/${ad.id}/payments`, { headers: h, data: { payments: [{ method: 'PIX', amount: 99.9 }] } });

  await uiLogin(page, slug);
  await page.goto('/academia/turmas');
  await page.getByRole('button', { name: 'Nova turma' }).click();
  let m = await modal(page, 'Nova turma');
  await m.locator('input[name=name]').fill('Spinning');
  for (const d of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) await m.getByLabel(d, { exact: true }).check();
  await m.locator('input[name=time]').fill('07:00');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m).toBeHidden();
  const agenda = page.locator('.card', { hasText: 'Agenda (7 dias)' });
  await expect(agenda.getByRole('row', { name: /Spinning/ })).not.toHaveCount(0);
  expect(await agenda.getByRole('row', { name: /Spinning/ }).count()).toBeGreaterThanOrEqual(6); // todo dia, 7 dias

  await agenda.getByRole('row', { name: /Spinning/ }).first().getByRole('button', { name: 'Reservar' }).click();
  m = await modal(page, /^Reservar · Spinning/);
  await m.getByLabel('Buscar aluno').fill(`Aluna Turma ${run}`);
  await m.getByRole('button', { name: new RegExp(`^Aluna Turma ${run}`) }).click();
  await m.getByRole('button', { name: 'Reservar' }).click();
  await expect(m).toBeHidden();
  await expect(agenda.getByRole('row', { name: /Spinning/ }).first()).toContainText('1/20');
  await agenda.getByRole('row', { name: /Spinning/ }).first().getByRole('button', { name: 'Chamada' }).click();
  m = await modal(page, /^Chamada · Spinning/);
  await m.getByLabel(`Aluna Turma ${run}`).check();
  await m.getByRole('button', { name: 'Salvar chamada' }).click();
  await expect(m).toBeHidden();

  await page.goto('/academia/acesso');
  await page.getByRole('button', { name: 'Novo dispositivo' }).click();
  m = await modal(page, 'Novo dispositivo');
  await m.locator('input[name=name]').fill('Catraca da entrada');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Configure no aparelho (aparece UMA vez)')).toBeVisible();
  await page.getByLabel('Buscar aluno').fill(`Aluna Turma ${run}`);
  await page.getByRole('button', { name: new RegExp(`^Aluna Turma ${run}`) }).click();
  await page.getByRole('button', { name: 'Nova credencial' }).click();
  m = await modal(page, 'Nova credencial');
  await m.locator('input[name=value]').fill(`CARTAO-${run}`);
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.card', { hasText: 'Credenciais do aluno' }).getByRole('cell', { name: 'CARD' })).toBeVisible();
});

test('salão: pacote de sessões criado e vendido para a cliente', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-bel', 'BELEZA');
  await request.post(`${API}/m/beleza/servicos`, { headers: h, data: { name: 'Escova', durationMin: 45, price: 60 } });
  await uiLogin(page, slug);
  await page.goto('/beleza/pacotes');
  await page.getByRole('button', { name: 'Novo pacote' }).click();
  let m = await modal(page, 'Novo pacote');
  await m.locator('input[name=name]').fill('10 escovas');
  await m.locator('input[name=sessions]').fill('10');
  await m.locator('input[name=price]').fill('500');
  await m.locator('input[name=validityDays]').fill('180');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('10 escovas')).toBeVisible();
  await page.getByRole('row', { name: /10 escovas/ }).getByRole('button', { name: 'Vender' }).click();
  m = await modal(page, /^Vender · 10 escovas/);
  await cadastrarClienteNoSeletor(m, `Cliente Pacote ${run}`);
  await m.getByRole('button', { name: 'Abrir comanda do pacote' }).click();
  await expect(m).toBeHidden();
});

test('clínica: convênio cadastrado e consulta agendada por ele', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-cli', 'CLINICA');
  await request.post(`${API}/m/clinica/profissionais`, { headers: h, data: { name: 'Dr. João', specialty: 'Cardiologia', defaultDurationMin: 30, defaultPrice: 300 } });
  await uiLogin(page, slug);
  await page.goto('/clinica/convenios');
  await page.getByRole('button', { name: 'Novo convênio' }).click();
  let m = await modal(page, 'Novo convênio');
  await m.locator('input[name=name]').fill('Saúde Mais');
  await m.locator('input[name=price]').fill('180');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: /Saúde Mais/ }).first()).toBeVisible();

  await page.goto('/clinica/agenda');
  await page.getByLabel('Dia', { exact: true }).fill(amanha());
  await page.getByRole('button', { name: 'Agendar' }).click();
  m = await modal(page, 'Agendar consulta');
  await cadastrarClienteNoSeletor(m, `Paciente Conv ${run}`, 'paciente');
  await m.getByLabel('Quem paga').selectOption('CONVENIO');
  await m.getByLabel('Convênio (vazio = o da ficha)').selectOption({ label: 'Saúde Mais · R$ 180,00' });
  await m.getByRole('button', { name: 'Agendar' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByText(`Paciente Conv ${run}`)).toBeVisible();
});

test('pet: vacina registrada na ficha aparece nos lembretes da veterinária', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-pet', 'PET');
  const tutor = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Tutora ${run}` } })).json();
  const pet = await (await request.post(`${API}/m/pet/pets`, { headers: h, data: { customerId: tutor.id, name: `Mel ${run}`, species: 'CAO' } })).json();
  await uiLogin(page, slug);
  await page.goto(`/pet/pets/${pet.id}`);
  await page.getByRole('button', { name: 'Registrar vacina' }).click();
  const m = await modal(page, 'Registrar vacina');
  await m.locator('input[name=name]').fill('V10');
  await m.locator('input[name=nextDueAt]').fill(amanha());
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.card', { hasText: 'Vacinas' })).toContainText('V10');
  await page.goto('/pet/veterinaria');
  await expect(page.getByText(`Mel ${run}`)).toBeVisible();
});

test('compras e financeiro: fornecedor → compra recebida entra no estoque; conta a pagar baixada', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-com', 'VAREJO');
  const p = await (await request.post(`${API}/products`, { headers: h, data: { name: `Tecido ${run}`, sku: `TEC-${run}`, salePrice: 30, trackStock: true } })).json();
  await uiLogin(page, slug);
  await page.goto('/compras');
  // Sem fornecedor, a compra diz onde cadastrar.
  await page.getByRole('button', { name: 'Nova compra' }).click();
  await (await modal(page, 'Nova compra')).getByRole('button', { name: 'Fornecedores' }).click();
  await page.getByRole('button', { name: 'Novo fornecedor' }).click();
  let m = await modal(page, 'Novo fornecedor');
  await m.locator('input[name=name]').fill(`Tecelagem ${run}`);
  await m.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('tab', { name: 'Pedidos de compra' }).click();
  await page.getByRole('button', { name: 'Nova compra' }).click();
  m = await modal(page, 'Nova compra');
  await m.locator('select[name=supplierId]').selectOption({ label: `Tecelagem ${run}` });
  await m.locator('input[name=quantity]').fill('20');
  await m.locator('input[name=unitCost]').fill('12');
  await m.getByRole('button', { name: 'Criar rascunho' }).click();
  await expect(m).toBeHidden();
  // Criada, a tela abre a compra: envia ao fornecedor e recebe a mercadoria.
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Enviar ao fornecedor' }).click();
  await page.getByRole('button', { name: 'Receber' }).click();
  m = await modal(page, 'Receber mercadoria');
  await m.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByRole('button', { name: 'Receber' })).toHaveCount(0);
  const saldo = await (await request.get(`${API}/stock/balances?variantId=${p.variants[0].id}`, { headers: h })).json();
  expect(Number(saldo[0].onHand)).toBe(20);

  await page.goto('/financeiro');
  await page.getByRole('tab', { name: /A pagar/ }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Tecelagem ${run}|Compra`) }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Novo título' }).click();
  m = await modal(page, 'Nova conta a pagar');
  await m.locator('input[name=description]').fill(`Aluguel ${run}`);
  await m.locator('input[name=amount]').fill('1500');
  await m.locator('input[name=dueDate]').fill(amanha());
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m).toBeHidden();
  await page.getByRole('row', { name: new RegExp(`Aluguel ${run}`) }).getByRole('button', { name: 'Baixar' }).click();
  m = await modal(page, `Baixar: Aluguel ${run}`);
  await m.getByRole('button', { name: 'Baixar' }).click();
  await expect(m).toBeHidden();
  // Paga, sai da lista "Só em aberto"; desmarcando, aparece como paga.
  await expect(page.getByRole('row', { name: new RegExp(`Aluguel ${run}`) })).toHaveCount(0);
  await page.getByLabel('Só em aberto').uncheck();
  await expect(page.getByRole('row', { name: new RegExp(`Aluguel ${run}`) })).toContainText(/Pag/);
});

test('equipe: convidar com o perfil pronto do ramo', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'opc-eqp', 'VAREJO');
  await uiLogin(page, slug);
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Convidar por e-mail' }).click();
  const m = await modal(page, 'Convidar usuário');
  await m.locator('input[name=name]').fill(`Caixa Joana ${run}`);
  await m.locator('input[name=email]').fill(`joana-${run.toLowerCase()}@exemplo.com`);
  await m.locator('select[name=roleId]').selectOption({ label: 'Caixa' });
  await m.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(m).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(`Caixa Joana ${run}`) })).toBeVisible();
});

test('varejo: lote de etiquetas gerado e baixado em PDF', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-eti', 'VAREJO');
  await request.post(`${API}/products`, { headers: h, data: { name: `Vestido ${run}`, sku: `VES-${run}`, salePrice: 120, trackStock: false } });
  await uiLogin(page, slug);
  await page.goto('/varejo/etiquetas');
  const opcao = await page.locator('select[name=variantId] option', { hasText: `Vestido ${run}` }).getAttribute('value');
  await page.locator('select[name=variantId]').selectOption(opcao!);
  await page.locator('input[name=quantity]').fill('3');
  await page.getByRole('button', { name: 'Gerar lote' }).click();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF (A4)' }).click()]);
  expect(pdf.suggestedFilename()).toBe('etiquetas.pdf');
  const { readFile } = await import('node:fs/promises');
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
});

test('clínica: evolução no prontuário do paciente', async ({ page, request }) => {
  const { slug, h } = await empresaNova(request, 'opc-pro', 'CLINICA');
  await request.post(`${API}/m/clinica/profissionais`, { headers: h, data: { name: 'Dra. Ana', specialty: 'Pediatria', defaultDurationMin: 30, defaultPrice: 200 } });
  const pac = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Paciente Pront ${run}` } })).json();
  await uiLogin(page, slug);
  await page.goto(`/clinica/pacientes/${pac.id}`);
  await page.getByRole('button', { name: 'Nova evolução' }).click();
  const m = await modal(page, 'Nova evolução');
  await m.locator('textarea[name=anamnesis]').fill('Febre há 2 dias');
  await m.locator('textarea[name=evolution]').fill('Melhora após antitérmico');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m).toBeHidden();
  await expect(page.locator('.card', { hasText: 'Prontuário' })).toContainText('Melhora após antitérmico');
});

test('integrações: webhook cadastrado mostra o segredo uma vez', async ({ page, request }) => {
  const { slug } = await empresaNova(request, 'opc-int', 'VAREJO');
  await uiLogin(page, slug);
  await page.goto('/integracoes');
  await page.getByRole('button', { name: 'Novo webhook' }).click();
  const m = await modal(page, 'Novo webhook');
  await m.locator('input[name=url]').fill('https://meu-sistema.exemplo.com/hook');
  await m.getByRole('checkbox').first().check();
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Segredo do HMAC (aparece UMA vez)')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'https://meu-sistema.exemplo.com/hook' }).first()).toBeVisible();
});
