// src/lib/billing.ts — catálogo da loja, orçamento e TOKENIZAÇÃO do cartão.
//
// O número do cartão NUNCA vai para a nossa API. Ele é validado aqui (Luhn, validade, CVV) e
// trocado por um token do gateway; a API só recebe o token e guarda bandeira + final. Com o
// provedor `mock`, o token é montado aqui mesmo (`tok_mock_<bandeira>_<final>_<MMAA>`), no formato
// que `apps/api/src/core/billing/providers/mock.ts` entende. Com um gateway real, `tokenizeCard`
// passa a chamar o SDK JS dele (cada gateway tem o seu) — o resto da tela não muda.
import { useEffect, useRef, useState } from 'react';
import { pub } from './api';
import type { ModuleKey } from './session';
import type { Cart } from './cart';

export type BillingMethod = 'CARD' | 'BOLETO' | 'PIX_AUTO';
export interface Feature { key: string; module: ModuleKey | null; label: string; description: string; price: string; required?: boolean; requires?: string[]; permissions: string[] }
export interface ModuleOffer { key: ModuleKey; name: string; tagline: string; forWho: string }
export interface Catalog { modules: ModuleOffer[]; features: Feature[]; trialDays: number; methods: BillingMethod[]; provider: string; stage: 'local' | 'staging' | 'production'; google: { mode: 'real' | 'mock' | 'off'; clientId: string | null } }
export interface QuoteItem { key: string; module: ModuleKey | null; label: string; price: string; reason: 'selected' | 'required' | 'dependency'; requiredBy?: string }
export interface Quote { modules: ModuleKey[]; items: QuoteItem[]; total: string }

let catalogPromise: Promise<Catalog> | null = null;
export const loadCatalog = () => (catalogPromise ??= pub.get<Catalog>('/public/billing/catalog').catch((e) => { catalogPromise = null; throw e; }));

export function useCatalog() {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadCatalog().then(setData, (e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  return { data, error };
}

/** Orçamento do servidor para a escolha atual. Descarta resposta velha (a pessoa clica rápido). */
export function useQuote(c: Cart) {
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(c);
  useEffect(() => {
    if (!c.modules.length) { setQ(null); return; }
    const my = ++seq.current;
    const t = setTimeout(() => {
      pub.post<Quote>('/public/billing/quote', c).then((r) => { if (my === seq.current) { setQ(r); setError(null); } }, (e) => { if (my === seq.current) setError(e instanceof Error ? e.message : String(e)); });
    }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote: q, error };
}

export const METHOD_LABEL: Record<BillingMethod, string> = { CARD: 'Cartão de crédito', BOLETO: 'Boleto', PIX_AUTO: 'Pix Automático' };
export const SUB_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' }> = {
  TRIALING: { label: 'Teste grátis', tone: 'info' }, ACTIVE: { label: 'Ativa', tone: 'ok' }, PAST_DUE: { label: 'Pagamento em atraso', tone: 'danger' }, CANCELED: { label: 'Cancelada', tone: 'warn' },
};
export const INVOICE_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' }> = {
  OPEN: { label: 'Em aberto', tone: 'info' }, PAID: { label: 'Paga', tone: 'ok' }, FAILED: { label: 'Recusada', tone: 'danger' }, VOID: { label: 'Anulada', tone: 'warn' },
};
export const daysLeft = (iso: string | null | undefined) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);

// ── Cartão ────────────────────────────────────────────────────────────────────────────────
export const onlyDigits = (s: string) => s.replace(/\D/g, '');
export function cardBrand(num: string): string {
  const n = onlyDigits(num);
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'master';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return 'elo';
  if (/^(606282|3841)/.test(n)) return 'hipercard';
  return 'card';
}
export const BRAND_LABEL: Record<string, string> = { visa: 'Visa', master: 'Mastercard', amex: 'American Express', elo: 'Elo', hipercard: 'Hipercard', card: 'Cartão' };
export function luhn(num: string): boolean {
  const n = onlyDigits(num);
  if (n.length < 13 || n.length > 19) return false;
  let s = 0;
  for (let i = 0; i < n.length; i++) { let d = Number(n[n.length - 1 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; }
  return s % 10 === 0;
}
export const maskCard = (v: string) => onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
export const maskExp = (v: string) => { const d = onlyDigits(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
export function maskDoc(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export interface CardInput { number: string; name: string; exp: string; cvc: string }
/** Valida e tokeniza. Lança `Error` com a mensagem que vai para a tela. */
export async function tokenizeCard(c: CardInput, provider: string): Promise<string> {
  const number = onlyDigits(c.number);
  if (!luhn(number)) throw new Error('Número do cartão inválido.');
  if (c.name.trim().length < 3) throw new Error('Informe o nome como está no cartão.');
  const [mm, yy] = c.exp.split('/');
  const month = Number(mm), year = 2000 + Number(yy);
  const now = new Date();
  if (!month || month > 12 || !yy || yy.length !== 2 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) throw new Error('Validade inválida ou vencida.');
  const brand = cardBrand(number);
  if (onlyDigits(c.cvc).length !== (brand === 'amex' ? 4 : 3)) throw new Error('Código de segurança (CVV) inválido.');
  if (provider === 'mock') return `tok_mock_${brand}_${number.slice(-4)}_${mm.padStart(2, '0')}${yy}`;
  throw new Error('O gateway de cartão deste ambiente ainda não foi integrado ao navegador.');
}
