// src/lib/cart.ts — o CARRINHO da loja: só a ESCOLHA (comércio + funções marcadas). Preço não mora
// aqui: o total é sempre o que `/public/billing/quote` devolve (o servidor recalcula no checkout).
// Fica no aparelho para a pessoa poder sair, entrar na conta e voltar sem perder o que montou.
import { useEffect, useState } from 'react';
import type { ModuleKey } from './session';

export interface Cart { modules: ModuleKey[]; features: string[] }
const KEY = 'fc.cart';
const EMPTY: Cart = { modules: [], features: [] };
type Listener = (c: Cart) => void;
const listeners = new Set<Listener>();
let current: Cart = (() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? 'null') }; } catch { return EMPTY; } })();

export const cart = {
  get: () => current,
  set(c: Cart) { current = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* privado */ } listeners.forEach((l) => l(c)); },
  /** Trocar de comércio recomeça a montagem (as funções de um módulo não servem a outro). */
  chooseModule(m: ModuleKey) { if (current.modules[0] !== m) cart.set({ modules: [m], features: [] }); },
  toggle(key: string) { cart.set({ ...current, features: current.features.includes(key) ? current.features.filter((k) => k !== key) : [...current.features, key] }); },
  clear() { cart.set(EMPTY); },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useCart(): Cart {
  const [c, setC] = useState(current);
  useEffect(() => cart.subscribe(setC), []);
  return c;
}
