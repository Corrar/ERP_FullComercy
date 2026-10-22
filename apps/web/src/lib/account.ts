// src/lib/account.ts — a sessão da CONTA do comprador (loja, carrinho, checkout, minhas empresas).
// Separada da sessão da empresa (`session.ts`): dá para estar na loja montando um segundo ERP com
// a conta e, ao mesmo tempo, ter a empresa aberta. Mesmo padrão de store + assinatura.
import { createElement, createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AccountInfo { id: string; email: string; name: string; avatarUrl: string | null; hasPassword: boolean; hasGoogle: boolean; trialAvailable: boolean }
export interface AccountSession { token: string; account: AccountInfo }

const KEY = 'fc.account';
type Listener = (s: AccountSession | null) => void;
const listeners = new Set<Listener>();
let current: AccountSession | null = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } })();

export const accountSession = {
  get: () => current,
  set(s: AccountSession | null) { current = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* privado */ } listeners.forEach((l) => l(current)); },
  patch(a: Partial<AccountInfo>) { if (current) accountSession.set({ ...current, account: { ...current.account, ...a } }); },
  clear() { accountSession.set(null); },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

const Ctx = createContext<AccountSession | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState(current);
  useEffect(() => accountSession.subscribe(setS), []);
  return createElement(Ctx.Provider, { value: s }, children);
}
export const useAccount = () => useContext(Ctx);
