// test/mercadopago.test.ts — o que decide se um aviso do Mercado Pago vale: a assinatura
// `x-signature` (HMAC sobre id, request-id e ts), a tradução da situação do pagamento e a data no
// formato que a API aceita. E o `settings` que vai para a tela não leva a credencial do gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assinaturaValida, dataMp, situacao } from '../src/core/payments/providers/mercadopago';
import { settingsParaTela } from '../src/core/tenancy/tenant-modules.service';

const assinar = (secret: string, manifesto: string) => createHmac('sha256', secret).update(manifesto).digest('hex');

test('assinatura do aviso: vale só com o segredo, o id, o request-id e o ts certos', () => {
  const secret = 'segredo-do-webhook';
  const v1 = assinar(secret, 'id:123456;request-id:req-1;ts:1700000000;');
  const header = `ts=1700000000,v1=${v1}`;
  assert.equal(assinaturaValida(secret, '123456', 'req-1', header), true);
  assert.equal(assinaturaValida('outro-segredo', '123456', 'req-1', header), false, 'segredo errado');
  assert.equal(assinaturaValida(secret, '123457', 'req-1', header), false, 'outro pagamento');
  assert.equal(assinaturaValida(secret, '123456', 'req-2', header), false, 'outro request-id');
  assert.equal(assinaturaValida(secret, '123456', 'req-1', `ts=1700000001,v1=${v1}`), false, 'ts trocado');
  assert.equal(assinaturaValida(secret, '123456', 'req-1', `ts=1700000000`), false, 'sem v1');
  assert.equal(assinaturaValida(secret, '123456', 'req-1', ''), false, 'sem cabeçalho');
  // id alfanumérico entra em minúsculas no manifesto; sem request-id, o trecho some.
  const v1b = assinar(secret, 'id:abc9;ts:1700000000;');
  assert.equal(assinaturaValida(secret, 'ABC9', '', `ts=1700000000, v1=${v1b}`), true);
});

test('situação do pagamento: só "approved" baixa; cancelado por prazo é vencido', () => {
  assert.equal(situacao({ id: 1, status: 'approved' }), 'PAID');
  assert.equal(situacao({ id: 1, status: 'pending', status_detail: 'pending_waiting_transfer' }), 'PENDING');
  assert.equal(situacao({ id: 1, status: 'in_process' }), 'PENDING');
  assert.equal(situacao({ id: 1, status: 'rejected' }), 'FAILED');
  assert.equal(situacao({ id: 1, status: 'cancelled', status_detail: 'expired' }), 'EXPIRED');
  assert.equal(situacao({ id: 1, status: 'cancelled', status_detail: 'by_collector' }), 'CANCELLED');
  assert.equal(situacao({ id: 1, status: 'refunded' }), 'PENDING', 'estorno não desfaz a baixa sozinho');
});

test('data para a API: horário de Brasília com fuso explícito', () => {
  assert.equal(dataMp(new Date('2026-10-22T15:30:00.000Z')), '2026-10-22T12:30:00.000-03:00');
  assert.equal(dataMp(new Date('2026-10-23T01:00:00.000Z')), '2026-10-22T22:00:00.000-03:00');
});

test('settings para a tela: sem `payments` (credencial do gateway), o resto intacto', () => {
  const s = { marca: { cor: '#123456' }, defaultSalesModule: 'FOOD', payments: { mercadopago: { accessToken: 'gcm:x:y' }, manual: { pixKey: 'a@b.com' } } };
  assert.deepEqual(settingsParaTela(s), { marca: { cor: '#123456' }, defaultSalesModule: 'FOOD' });
  assert.deepEqual(settingsParaTela(null), {});
});
