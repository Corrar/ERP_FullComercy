// src/lib/marca.ts — a MARCA DA EMPRESA no front: logo e cor que a empresa escolheu na tela
// Empresa. A API é a fonte (`GET /tenant/marca` logado, `GET /public/marca/:slug` antes do login);
// aqui só se transforma a cor em variáveis do CSS e se avisa quem desenha quando ela muda.
import type { CSSProperties } from 'react';
import { apiBase } from './api';

export interface Marca { slug: string; nome: string; cor: string | null; corNoSistema?: boolean; logoUrl: string | null; logoExterno?: string | null; linkEquipe?: string }

/** URL do logo para `<img>`: o da API (arquivo enviado) ou o link antigo, só dos e-mails. */
export const srcDoLogo = (m?: Pick<Marca, 'logoUrl' | 'logoExterno'> | null) => (m?.logoUrl ? apiBase + m.logoUrl : m?.logoExterno ?? null);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Contraste WCAG entre duas cores #RRGGBB (1 a 21). */
export const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Texto sobre a cor (botão, item ativo do menu): branco ou quase preto, o que ler melhor. */
export const tintaSobre = (hex: string) => (contraste(hex, '#ffffff') >= contraste(hex, '#111827') ? '#ffffff' : '#111827');

const valida = (c: string | null | undefined): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

/** Variáveis da marca: `--brand` (login da equipe, logotipo) e, com `noSistema`, `--accent` (menu e botões). */
export function estiloDaMarca(cor: string | null | undefined, noSistema: boolean): CSSProperties {
  if (!valida(cor)) return {};
  const ink = tintaSobre(cor);
  const v: Record<string, string> = { '--brand': cor, '--brand-ink': ink, '--brand-deep': `color-mix(in srgb, ${cor} 62%, #000)` };
  if (noSistema) Object.assign(v, { '--accent': cor, '--accent-ink': ink });
  return v as CSSProperties;
}

/** Quem salva a marca avisa; o Shell relê e repinta sem precisar sair e entrar. */
const EVENTO = 'fc:marca';
export const avisarMarcaMudou = () => window.dispatchEvent(new Event(EVENTO));
export const aoMudarMarca = (fn: () => void) => { window.addEventListener(EVENTO, fn); return () => window.removeEventListener(EVENTO, fn); };
