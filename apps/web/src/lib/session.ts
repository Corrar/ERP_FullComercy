// src/lib/session.ts — a sessão (tokens + quem sou + módulos + permissões). Persistida em
// localStorage, exposta por contexto React, e com `can()` / `hasModule()` para a UI.
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ModuleKey = 'VAREJO' | 'FOOD' | 'ACADEMIA' | 'SERVICOS' | 'BELEZA' | 'PET' | 'CLINICA' | 'HOTEL';
export interface Session {
  accessToken: string; refreshToken: string;
  user: { id: string; name: string; email: string };
  tenant: { id: string; slug: string; name: string; settings?: Record<string, unknown> };
  permissions: string[]; modules: ModuleKey[];
}
const KEY = 'fc.session';
type Listener = (s: Session | null) => void;
const listeners = new Set<Listener>();
let current: Session | null = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } })();
const emit = () => listeners.forEach((l) => l(current));

export const session = {
  get: () => current,
  set(s: Session | null) { current = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* privado */ } emit(); },
  patch(p: Partial<Session>) { if (current) session.set({ ...current, ...p }); },
  clear() { session.set(null); },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

interface Ctx { s: Session | null; can: (perm: string) => boolean; hasModule: (m: ModuleKey) => boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
const SessionCtx = createContext<Ctx>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Session | null>(current);
  useEffect(() => session.subscribe(setS), []);
  const value = useMemo<Ctx>(() => ({
    s,
    can: (perm) => !!s && (s.permissions.includes('*') || s.permissions.includes(perm)),
    hasModule: (m) => !!s && s.modules.includes(m),
    // Relê /auth/me: ligou um módulo ou mudou um perfil? Aparece sem relogar.
    refresh: async () => { const { get } = await import('./api'); const me = await get('/auth/me'); session.patch({ permissions: me.permissions, modules: me.modules, tenant: { ...s!.tenant, ...me.tenant } }); },
    logout: async () => { const { post } = await import('./api'); try { if (s?.refreshToken) await post('/auth/logout', { refreshToken: s.refreshToken }); } catch { /* já morto */ } session.clear(); },
  }), [s]);
  return createElement(SessionCtx.Provider, { value }, children);
}
export const useSession = () => useContext(SessionCtx);
