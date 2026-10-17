// src/lib/api.ts — o cliente HTTP. Uma função, três regras: manda o access token, renova com o
// refresh token UMA vez num 401, e traduz o erro da API ({ error, code, details }) numa ApiError.
import { session } from './session';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = session.get()?.refreshToken;
      if (!rt) return false;
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (!res.ok) { session.clear(); return false; }
      const b = await res.json();
      session.patch({ accessToken: b.accessToken, refreshToken: b.refreshToken });
      return true;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export interface Req { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined>; headers?: Record<string, string>; raw?: boolean }

export async function api<T = any>(path: string, opts: Req = {}, retry = true): Promise<T> {
  const q = opts.query ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const token = session.get()?.accessToken;
  const res = await fetch(`${BASE}${path}${q}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401 && retry && token && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, opts, false);
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) session.clear();
    throw new ApiError(res.status, body?.code ?? 'HTTP', body?.error ?? `Erro ${res.status}`, body?.details);
  }
  return body as T;
}
const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return { error: t }; } };

export const get = <T = any>(path: string, query?: Req['query']) => api<T>(path, { query });
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
export const apiBase = BASE;
