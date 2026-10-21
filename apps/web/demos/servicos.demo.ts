// demos/servicos.demo.ts — roteiros das funções de Serviços / Oficina (um vídeo por chave do catálogo).
import { empresa, expect, test } from './_gravador';
import { semearServicos } from './seed-servicos';

const oficina = (request: Parameters<typeof empresa>[0]) => empresa(request, 'SERVICOS', async (e) => { await semearServicos(e); });

test('svc.os', async ({ request, gravar }) => {
  const e = await oficina(request);
  const g = await gravar('svc.os', e, '/servicos');
  const cartao = g.page.locator('.kanban .card', { hasText: 'FKQ8B31' });
  await expect(cartao).toBeVisible();
  await expect(g.page.locator('.kanban .card')).toHaveCount(9);
  await g.inicio();
  await g.pausa(900);
  g.capa();
  await g.passar(g.page.locator('.kanban .card', { hasText: 'QWE4F19' }));
  await g.pausa(300);
  await g.clicar(cartao);
  const titulo = g.page.locator('h1');
  await expect(titulo).toContainText('FKQ8B31');
  await expect(titulo).toContainText('Aguardando aprovação');
  await expect(g.page.getByText('Pastilha de Freio Dianteira (jogo)')).toBeVisible();
  await g.pausa(1300);
  await g.clicar(g.page.getByRole('button', { name: 'Cliente aprovou' }));
  await expect(titulo).toContainText('Aprovado');
  await expect(g.page.getByRole('button', { name: 'Em serviço' })).toBeVisible();
  await g.pausa(900);
  await g.clicar(g.page.getByRole('button', { name: 'Em serviço' }));
  await expect(titulo).toContainText('Em serviço');
  await g.pausa(1300);
});

test('svc.veiculos', async ({ request, gravar }) => {
  const e = await oficina(request);
  const g = await gravar('svc.veiculos', e, '/servicos/veiculos');
  const linhas = g.page.locator('table tbody tr');
  await expect(linhas).toHaveCount(12);
  await g.inicio();
  await g.pausa(1200);
  g.capa();
  await g.passar(linhas.filter({ hasText: 'FKQ8B31' }));
  await g.pausa(900);
  await g.digitar(g.page.getByPlaceholder('placa, modelo ou dono'), 'GHT7C52');
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText('Aline Barbosa');
  await g.pausa(500);
  await g.passar(linhas.first().getByText('Chevrolet Onix 2022'));
  await g.pausa(1800);
});

test('svc.agenda', async ({ request, gravar }) => {
  const e = await oficina(request);
  const g = await gravar('svc.agenda', e, '/servicos/agenda');
  const linhas = g.page.locator('table tbody tr');
  await expect(linhas).toHaveCount(6);
  await g.inicio();
  await g.pausa(1200);
  g.capa();
  await g.passar(linhas.filter({ hasText: 'LTR8D52' }).getByText('Troca de pastilhas'));
  await g.pausa(700);
  const primeira = linhas.filter({ hasText: 'PXN4C19' });
  await g.passar(primeira.getByText('Revisão dos 30 mil km'));
  await g.pausa(700);
  await g.clicar(primeira.getByRole('button', { name: /Chegou/ }));
  await expect(g.page).toHaveURL(/\/servicos\/os\//);
  await expect(g.page.locator('h1')).toContainText('PXN4C19');
  await expect(g.page.getByText('Revisão dos 30 mil km').first()).toBeVisible();
  await g.pausa(800);
  await g.passar(g.page.locator('.card', { hasText: 'Veículo e cliente' }).getByText('PXN4C19'));
  await g.pausa(1800);
});

test('svc.relatorios', async ({ request, gravar }) => {
  const e = await oficina(request);
  const g = await gravar('svc.relatorios', e, '/servicos/relatorios');
  await expect(g.page.getByRole('cell', { name: 'Rogério Alves' })).toBeVisible();
  await g.inicio();
  await g.pausa(1200);
  await g.passar(g.page.getByRole('cell', { name: /1\.639,60/ }));
  await g.pausa(1200);
  await g.clicar(g.page.getByRole('tab', { name: 'Serviços mais vendidos' }));
  await expect(g.page.getByRole('cell', { name: 'Troca de óleo e filtro' })).toBeVisible();
  await g.pausa(700);
  g.capa();
  await g.passar(g.page.getByRole('cell', { name: /320,00/ }));
  await g.pausa(2000);
});
