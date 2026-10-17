import { expect, type APIRequestContext, type Page } from '@playwright/test';

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
  await page.goto('/login');
  await page.getByPlaceholder('minha-loja').fill(tenant);
  await page.locator('input[name=email]').fill(`admin@${tenant}.local`);
  await page.locator('input[name=password]').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
}
