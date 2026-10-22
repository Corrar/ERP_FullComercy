// src/core/account/google.ts — confere o ID token do "Entrar com Google" (Google Identity
// Services). O navegador recebe do Google um JWT assinado (RS256); a API valida AQUI a assinatura
// contra as chaves públicas do Google (JWKS, com cache pelo `max-age`), o `aud` (nosso client ID),
// o `iss`, a validade e o `email_verified`. Sem dependência nova: `crypto` do Node lê JWK.
//
// GOOGLE_AUTH_MOCK=1 (só dev/teste; o boot recusa em produção) aceita `mock.<base64url(json)>`
// com { sub, email, name } — é como e2e e demonstração exercitam o fluxo sem conta Google real.
import { createPublicKey, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';

export interface GoogleIdentity { sub: string; email: string; name: string; picture?: string }

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'] as [string, string];
let jwks: { at: number; ttlMs: number; keys: Map<string, KeyObject> } | null = null;

async function googleKey(kid: string): Promise<KeyObject | undefined> {
  if (!jwks || Date.now() - jwks.at > jwks.ttlMs || !jwks.keys.has(kid)) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new AppError('INTERNAL', 'Não foi possível falar com o Google agora. Tente de novo.');
    const body = (await res.json()) as { keys: (Record<string, string> & { kid: string })[] };
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    jwks = { at: Date.now(), ttlMs: maxAge * 1000, keys: new Map(body.keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
  }
  return jwks.keys.get(kid);
}

export const googleMode = (): 'real' | 'mock' | 'off' => (env.GOOGLE_CLIENT_ID ? 'real' : env.GOOGLE_AUTH_MOCK ? 'mock' : 'off');

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const invalid = () => new AppError('UNAUTHENTICATED', 'Login com Google inválido ou expirado. Tente de novo.');

  if (credential.startsWith('mock.')) {
    if (!env.GOOGLE_AUTH_MOCK) throw invalid();
    try {
      const p = JSON.parse(Buffer.from(credential.slice(5), 'base64url').toString('utf8')) as Partial<GoogleIdentity>;
      if (!p.sub || !p.email) throw new Error('incompleto');
      return { sub: `mock-${p.sub}`, email: p.email.toLowerCase(), name: p.name || p.email.split('@')[0] };
    } catch { throw invalid(); }
  }

  if (!env.GOOGLE_CLIENT_ID) throw new AppError('FORBIDDEN', 'Login com Google não está configurado neste ambiente.');
  const decoded = jwt.decode(credential, { complete: true });
  const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
  if (!kid) throw invalid();
  const key = await googleKey(kid);
  if (!key) throw invalid();
  let p: jwt.JwtPayload;
  try {
    p = jwt.verify(credential, key, { algorithms: ['RS256'], audience: env.GOOGLE_CLIENT_ID, issuer: ISSUERS }) as jwt.JwtPayload;
  } catch { throw invalid(); }
  // E-mail não verificado no Google não prova posse: não abre nem vincula conta.
  if (!p.sub || !p.email || p.email_verified !== true) throw invalid();
  return { sub: String(p.sub), email: String(p.email).toLowerCase(), name: String(p.name ?? p.email), picture: p.picture ? String(p.picture) : undefined };
}
