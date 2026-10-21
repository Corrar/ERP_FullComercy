// demos/food.demo.ts — roteiros das funções do Food & Delivery (um vídeo por chave do catálogo).
import { empresa, expect, test } from './_gravador';
import { folego, semearFood } from './seed-food';

let respirou = false; // o gravador guarda a empresa da rodada: só a primeira criação espera a cota
const casa = async (request: Parameters<typeof empresa>[0]) => {
  test.setTimeout(20 * 60_000); // esperar a cota (login e minuto) cabe no teste
  if (!respirou) { await folego(request); respirou = true; }
  const e = await empresa(request, 'FOOD', async (x) => { await semearFood(x); });
  await folego(request, 150, false); // a tela e os gestos não podem tomar 429 (cota global dividida)
  return e;
};

test('food.salao', async ({ request, gravar }) => {
  const e = await casa(request);
  const g = await gravar('food.salao', e, '/food/salao');
  const p = g.page;
  const mesa4 = p.locator('.mesa').filter({ has: p.getByText('Mesa 4', { exact: true }) });
  await expect(mesa4).toContainText('R$');
  await expect(p.locator('.mesa.OCCUPIED')).toHaveCount(4);
  await g.inicio();
  await g.pausa(800);
  await g.clicar(mesa4);
  const modal = p.getByRole('dialog', { name: 'Mesa 4' });
  await expect(modal.getByRole('button', { name: /Brownie com Sorvete/ })).toBeVisible();
  const conta = modal.locator('section.card').filter({ has: p.getByRole('heading', { name: 'Conta', exact: true }) });
  await expect(conta).toContainText('170,30');
  await g.pausa(500);
  const brownie = modal.getByRole('button', { name: /Brownie com Sorvete/ });
  await g.clicar(brownie);
  await g.clicar(brownie);
  await g.clicar(modal.getByRole('button', { name: /Chopp Pilsen/ }));
  await expect(modal.getByText('2× Brownie com Sorvete')).toBeVisible();
  await g.pausa(400);
  await g.clicar(modal.getByRole('button', { name: 'Enviar para a cozinha' }));
  await expect(conta).toContainText('223,00'); // 170,30 + 2 × 19,90 + 12,90
  await g.pausa(500);
  g.capa();
  await g.pausa(500);
  await g.clicar(modal.getByRole('button', { name: 'Fechar conta' }));
  await expect(modal).toBeHidden();
  await expect(mesa4).toContainText('livre');
  await g.pausa(1200);
});

test('food.cozinha', async ({ request, gravar }) => {
  const e = await casa(request);
  const g = await gravar('food.cozinha', e, '/food/cozinha');
  const p = g.page;
  await expect(p.locator('.kds .ticket').first()).toBeVisible();
  const chapa = p.getByRole('button', { name: /^CHAPA/ });
  await expect(chapa).toBeVisible();
  await g.inicio();
  await g.pausa(900);
  await g.clicar(chapa);
  await expect(p.locator('.kds .ticket')).toHaveCount(3);
  await expect(p.locator('.kds .ticket').first()).toContainText('CHAPA');
  await g.pausa(700);
  g.capa();
  const preparando = p.locator('.kds .ticket.PREPARING').first();
  const numero = (await preparando.locator('strong').first().innerText()).split(' ')[0];
  await g.clicar(preparando.getByRole('button', { name: 'Pronto' }));
  await expect(p.locator('.kds .ticket', { hasText: numero })).toHaveCount(0);
  await g.pausa(600);
  const naFila = p.locator('.kds .ticket.QUEUED').first();
  await g.clicar(naFila.getByRole('button', { name: 'Iniciar' }));
  await expect(p.locator('.kds .ticket.QUEUED')).toHaveCount(0);
  await g.pausa(1200);
});

test('food.delivery', async ({ request, gravar }) => {
  const e = await casa(request);
  const g = await gravar('food.delivery', e, '/food/entregas');
  const p = g.page;
  const linhas = p.locator('table tbody tr');
  await expect(linhas).toHaveCount(4);
  await g.inicio();
  await g.pausa(900);
  // A que está na rua chegou.
  const naRua = linhas.filter({ has: p.getByRole('button', { name: 'Entregue' }) });
  await g.clicar(naRua.getByRole('button', { name: 'Entregue' }));
  await expect(linhas).toHaveCount(3);
  await g.pausa(500);
  // Despacho: o pedido pronto que esperava ganha entregador.
  const pendente = linhas.filter({ has: p.locator('select') }).first();
  const select = pendente.locator('select');
  await g.passar(select);
  await select.selectOption({ label: 'Diego Martins' });
  // (as linhas ainda pendentes têm o <select> com os nomes; só conta quem já tem entregador)
  const despachadas = linhas.filter({ hasNot: p.locator('select') });
  await expect(despachadas.filter({ hasText: 'Diego Martins' })).toHaveCount(1);
  await expect(linhas.filter({ has: p.locator('select') })).toHaveCount(1);
  await g.pausa(600);
  g.capa();
  // A atribuída saiu com o entregador.
  const aline = despachadas.filter({ hasText: 'Aline Souza' });
  await g.clicar(aline.getByRole('button', { name: 'Saiu' }));
  await expect(aline.getByRole('button', { name: 'Entregue' })).toBeVisible();
  await g.pausa(1200);
});

test('food.relatorios', async ({ request, gravar }) => {
  const e = await casa(request);
  const g = await gravar('food.relatorios', e, '/food/relatorios');
  const p = g.page;
  const card = p.locator('.card').last();
  await expect(card.locator('tbody tr').first()).toBeVisible();
  await expect(card).toContainText('Cheddar Bacon');
  await g.inicio();
  await g.pausa(1000);
  g.capa();
  await g.pausa(500);
  await g.clicar(p.getByRole('tab', { name: 'Por tipo' }));
  await expect(card).toContainText('Delivery');
  await expect(card).toContainText('Salão');
  await g.pausa(1100);
  await g.clicar(p.getByRole('tab', { name: 'Por hora' }));
  await expect(card.locator('tbody tr').first()).toContainText('h');
  await g.pausa(900);
  await g.clicar(p.getByRole('tab', { name: 'Entregadores' }));
  await expect(card).toContainText('Diego Martins');
  await g.pausa(1300);
});
