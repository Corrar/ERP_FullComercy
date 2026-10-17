import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';
process.env.APP_ENCRYPTION_KEY = 'chave-de-teste-0123456789';
import { seal, open, safeEqual } from '../src/shared/crypto';
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
