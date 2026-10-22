// src/shared/turnstile.ts — Cloudflare Turnstile: prova de "não é robô" nas portas que um robô
// mais ataca — cadastro e login (força bruta, contas falsas), esqueci a senha (spam de e-mail) e
// checkout (teste de cartão roubado). O navegador resolve o desafio e manda o token no header
// `X-Turnstile-Token`; aqui ele é conferido no `siteverify` da Cloudflare (uso único, 5 min).
//
// Regras:
//   • sem TURNSTILE_SECRET_KEY a verificação está DESLIGADA — o boot só permite isso fora de
//     produção (config/env.ts → configProblems);
//   • ligada, falha FECHADA: sem token, token recusado ou Cloudflare fora do ar = 403. Deixar passar
//     quando a verificação cai é exatamente o que um ataque provocaria;
//   • `hostname` devolvido pela Cloudflare não é conferido aqui: a chave do site já é presa aos
//     domínios cadastrados no painel do Turnstile.
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from './errors';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
type FetchLike = (url: string, init: { method: string; body: URLSearchParams; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function verifyTurnstile(token: string | undefined, ip: string | undefined, cfg: { secret?: string; fetchImpl?: FetchLike } = {}): Promise<void> {
  const secret = cfg.secret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret) return; // desligado (só fora de produção)
  const human = () => new AppError('FORBIDDEN', 'Confirme que você não é um robô e tente de novo.', { reason: 'TURNSTILE' });
  if (!token || token.length > 2048) throw human();
  const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  let out: { success?: boolean };
  try {
    const res = await (cfg.fetchImpl ?? (fetch as unknown as FetchLike))(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`siteverify ${String((res as { status?: number }).status ?? '')}`);
    out = (await res.json()) as { success?: boolean };
  } catch {
    throw new AppError('FORBIDDEN', 'Não foi possível confirmar a verificação anti-robô agora. Tente de novo em instantes.', { reason: 'TURNSTILE_UNAVAILABLE' });
  }
  if (out.success !== true) throw human();
}

/** Middleware das rotas sensíveis. Header (não corpo) para servir também a rotas sem JSON. */
export function requireHuman(req: Request, _res: Response, next: NextFunction) {
  verifyTurnstile(req.get('x-turnstile-token') ?? undefined, req.ip).then(() => next(), next);
}
