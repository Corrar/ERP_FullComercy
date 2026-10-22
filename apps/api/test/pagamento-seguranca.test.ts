// test/pagamento-seguranca.test.ts — Stripe (adaptador), Cloudflare Turnstile e as travas de
// configuração, sem rede: o cliente do Stripe é um dublê, MAS a assinatura do webhook usa a
// biblioteca oficial de verdade (`generateTestHeaderString` + `constructEvent` rodam offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createStripeProvider, toCents, declineMessage, type StripeLike } from '../src/core/billing/providers/stripe';
import { verifyTurnstile } from '../src/shared/turnstile';
import { configProblems, envSchema } from '../src/config/env';
import { AppError } from '../src/shared/errors';

const real = new Stripe('sk_test_offline_only', { maxNetworkRetries: 0 });
const WHSEC = 'whsec_teste_offline_0123456789';

function fakeClient(over: Partial<Record<string, any>> = {}) {
  const calls: Record<string, any[]> = {};
  const rec = (k: string, ret: any) => async (...a: any[]) => { (calls[k] ??= []).push(a); return typeof ret === 'function' ? ret(...a) : ret; };
  const client = {
    customers: { create: rec('customers.create', { id: 'cus_1' }), update: rec('customers.update', {}) },
    setupIntents: { create: rec('setupIntents.create', { id: 'seti_1', client_secret: 'seti_1_secret_x' }) },
    paymentMethods: {
      retrieve: rec('pm.retrieve', over.pm ?? { id: 'pm_1', type: 'card', customer: null, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }),
      attach: rec('pm.attach', {}),
    },
    paymentIntents: { create: rec('pi.create', over.pi ?? { id: 'pi_1', status: 'succeeded' }) },
    webhooks: real.webhooks,
  } as unknown as StripeLike;
  return { client, calls };
}

test('toCents converte string decimal sem float acumulado', () => {
  assert.equal(toCents('124.40'), 12440);
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents('39.9'), 3990);
  assert.equal(toCents('1000'), 100000);
});

