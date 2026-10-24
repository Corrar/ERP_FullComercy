// e2e/loja.spec.ts — a JORNADA DE COMPRA no navegador: escolher o comércio, ligar funções e ver o
// total do servidor, prévia com o menu real, carrinho, login obrigatório, checkout com cartão
// (tokenizado no navegador) e 7 dias grátis, ERP aberto com o plano cortando o que não foi pago.
import { test, expect } from '@playwright/test';
import { run } from './_helpers';

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 104_729) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

test('loja: comércio → funções → prévia → carrinho → login → cartão → ERP com teste grátis', async ({ page }) => {
  // Sem conta, a raiz abre a apresentação; o CTA leva à loja.
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
  await page.locator('.lp-hero').getByRole('button', { name: 'Montar meu sistema' }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  await expect(page.getByRole('heading', { name: 'Qual é o seu comércio?' })).toBeVisible();
  await page.locator('[data-module=VAREJO]').click();
  await expect(page.getByRole('heading', { name: 'Monte o seu ERP de Varejo' })).toBeVisible();
  // Mínimo do Varejo, calculado pela API.
  await expect(page.getByTestId('total').first()).toContainText('114,50');
  // Obrigatório não desliga; dependência explica quem exige.
  await expect(page.locator('[data-feature="varejo.pdv"] [role=switch]')).toBeDisabled();
  await expect(page.locator('[data-feature="core.clientes"]')).toContainText('Exigido por PDV e caixa');
  await page.locator('[data-feature="varejo.etiquetas"]').click();
  // O total conta de 114,50 até 124,40 (passa por valores intermediários, em verde) e para no do servidor.
  const total = page.getByTestId('total').first();
  await expect(total.locator('.valor-contando.sobe')).toBeVisible();
  await expect(total).toContainText('124,40');
  await expect(total.locator('.valor-contando')).not.toHaveClass(/sobe/);

  await page.getByRole('button', { name: 'Visualizar meu ERP' }).first().click();
  const prev = page.locator('.preview-frame aside');
  await expect(prev.getByRole('button', { name: 'Etiquetas' })).toBeVisible();
  await expect(prev.getByRole('button', { name: 'Comissões' })).toHaveCount(0);
  await expect(prev.getByRole('button', { name: 'Financeiro' })).toHaveCount(0);
  await prev.getByRole('button', { name: 'Etiquetas' }).click();
  await expect(page.locator('.preview-frame main')).toContainText('Parte de Etiquetas');

  await page.goto('/carrinho');
  await expect(page.getByText('dias grátis para testar tudo')).toBeVisible();
  // Voltar do carrinho leva às funções do MESMO comércio, sem perder o que foi ligado.
  await page.getByRole('button', { name: 'Voltar às funções' }).click();
  await expect(page.getByRole('heading', { name: 'Monte o seu ERP de Varejo' })).toBeVisible();
  await expect(page.getByTestId('total').first()).toContainText('124,40');
  await page.goto('/carrinho');
  await page.getByRole('button', { name: 'Entrar para finalizar' }).first().click();
  await expect(page).toHaveURL(/\/login\?next=\/checkout/);
  await page.getByRole('button', { name: 'Criar conta' }).last().click();
  await page.getByPlaceholder('Seu nome').fill(`Dona UI ${run}`);
  await page.getByPlaceholder('E-mail').fill(`dona-ui-${run.toLowerCase()}@exemplo.com`);
  await page.getByPlaceholder('Crie uma senha (mín. 8)').fill('Senha-forte-123');
  await page.locator('form button.btn-pill.main').click();
  await expect(page).toHaveURL(/\/checkout$/);
  // Voltar do pagamento vai ao carrinho (destino fixo: o histórico apontaria para o login).
  await page.getByRole('button', { name: 'Voltar ao carrinho' }).click();
  await expect(page.getByRole('heading', { name: 'Seu carrinho' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar para pagamento' }).first().click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.locator('input[name=company]').fill(`Loja UI ${run}`);
  await page.locator('input[name=document]').fill(cpf(5));
  // Cartão com Luhn inválido é barrado no navegador, antes de qualquer chamada.
  await page.locator('input[autocomplete=cc-number]').fill('4242424242424241');
  await page.locator('input[autocomplete=cc-name]').fill('Dona UI');
  await page.locator('input[autocomplete=cc-exp]').fill('1230');
  await page.locator('input[autocomplete=cc-csc]').fill('123');
  await page.getByRole('button', { name: 'Começar teste grátis' }).click();
  await expect(page.getByText('Número do cartão inválido.')).toBeVisible();
  await page.locator('input[autocomplete=cc-number]').fill('4242424242424242');
  await page.getByRole('button', { name: 'Começar teste grátis' }).click();
  await expect(page.getByRole('heading', { name: 'Seu ERP está pronto!' })).toBeVisible();
  // Dados de acesso na tela e no e-mail (o e-mail é conferido no e2e da API).
  await expect(page.getByTestId('dados-acesso')).toContainText('Seus dados de acesso');
  await expect(page.getByTestId('dados-acesso')).toContainText('@');
  await page.getByRole('button', { name: 'Abrir meu ERP' }).click();

  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
  await expect(page.getByText(/Teste grátis: faltam 7 dias/)).toBeVisible();
  const side = page.locator('aside');
  await expect(side.getByRole('link', { name: 'Etiquetas' })).toBeVisible();
  await expect(side.getByRole('link', { name: 'Comissões' })).toHaveCount(0);
  await side.getByRole('link', { name: 'Assinatura' }).click();
  await expect(page.getByText('Visa final 4242')).toBeVisible();
  await expect(page.getByText('R$ 124,40').first()).toBeVisible();
});
