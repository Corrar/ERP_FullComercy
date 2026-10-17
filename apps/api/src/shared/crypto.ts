// src/shared/crypto.ts — cifra simétrica para segredos guardados em JSON (token de dispositivo,
// chave de gateway). AES-256-GCM com a chave de `APP_ENCRYPTION_KEY` (32 bytes em base64/hex).
// Sem a chave configurada: grava em claro com prefixo `plain:` e AVISA no boot — dev não quebra,
// produção não passa despercebida.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

const key: Buffer | null = env.APP_ENCRYPTION_KEY ? createHash('sha256').update(env.APP_ENCRYPTION_KEY).digest() : null;
if (!key) console.warn('[crypto] APP_ENCRYPTION_KEY ausente: segredos de dispositivo ficam em claro (prefixo plain:). Configure em produção.');

export function seal(plain: string): string {
  if (!key) return `plain:${plain}`;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `gcm:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function open(sealed: string): string {
  if (sealed.startsWith('plain:')) return sealed.slice(6);
  if (!sealed.startsWith('gcm:')) return sealed; // legado sem prefixo
  if (!key) throw new Error('Segredo cifrado e APP_ENCRYPTION_KEY ausente.');
  const [iv, tag, data] = sealed.slice(4).split('.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

/** Comparação em tempo constante para tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest(); const hb = createHash('sha256').update(b).digest();
  return ha.equals(hb);
}
