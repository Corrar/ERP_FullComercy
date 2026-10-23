// e2e/assinatura-proporcional.spec.ts — "Alterar funções" mostra, antes de salvar, quanto será
// cobrado AGORA. No teste grátis: nada (resposta real da API). No meio de um mês pago: o
// proporcional — o cálculo é provado no e2e da API (loja.test.ts); aqui a prévia é fixada pela
// rede só para conferir como a tela a mostra, porque o navegador não tem como pôr a assinatura no
// meio de um mês pago.
import { test, expect } from '@playwright/test';
import { API, run } from './_helpers';

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 104_729) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

test('alterar funções: prévia do que será cobrado agora', async ({ page, request }) => {
  const email = `prop-ui-${run.toLowerCase()}@exemplo.com`;
  const conta = await (await request.post(`${API}/account/register`, { data: { name: 'Dona Prévia', email, password: 'Senha-forte-123' } })).json();
  const compra = await request.post(`${API}/account/checkout`, {
    headers: { authorization: `Bearer ${conta.token}` },
    data: { company: { name: `Prévia ${run}`, document: cpf(11) }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } },
  });
  expect(compra.status()).toBe(201);
  const { session } = await compra.json();
  await page.addInitScript((s) => localStorage.setItem('fc.session', s), JSON.stringify(session));

  await page.goto('/assinatura');
  await page.getByRole('button', { name: 'Alterar funções' }).click();
  const modal = page.getByRole('dialog', { name: 'Alterar funções do plano' });
  await modal.locator('[data-feature="varejo.comissoes"] [role=switch]').click();
  await expect(modal.getByText('No teste grátis nada é cobrado agora.')).toBeVisible();
  await expect(modal.getByTestId('proporcional')).toHaveCount(0);

  // Mês pago no meio: a prévia vem com o proporcional e a tela mostra valor e dias.
  await page.route('**/billing/subscription/features/preview', (r) => r.fulfill({ json: {
    novoValor: '144.30', valorAtual: '134.40', proporcional: { valor: '6.60', dias: 20, diasPeriodo: 30, funcoes: ['Etiquetas'] },
  } }));
  await modal.locator('[data-feature="varejo.etiquetas"] [role=switch]').click();
  await expect(modal.getByTestId('proporcional')).toContainText(/Cobrado agora:\s*R\$\s*6,60/);
  await expect(modal.getByTestId('proporcional')).toContainText('proporcional a 20 de 30 dias');
  await expect(modal.getByText('No teste grátis nada é cobrado agora.')).toHaveCount(0);
});
