// e2e/conta-comprador.spec.ts — a área Minha conta de quem comprou: assinatura e faturas da empresa,
// reenviar os dados de acesso e o "esqueci a senha" da conta.
import { test, expect } from '@playwright/test';
import { API, run } from './_helpers';

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 15_485_863) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

test('minha conta: assinatura e faturas, reenviar acesso e esqueci a senha da conta', async ({ page, request }) => {
  const email = `minha-${run.toLowerCase()}@exemplo.com`;
  const { token } = await (await request.post(`${API}/account/register`, { data: { name: 'Dona Minha Conta', email, password: 'Senha-forte-123' } })).json();
  const r = await request.post(`${API}/account/checkout`, { headers: { authorization: `Bearer ${token}` }, data: { company: { name: `Loja Conta ${run}`, document: cpf(3) }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } } });
  expect(r.status()).toBe(201);

  await page.goto('/login?next=/minha-conta');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Senha-forte-123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minhas empresas' })).toBeVisible();

  const card = page.locator('.mod-card', { hasText: `Loja Conta ${run}` });
  await card.getByRole('button', { name: 'Assinatura e faturas' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Teste grátis até');
  await expect(dlg).toContainText('PDV e caixa');
  await expect(dlg).toContainText('final 4242');
  await expect(dlg).toContainText('Nenhuma fatura ainda');
  await page.keyboard.press('Escape');

  await card.getByRole('button', { name: 'Reenviar dados de acesso' }).click();
  await expect(page.locator('.toast')).toContainText(`enviados para ${email}`);

  // Esqueci a senha: link no login da conta, resposta neutra; link inválido é recusado.
  await page.getByRole('button', { name: /Sair da conta/ }).click();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Esqueceu a senha?' }).click();
  await expect(page).toHaveURL(/\/conta\/esqueci-senha$/);
  await page.locator('input[name=email]').fill(email);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se houver conta com este e-mail')).toBeVisible();
  await page.goto('/conta/redefinir-senha?token=token-invalido-de-teste-123');
  await page.locator('input[name=p1]').fill('Senha-nova-456');
  await page.locator('input[name=p2]').fill('Senha-nova-456');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Link inválido ou expirado');
});
