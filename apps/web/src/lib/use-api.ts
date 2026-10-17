// src/lib/use-api.ts — hooks mínimos de dados (sem react-query, de propósito: o shape é simples).
import { useCallback, useEffect, useState } from 'react';
import { api, type Req, ApiError } from './api';

export function useGet<T = any>(path: string | null, query?: Req['query'], deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path, { query })); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(query), ...deps]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

/** Executa uma mutação e expõe estado + erro legível (incluindo `details` de validação). */
export function useAction<A extends unknown[], R = any>(fn: (...a: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (...a: A): Promise<R | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(...a); }
    catch (e) {
      const msg = e instanceof ApiError && e.details && typeof e.details === 'object' ? `${e.message} ${Object.entries(e.details as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).join(' · ')}` : e instanceof Error ? e.message : String(e);
      setError(msg); return undefined;
    } finally { setBusy(false); }
  }, [fn]);
  return { run, busy, error, setError };
}
