// src/shared/crypto.ts — cifra simétrica para segredos guardados no banco (segredo do webhook,
// token da catraca). AES-256-GCM com a chave de `APP_ENCRYPTION_KEY`.
// Sem a chave configurada: grava em claro com prefixo `plain:` e AVISA no boot — dev não quebra,
// produção não sobe (`configProblems`).
//
// ROTAÇÃO: o selo leva o id da chave (`gcm:<kid>:iv.tag.dados`). Para trocar a chave, a nova vai em
// `APP_ENCRYPTION_KEY` e a antiga em `APP_ENCRYPTION_KEY_PREVIOUS`, que só ABRE (nunca sela). O job
// `core.recifrar-segredos` (core/platform/segredos.service.ts) regrava tudo com a nova; quando
// `GET /platform/segredos` mostrar zero na antiga, a variável antiga sai do ambiente.
// Selo legado sem kid (`gcm:iv.tag.dados`, antes da rotação existir) abre por tentativa: o GCM
// recusa a chave errada pela etiqueta, então a primeira que abrir é a certa.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

interface Chave { kid: string; key: Buffer }
const derivar = (segredo: string): Chave => {
  const key = createHash('sha256').update(segredo).digest();
  // O kid é hash da chave derivada: identifica sem revelar nada que ajude a achá-la.
  return { kid: createHash('sha256').update(key).digest('hex').slice(0, 8), key };
};

export interface Cifra {
  /** Id da chave que sela agora (null = sem chave, grava em claro). */
  kid: string | null;
  seal(plain: string): string;
  open(sealed: string): string;
  /** O selo não está na chave atual (antiga, legado sem kid, em claro com chave configurada)? */
  precisaRecifrar(sealed: string): boolean;
  /** Em que chave está o selo: kid, 'legado' (gcm sem kid), 'em claro'. */
  chaveDo(sealed: string): string;
}

export function criarCifra(atual?: string, anterior?: string): Cifra {
  const cur = atual ? derivar(atual) : null;
  const prev = anterior ? derivar(anterior) : null;
  const chaves = [cur, prev].filter((c): c is Chave => !!c);

  const decifrar = (k: Buffer, iv: string, tag: string, data: string) => {
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  };
  const chaveDo = (s: string) => {
    if (!s.startsWith('gcm:')) return 'em claro';
    const i = s.indexOf(':', 4); // base64url não tem ':' — se houver, é o separador do kid
    return i > 0 ? s.slice(4, i) : 'legado';
  };

  return {
    kid: cur?.kid ?? null,
    seal(plain) {
      if (!cur) return `plain:${plain}`;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', cur.key, iv);
      const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return `gcm:${cur.kid}:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
    },
    open(sealed) {
      if (sealed.startsWith('plain:')) return sealed.slice(6);
      if (!sealed.startsWith('gcm:')) return sealed; // legado sem prefixo
      if (!chaves.length) throw new Error('Segredo cifrado e APP_ENCRYPTION_KEY ausente.');
      const kid = chaveDo(sealed);
      if (kid !== 'legado') {
        const k = chaves.find((c) => c.kid === kid);
        if (!k) throw new Error(`Segredo cifrado com a chave ${kid}, que não está no ambiente: ponha a chave antiga em APP_ENCRYPTION_KEY_PREVIOUS.`);
        const [iv, tag, data] = sealed.slice(5 + kid.length).split('.');
        return decifrar(k.key, iv, tag, data);
      }
      const [iv, tag, data] = sealed.slice(4).split('.');
      for (const k of chaves) { try { return decifrar(k.key, iv, tag, data); } catch { /* próxima chave */ } }
      throw new Error('Segredo cifrado (legado) que nenhuma chave do ambiente abre.');
    },
    precisaRecifrar: (s) => !!cur && chaveDo(s) !== cur.kid,
    chaveDo,
  };
}

export const cifra = criarCifra(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEY_PREVIOUS);
if (!cifra.kid) console.warn('[crypto] APP_ENCRYPTION_KEY ausente: segredos ficam em claro (prefixo plain:). Configure em produção.');

export const seal = (plain: string) => cifra.seal(plain);
export const open = (sealed: string) => cifra.open(sealed);

/** Comparação em tempo constante para tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest(); const hb = createHash('sha256').update(b).digest();
  return ha.equals(hb);
}
