import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY = 'chave-de-teste-0123456789';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { seal, open, safeEqual, criarCifra } from '../src/shared/crypto';
import { toCsv } from '../src/shared/csv';
import { sign } from '../src/core/integration/outbox.service';
import { D } from '../src/shared/money';

test('cifra: abre o que selou, nunca repete o texto, aceita legado em claro', () => {
  const s = seal('segredo-123');
  assert.match(s, /^gcm:/); assert.notEqual(s, seal('segredo-123'));
  assert.equal(open(s), 'segredo-123');
  assert.equal(open('plain:abc'), 'abc'); assert.equal(open('sem-prefixo'), 'sem-prefixo');
  assert.throws(() => open('gcm:aaaa.bbbb.cccc'));
  assert.ok(safeEqual('x', 'x') && !safeEqual('x', 'y'));
});
test('cifra: rotação — a chave antiga só abre, o selo diz a chave, recifrar leva para a nova', () => {
  const velha = criarCifra('chave-velha-0123456789');
  const nova = criarCifra('chave-nova-0123456789', 'chave-velha-0123456789');
  const soNova = criarCifra('chave-nova-0123456789');
  const s = velha.seal('token-da-catraca');
  assert.equal(nova.chaveDo(s), velha.kid);
  assert.notEqual(nova.kid, velha.kid);
  assert.equal(nova.open(s), 'token-da-catraca', 'a anterior abre');
  assert.equal(nova.precisaRecifrar(s), true);
  const r = nova.seal(nova.open(s));
  assert.equal(nova.chaveDo(r), nova.kid, 'sela SEMPRE com a atual');
  assert.equal(nova.precisaRecifrar(r), false);
  assert.equal(soNova.open(r), 'token-da-catraca', 'depois de recifrar, a antiga pode sair');
  assert.throws(() => soNova.open(s), /APP_ENCRYPTION_KEY_PREVIOUS/, 'sem a antiga, o erro diz o que fazer');
  assert.throws(() => velha.open(r), /não está no ambiente/);
  // Selo legado (sem kid, de antes da rotação): abre por tentativa, com a atual ou a anterior.
  const legado = (segredo: string, txt: string) => {
    const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', createHash('sha256').update(segredo).digest(), iv);
    const enc = Buffer.concat([c.update(txt, 'utf8'), c.final()]);
    return `gcm:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
  };
  assert.equal(nova.open(legado('chave-velha-0123456789', 'a')), 'a');
  assert.equal(nova.open(legado('chave-nova-0123456789', 'b')), 'b');
  assert.equal(nova.chaveDo(legado('chave-nova-0123456789', 'b')), 'legado');
  assert.equal(nova.precisaRecifrar(legado('chave-nova-0123456789', 'b')), true);
  assert.throws(() => soNova.open(legado('outra-chave-0123456789', 'c')), /nenhuma chave/);
  // Em claro: recifra assim que houver chave; sem chave nenhuma, nada a fazer.
  assert.equal(nova.precisaRecifrar('plain:x'), true);
  assert.equal(criarCifra().precisaRecifrar('plain:x'), false);
  assert.equal(criarCifra().seal('x'), 'plain:x');
});
test('assinatura do webhook é HMAC-SHA256 estável', () => {
  assert.equal(sign('k', '{"a":1}'), sign('k', '{"a":1}'));
  assert.notEqual(sign('k', '{"a":1}'), sign('k2', '{"a":1}'));
  assert.match(sign('k', 'x'), /^sha256=[0-9a-f]{64}$/);
});
test('csv: BOM, ponto-e-vírgula, decimal com vírgula, escape de aspas', () => {
  const csv = toCsv([{ sku: 'A;1', total: D('10.5'), qtd: 2, nome: 'diz "oi"', data: new Date('2026-01-01T00:00:00Z') }]);
  assert.ok(csv.startsWith('﻿'));
  const [h, l] = csv.replace('﻿', '').split('\r\n');
  assert.equal(h, 'sku;total;qtd;nome;data');
  assert.equal(l, '"A;1";10,50;2;"diz ""oi""";2026-01-01T00:00:00.000Z');
  assert.equal(toCsv([]), '');
});