test('Stripe: cartão confirmado é preso ao Customer e vira o padrão; bandeira/final voltam', async () => {
  const { client, calls } = fakeClient();
  const p = createStripeProvider(client, {});
  const card = await p.attachCard({ customerId: 'cus_1', cardToken: 'pm_1' });
  assert.deepEqual(card, { ref: 'pm_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 });
  assert.deepEqual(calls['pm.attach'][0], ['pm_1', { customer: 'cus_1' }]);
  assert.deepEqual(calls['customers.update'][0], ['cus_1', { invoice_settings: { default_payment_method: 'pm_1' } }]);
  // Contra-prova: token que não é pm_ nem chega no Stripe; cartão de OUTRO cliente é recusado.
  await assert.rejects(p.attachCard({ customerId: 'cus_1', cardToken: 'tok_mock_visa_4242_1230' }), /inválido/);
  const outro = fakeClient({ pm: { id: 'pm_2', type: 'card', customer: 'cus_X', card: { brand: 'visa', last4: '1', exp_month: 1, exp_year: 2030 } } });
  await assert.rejects(createStripeProvider(outro.client, {}).attachCard({ customerId: 'cus_1', cardToken: 'pm_2' }), /outro cliente/);
  assert.equal(outro.calls['pm.attach'], undefined, 'não tenta prender cartão alheio');
});

test('Stripe: mensalidade off_session em BRL com idempotência por fatura+tentativa', async () => {
  const { client, calls } = fakeClient();
  const r = await createStripeProvider(client, {}).chargeCard({ customerId: 'cus_1', cardRef: 'pm_1', amount: '124.40', description: 'Mensalidade', invoiceId: 'inv_9', attempt: 2 });
  assert.deepEqual(r, { ok: true, providerRef: 'pi_1' });
  const [params, opts] = calls['pi.create'][0];
  assert.equal(params.amount, 12440);
  assert.equal(params.currency, 'brl');
  assert.equal(params.off_session, true);
  assert.equal(params.confirm, true);
  assert.equal(opts.idempotencyKey, 'invoice-inv_9-attempt-2');
});

test('Stripe: recusa vira mensagem em português; processing fica pendente; 3DS pedido vira aviso', async () => {
  const declined = fakeClient({ pi: () => { throw Object.assign(new Error('Your card has insufficient funds.'), { type: 'StripeCardError', decline_code: 'insufficient_funds', payment_intent: { id: 'pi_x' } }); } });
  assert.deepEqual(await createStripeProvider(declined.client, {}).chargeCard({ customerId: 'c', cardRef: 'pm', amount: '1.00', description: 'd', invoiceId: 'i', attempt: 1 }),
    { ok: false, providerRef: 'pi_x', failureReason: 'Saldo ou limite insuficiente.' });
  const proc = fakeClient({ pi: { id: 'pi_p', status: 'processing' } });
  assert.deepEqual(await createStripeProvider(proc.client, {}).chargeCard({ customerId: 'c', cardRef: 'pm', amount: '1.00', description: 'd', invoiceId: 'i', attempt: 1 }), { ok: false, pending: true, providerRef: 'pi_p' });
  const sca = fakeClient({ pi: { id: 'pi_a', status: 'requires_action' } });
  const r = await createStripeProvider(sca.client, {}).chargeCard({ customerId: 'c', cardRef: 'pm', amount: '1.00', description: 'd', invoiceId: 'i', attempt: 1 });
  assert.equal(r.ok, false);
  assert.match(r.failureReason!, /autenticação/);
  // Gateway fora: falha "temporária" (o ciclo tenta de novo), não "cartão recusado".
  const down = fakeClient({ pi: () => { throw Object.assign(new Error('conn'), { type: 'StripeConnectionError' }); } });
  assert.match((await createStripeProvider(down.client, {}).chargeCard({ customerId: 'c', cardRef: 'pm', amount: '1.00', description: 'd', invoiceId: 'i', attempt: 1 })).failureReason!, /indisponível/);
  // Erro de configuração NÃO é engolido.
  const bad = fakeClient({ pi: () => { throw Object.assign(new Error('Invalid API Key'), { type: 'StripeAuthenticationError' }); } });
  await assert.rejects(createStripeProvider(bad.client, {}).chargeCard({ customerId: 'c', cardRef: 'pm', amount: '1.00', description: 'd', invoiceId: 'i', attempt: 1 }), /Invalid API Key/);
  assert.equal(declineMessage('codigo_novo'), 'Cartão recusado pelo emissor.');
});

test('Stripe: Pix e boleto fora enquanto a conta não os ativa (a loja só oferece cartão)', async () => {
  const p = createStripeProvider(fakeClient().client, {});
  assert.deepEqual([...p.methods], ['CARD']);
  await assert.rejects(Promise.resolve().then(() => p.createBoleto({} as never)), /não está ativo/);
});

test('webhook do Stripe: assinatura REAL confere; corpo adulterado, segredo errado e evento alheio', async () => {
  const p = createStripeProvider(fakeClient().client, { webhookSecret: WHSEC });
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'payment_intent.succeeded', created: 1_800_000_000, data: { object: { id: 'pi_ok', object: 'payment_intent' } } });
  const header = real.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const ev = await p.parseWebhook({ headers: { 'stripe-signature': header }, body: JSON.parse(payload), rawBody: Buffer.from(payload) });
  assert.deepEqual(ev, { kind: 'invoice', providerRef: 'pi_ok', status: 'PAID', paidAt: new Date(1_800_000_000_000) });
  // Contra-provas: um byte trocado no corpo, segredo de outra conta, header ausente.
  await assert.rejects(p.parseWebhook({ headers: { 'stripe-signature': header }, body: {}, rawBody: Buffer.from(payload.replace('pi_ok', 'pi_ko')) }));
  const alheio = real.webhooks.generateTestHeaderString({ payload, secret: 'whsec_outra_conta_000000' });
  await assert.rejects(p.parseWebhook({ headers: { 'stripe-signature': alheio }, body: {}, rawBody: Buffer.from(payload) }));
  await assert.rejects(p.parseWebhook({ headers: {}, body: {}, rawBody: Buffer.from(payload) }), /assinatura/);
  await assert.rejects(createStripeProvider(fakeClient().client, {}).parseWebhook({ headers: { 'stripe-signature': header }, body: {}, rawBody: Buffer.from(payload) }), /não configurado/);
  const outro = JSON.stringify({ id: 'evt_2', object: 'event', type: 'customer.created', created: 1, data: { object: { id: 'cus_1' } } });
  assert.deepEqual(await p.parseWebhook({ headers: { 'stripe-signature': real.webhooks.generateTestHeaderString({ payload: outro, secret: WHSEC }) }, body: {}, rawBody: Buffer.from(outro) }), { kind: 'ignored', type: 'customer.created' });
});

