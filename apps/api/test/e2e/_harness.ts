// test/e2e/_harness.ts — sobe o app em porta aleatória e dá um cliente HTTP tipado.
// Exige banco (DATABASE_URL + seed aplicado) e E2E=1; sem isso os testes se marcam como pulados.
import 'dotenv/config';
import type { Server } from 'node:http';
import assert from 'node:assert/strict';

export const E2E = process.env.E2E === '1' && !!process.env.DATABASE_URL;
export const SENHA = process.env.SEED_ADMIN_PASSWORD ?? 'Demo-12345678';

let server: Server | null = null;
let base = '';
export const baseUrl = () => base;
export { baseUrl as base };

export async function start() {
  const { buildApp } = await import('../../src/app');
  const app = buildApp();
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  const addr = server!.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  return base;
}
export async function stop() {
  const { prisma } = await import('../../src/infra/prisma');
  await new Promise<void>((r) => server?.close(() => r()));
  await prisma.$disconnect();
}

export interface Api {
  get: (p: string) => Promise<any>;
  post: (p: string, b?: unknown, headers?: Record<string, string>) => Promise<any>;
  put: (p: string, b?: unknown) => Promise<any>;
  patch: (p: string, b?: unknown) => Promise<any>;
  del: (p: string, b?: unknown) => Promise<any>;
  raw: (method: string, p: string, b?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; text: string }>;
}

export function api(token?: string): Api {
  const raw = async (method: string, p: string, b?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: b === undefined ? undefined : JSON.stringify(b) });
    const text = await res.text();
    let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, text };
  };
  const ok = async (method: string, p: string, b?: unknown, headers?: Record<string, string>) => {
    const r = await raw(method, p, b, headers);
    assert.ok(r.status < 400, `${method} ${p} → ${r.status} ${typeof r.body === 'string' ? r.body : JSON.stringify(r.body)}`);
    return r.body;
  };
  return { raw, get: (p) => ok('GET', p), post: (p, b, h) => ok('POST', p, b, h), put: (p, b) => ok('PUT', p, b), patch: (p, b) => ok('PATCH', p, b), del: (p, b) => ok('DELETE', p, b) };
}

export async function login(tenant: string, email = `admin@${tenant}.local`) {
  const r = await api().post('/auth/login', { tenant, email, password: SENHA });
  return { token: r.accessToken as string, api: api(r.accessToken), me: r };
}

/** Sufixo único por rodada: o seed é idempotente, mas os dados do teste não devem colidir entre rodadas. */
export const run = Date.now().toString(36).toUpperCase();
