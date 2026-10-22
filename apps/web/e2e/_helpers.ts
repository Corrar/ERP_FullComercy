import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const SENHA = process.env.SEED_ADMIN_PASSWORD ?? 'Demo-12345678';
export const API = 'http://127.0.0.1:3300';
export const run = Date.now().toString(36).toUpperCase();

export async function apiLogin(request: APIRequestContext, tenant: string) {
  const r = await request.post(`${API}/auth/login`, { data: { tenant, email: `admin@${tenant}.local`, password: SENHA } });
  expect(r.ok()).toBeTruthy();
  const b = await r.json();
  return { token: b.accessToken as string, h: { authorization: `Bearer ${b.accessToken}` } };
}

export async function uiLogin(page: Page, tenant: string) {
  // Funcionário/empresa do seed: a porta é "Acesso da equipe" (empresa + e-mail + senha).
  await page.goto('/login?modo=funcionario');
  await page.getByPlaceholder('Identificador da empresa (ex.: minha-loja)').fill(tenant);
  await page.locator('input[name=email]').fill(`admin@${tenant}.local`);
  await page.locator('input[name=password]').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
}

/** Empresa NOVA pela plataforma (vazia, como o cliente recebe) + o Bearer do admin para preparar dados. */
export async function empresaNova(request: APIRequestContext, prefixo: string, modulo: string) {
  const slug = `${prefixo}-${run.toLowerCase()}`;
  const r = await request.post(`${API}/platform/tenants`, { headers: { 'x-platform-key': process.env.PLATFORM_API_KEY! }, data: { slug, name: `${prefixo} ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: SENHA, modules: [modulo] } });
  expect(r.status()).toBe(201);
  const l = await (await request.post(`${API}/auth/login`, { data: { tenant: slug, email: `admin@${slug}.local`, password: SENHA } })).json();
  return { slug, h: { authorization: `Bearer ${l.accessToken}` } };
}

/** Busca o cliente no seletor (EscolherCliente) e cadastra na hora se não existir. */
export async function cadastrarClienteNoSeletor(scope: Page | Locator, nome: string, rotulo = 'cliente') {
  await scope.getByLabel(`Buscar ${rotulo}`).fill(nome);
  await scope.getByRole('button', { name: `+ Cadastrar "${nome}"` }).click();
  await expect(scope.getByText(nome, { exact: true })).toBeVisible();
}