test('Turnstile: desligado sem segredo; ligado é fail-closed (sem token, recusado, Cloudflare fora)', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ success: true }) });
  const no = async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) });
  const down = async () => { throw new Error('ECONNRESET'); };
  const seen: URLSearchParams[] = [];
  const spy = async (_u: string, init: { body: URLSearchParams }) => { seen.push(init.body); return ok(); };
  await verifyTurnstile(undefined, undefined, { secret: '' }); // desligado
  await verifyTurnstile('tok', '1.2.3.4', { secret: 'sec', fetchImpl: spy as never });
  assert.equal(seen[0].get('secret'), 'sec');
  assert.equal(seen[0].get('response'), 'tok');
  assert.equal(seen[0].get('remoteip'), '1.2.3.4');
  const reason = (e: unknown) => (e instanceof AppError ? (e.details as { reason: string }).reason : '');
  await assert.rejects(verifyTurnstile(undefined, undefined, { secret: 'sec', fetchImpl: ok as never }), (e) => reason(e) === 'TURNSTILE');
  await assert.rejects(verifyTurnstile('tok', undefined, { secret: 'sec', fetchImpl: no as never }), (e) => reason(e) === 'TURNSTILE');
  await assert.rejects(verifyTurnstile('tok', undefined, { secret: 'sec', fetchImpl: down as never }), (e) => reason(e) === 'TURNSTILE_UNAVAILABLE');
});

test('travas de configuração: o que derruba o boot', () => {
  const base = envSchema.parse({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) });
  const stripeTest = { ...base, BILLING_PROVIDER: 'stripe' as const, STRIPE_SECRET_KEY: 'sk_test_a', STRIPE_PUBLISHABLE_KEY: 'pk_test_a' };
  const stripeLive = { ...base, BILLING_PROVIDER: 'stripe' as const, STRIPE_SECRET_KEY: 'sk_live_a', STRIPE_PUBLISHABLE_KEY: 'pk_live_a' };
  const turn = { TURNSTILE_SITE_KEY: '0x4AAAAAAAAA', TURNSTILE_SECRET_KEY: '0x4AAAAAAAAAsecret' };
  assert.deepEqual(configProblems(stripeTest, 'staging'), []);
  const smtp = { SMTP_HOST: 'smtp.exemplo.com' };
  assert.deepEqual(configProblems({ ...stripeLive, ...turn, ...smtp }, 'production'), []);
  assert.match(configProblems({ ...stripeLive, ...turn }, 'production').join(), /SMTP_HOST/, 'produção sem e-mail não sobe');
  assert.deepEqual(configProblems(stripeTest, 'staging'), [], 'homologação segue sem SMTP (provedor console)');
  assert.match(configProblems(stripeLive, 'staging').join(), /REAL do Stripe fora de produção/);
  assert.match(configProblems({ ...stripeTest, ...turn }, 'production').join(), /Produção exige chaves REAIS/);
  assert.match(configProblems({ ...stripeLive }, 'production').join(), /Turnstile/);
  assert.match(configProblems({ ...base, BILLING_PROVIDER: 'stripe' }, 'staging').join(), /exige STRIPE_SECRET_KEY/);
  assert.match(configProblems({ ...stripeTest, STRIPE_PUBLISHABLE_KEY: 'pk_live_a' }, 'staging').join(), /misturam/);
  assert.match(configProblems({ ...base, TURNSTILE_SITE_KEY: '0x4AAAAAAAAA' }, 'staging').join(), /vão juntas/);
  assert.match(configProblems({ ...base, ...turn }, 'production').join(), /mock só valem fora de produção/);
});
