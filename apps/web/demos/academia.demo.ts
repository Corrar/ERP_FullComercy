// demos/academia.demo.ts — roteiros das funções da Academia (um vídeo por chave do catálogo).
import { empresa, expect, test } from './_gravador';
import { semearAcademia } from './seed-academia';

const academia = (request: Parameters<typeof empresa>[0]) => empresa(request, 'ACADEMIA', async (e) => { await semearAcademia(e); });

test('gym.matriculas', async ({ request, gravar }) => {
  const e = await academia(request);
  const g = await gravar('gym.matriculas', e, '/academia/matriculas');
  const p = g.page;
  await expect(p.getByRole('cell', { name: /Ana Beatriz Souza/ })).toBeVisible();
  await g.inicio();
  await g.pausa(900);
  await g.clicar(p.getByRole('button', { name: 'Nova adesão' }));
  const modal = p.getByRole('dialog', { name: 'Nova adesão' });
  await expect(modal).toBeVisible();
  const aluno = modal.locator('select[name="customerId"]');
  await g.passar(aluno); await aluno.selectOption({ label: 'Vanessa Castro' });
  await g.pausa(300);
  const plano = modal.locator('select[name="planId"]');
  await g.passar(plano); await plano.selectOption({ label: 'Anual Fidelidade · 1188' });
  await g.pausa(300);
  await g.digitar(modal.locator('input[name="amount"]'), '1188');
  await g.clicar(modal.getByRole('button', { name: 'Registrar adesão' }));
  await expect(modal).toBeHidden();
  await expect(p.getByRole('cell', { name: /Vanessa Castro/ })).toBeVisible();
  await g.pausa(1200);
  g.capa();
  await g.clicar(p.getByRole('tab', { name: 'Pausadas' }));
  await expect(p.getByRole('cell', { name: /Larissa Teixeira/ })).toBeVisible();
  await g.pausa(900);
  await g.clicar(p.getByRole('tab', { name: 'Inadimplentes' }));
  await expect(p.getByRole('cell', { name: /Diego Ramos/ })).toBeVisible();
  await g.pausa(1300);
});

test('gym.recepcao', async ({ request, gravar }) => {
  const e = await academia(request);
  const g = await gravar('gym.recepcao', e, '/academia/recepcao');
  const p = g.page;
  const busca = p.getByPlaceholder('nome ou telefone do aluno');
  await expect(p.getByText(/Presentes agora \([1-9]/)).toBeVisible();
  await g.inicio();
  await g.pausa(700);
  await g.digitar(busca, 'Ana Be');
  const ana = p.getByRole('row', { name: /Ana Beatriz Souza/ });
  await expect(ana).toBeVisible();
  await g.clicar(ana.getByRole('button', { name: 'Check-in' }));
  await expect(p.locator('.toast')).toHaveText('Ana Beatriz Souza: acesso liberado');
  await expect(p.getByRole('cell', { name: 'Ana Beatriz Souza' })).toBeVisible();
  await g.pausa(1000);
  g.capa();
  await g.digitar(busca, 'Diego');
  const diego = p.getByRole('row', { name: /Diego Ramos/ });
  await expect(diego).toBeVisible();
  await g.clicar(diego.getByRole('button', { name: 'Check-in' }));
  await expect(p.getByRole('alert')).toContainText('INADIMPLENTE');
  await g.pausa(1800);
});

test('gym.catraca', async ({ request, gravar }) => {
  const e = await academia(request);
  const g = await gravar('gym.catraca', e, '/academia/acesso');
  const p = g.page;
  await expect(p.getByRole('cell', { name: 'Leitor biométrico' }).first()).toBeVisible();
  await expect(p.getByText('CREDENCIAL_DESCONHECIDA')).toBeVisible();
  await g.inicio();
  await g.pausa(900);
  g.capa();
  await g.passar(p.locator('.badge.ok').first());
  await g.pausa(500);
  await g.passar(p.getByText('INADIMPLENTE').first());
  await g.pausa(700);
  await g.clicar(p.getByRole('button', { name: 'Novo dispositivo' }));
  const modal = p.getByRole('dialog', { name: 'Novo dispositivo' });
  await g.digitar(modal.locator('input[name="name"]'), 'Catraca da saída');
  await g.clicar(modal.getByRole('button', { name: 'Salvar' }));
  await expect(modal).toBeHidden();
  await expect(p.getByText('Configure no aparelho')).toBeVisible();
  await expect(p.getByRole('cell', { name: 'Catraca da saída' })).toBeVisible();
  await g.pausa(1600);
});

test('gym.turmas', async ({ request, gravar }) => {
  const e = await academia(request);
  const g = await gravar('gym.turmas', e, '/academia/turmas');
  const p = g.page;
  await expect(p.getByRole('cell', { name: 'Spinning' }).first()).toBeVisible();
  await g.inicio();
  await g.pausa(900);
  g.capa();
  await g.passar(p.getByRole('cell', { name: /^\d+\/\d+$/ }).first());
  await g.pausa(600);
  await g.clicar(p.getByRole('button', { name: 'Nova turma' }));
  const modal = p.getByRole('dialog', { name: 'Nova turma' });
  await g.digitar(modal.locator('input[name="name"]'), 'Muay Thai');
  const dia = modal.locator('select[name="weekday"]');
  await g.passar(dia); await dia.selectOption({ label: 'Qui' });
  await g.pausa(300);
  await g.clicar(modal.getByRole('button', { name: 'Salvar' }));
  await expect(modal).toBeHidden();
  await expect(p.getByText('Muay Thai').first()).toBeVisible();
  await expect(p.getByRole('cell', { name: 'Muay Thai' }).first()).toBeVisible();
  await g.pausa(1500);
});
