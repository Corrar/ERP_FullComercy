// test/e2e/loja.test.ts — a LOJA DE MÓDULOS ponta a ponta: vitrine, conta (senha e Google
// simulado), checkout com 7 dias grátis, corte por plano, cobrança recorrente (cartão, boleto,
// Pix Automático), atraso → suspensão → pagamento → volta. O ciclo roda com `now` adiantado
// (sem relógio falso): `runBillingCycle(now)` é a mesma função que o job chama.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';

/** CPF válido e único por rodada (o teste grátis é por documento: repetir quebraria a 2ª rodada). */
function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 7919) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}
const DIA = 86_400_000;
const googleMock = (sub: string, email: string, name: string) => 'mock.' + Buffer.from(JSON.stringify({ sub, email, name })).toString('base64url');
const WEBHOOK = { 'x-billing-token': process.env.BILLING_MOCK_WEBHOOK_TOKEN ?? '' };

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  const email = `dono-${run.toLowerCase()}@exemplo.com`;
  let acct = '';
  let empresaA: { tenantId: string; token: string } = { tenantId: '', token: '' };

  test('vitrine: catálogo público e orçamento calculado no servidor', async () => {
    const cat = await api().get('/public/billing/catalog');
    assert.equal(cat.trialDays, 7);
    assert.deepEqual(cat.methods, ['CARD', 'BOLETO', 'PIX_AUTO']);
    assert.equal(cat.modules.length, 4);
    assert.ok(cat.features.every((f: any) => f.permissions === undefined), 'chave interna não vaza');
    const q = await api().post('/public/billing/quote', { modules: ['VAREJO'], features: ['varejo.etiquetas'] });
    // mínimo do Varejo 114,50 + Etiquetas 9,90
    assert.equal(q.total, '124.40');
    assert.equal((await api().raw('POST', '/public/billing/quote', { modules: [], features: [] })).status, 400);
  });

  test('conta: cadastro, duplicado 409, login, e os dois tokens não se misturam', async () => {
    const r = await api().post('/account/register', { name: 'Dona da Loja', email, password: 'Senha-forte-123' });
    assert.equal(r.account.trialAvailable, true);
    assert.equal((await api().raw('POST', '/account/register', { name: 'Outra Pessoa', email, password: 'Senha-forte-123' })).status, 409);
    assert.equal((await api().raw('POST', '/account/login', { email, password: 'errada-123' })).status, 401);
    acct = (await api().post('/account/login', { email, password: 'Senha-forte-123' })).token;
    assert.equal((await api(acct).raw('GET', '/dashboard')).status, 401, 'token de conta não abre rota de empresa');
    assert.equal((await api().raw('POST', '/account/checkout', {})).status, 401, 'checkout exige login');
  });

  test('checkout com cartão: 7 dias grátis, nada cobrado, empresa pronta e plano cortando o que não foi pago', async () => {
    const bad = await api(acct).raw('POST', '/account/checkout', { company: { name: `Loja ${run}`, document: cpf(1) }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_0002_1230' } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /recusado/);
    const docInvalido = await api(acct).raw('POST', '/account/checkout', { company: { name: `Loja ${run}`, document: '111.111.111-11' }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } });
    assert.equal(docInvalido.status, 400);
    assert.equal((await api(acct).get('/account/me')).companies.length, 0, 'recusa não deixa empresa órfã');

    const r = await api(acct).post('/account/checkout', { company: { name: `Loja ${run}`, document: cpf(1) }, modules: ['VAREJO'], features: ['varejo.etiquetas'], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } });
    assert.equal(r.trial, true);
    assert.equal(r.amount, '124.40');
    assert.equal(r.firstInvoice, null, 'no teste nada é cobrado');
    const dias = Math.round((new Date(r.trialEndsAt).getTime() - Date.now()) / DIA);
    assert.equal(dias, 7);
    empresaA = { tenantId: r.session.tenant.id, token: r.session.accessToken };
    assert.deepEqual(r.session.modules, ['VAREJO']);
    assert.ok(!r.session.permissions.includes('*'), 'admin com plano recebe as chaves por extenso');
    assert.ok(r.session.permissions.includes('varejo.etiquetas:print'));
    assert.ok(!r.session.permissions.includes('varejo.grade:manage'));

    const A = api(empresaA.token);
    await A.get('/m/varejo/etiquetas/modelos');
    const fora = await A.raw('POST', '/m/varejo/grade/eixos', { name: 'Tamanho' });
    assert.equal(fora.status, 403);
    assert.equal(fora.body.details.reason, 'NOT_IN_PLAN');
    assert.equal((await A.raw('GET', '/finance/entries')).status, 403, 'Financeiro não contratado');
    const sub = await A.get('/billing/subscription');
    assert.equal(sub.status, 'TRIALING');
    assert.equal(sub.paymentInfo.last4, '4242');
    assert.equal(sub.tenant.status, 'TRIAL');

    const me = await api(acct).get('/account/me');
    assert.equal(me.account.trialAvailable, false);
    assert.equal(me.companies.length, 1);
    // Entrar de novo pela conta dá sessão da mesma empresa; outra conta não entra.
    const s2 = await api(acct).post(`/account/companies/${empresaA.tenantId}/session`);
    assert.equal(s2.tenant.id, empresaA.tenantId);
    const outra = (await api().post('/account/register', { name: 'Intrusa', email: `intrusa-${run.toLowerCase()}@exemplo.com`, password: 'Senha-forte-123' })).token;
    assert.equal((await api(outra).raw('POST', `/account/companies/${empresaA.tenantId}/session`)).status, 403);
    assert.equal((await api(empresaA.token).raw('GET', '/account/me')).status, 401, 'token de empresa não abre a conta');
  });

  test('trocar funções vale na hora para o acesso e o valor vai para a próxima fatura', async () => {
    const A = api(empresaA.token);
    const r = await A.put('/billing/subscription/features', { modules: ['VAREJO'], features: ['varejo.grade'] });
    // 114,50 + Grade 14,90 (Etiquetas saiu)
    assert.equal(r.amount, '129.40');
    await A.post('/m/varejo/grade/eixos', { name: `Eixo ${run}` });
    assert.equal((await A.raw('GET', '/m/varejo/etiquetas/modelos')).status, 403);
    const me = await A.get('/auth/me');
    assert.ok(me.permissions.includes('varejo.grade:manage') && !me.permissions.includes('varejo.etiquetas:print'));
  });

  test('segunda compra da mesma conta: sem teste, boleto emitido e baixado pelo webhook', async () => {
    const r = await api(acct).post('/account/checkout', { company: { name: `Filial ${run}`, document: cpf(2) }, modules: ['FOOD'], features: [], payment: { method: 'BOLETO' } });
    assert.equal(r.trial, false);
    assert.equal(r.firstInvoice.status, 'OPEN');
    assert.ok(r.firstInvoice.boletoLine && r.firstInvoice.boletoUrl);
    assert.equal(r.firstInvoice.amount, r.amount);
    const B = api(r.session.accessToken);
    const inv = (await B.get('/billing/subscription')).invoices[0];
    assert.equal((await api().raw('POST', '/public/billing/webhooks/mock', { kind: 'invoice', providerRef: 'x', status: 'PAID' }, { 'x-billing-token': 'errado-errado-errado' })).status, 401);
    const { prisma } = await import('../../src/infra/prisma');
    const ref = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).providerRef!;
    await api().post('/public/billing/webhooks/mock', { kind: 'invoice', providerRef: ref, status: 'PAID' }, WEBHOOK);
    const depois = await B.get('/billing/subscription');
    assert.equal(depois.invoices[0].status, 'PAID');
    assert.equal(depois.status, 'ACTIVE');
  });

  test('Google (simulado) cria conta; Pix Automático pede autorização e o webhook confirma', async () => {
    const g = await api().post('/account/google', { credential: googleMock(`g-${run}`, `google-${run.toLowerCase()}@gmail.com`, 'Cliente Google') });
    assert.equal(g.account.hasGoogle, true);
    assert.equal(g.account.hasPassword, false);
    assert.equal((await api().raw('POST', '/account/google', { credential: 'mock.nao-e-json' })).status, 401);
    const r = await api(g.token).post('/account/checkout', { company: { name: `Academia ${run}`, document: cpf(3) }, modules: ['ACADEMIA'], features: ['gym.turmas'], payment: { method: 'PIX_AUTO' } });
    assert.equal(r.trial, true);
    assert.equal(r.paymentInfo.pixStatus, 'PENDING');
    assert.ok(r.paymentInfo.pixAuthorizationQr);
    const { prisma } = await import('../../src/infra/prisma');
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: r.subscriptionId } });
    await api().post('/public/billing/webhooks/mock', { kind: 'pix_authorization', authorizationId: sub.paymentRef, status: 'AUTHORIZED' }, WEBHOOK);
    const C = api(r.session.accessToken);
    assert.equal((await C.get('/billing/subscription')).paymentInfo.pixStatus, 'AUTHORIZED');
    // Fim do teste: o débito automático liquida a 1ª mensalidade.
    const { runBillingCycle } = await import('../../src/core/billing/billing.service');
    await runBillingCycle(new Date(Date.now() + 8 * DIA));
    const s = await C.get('/billing/subscription');
    assert.equal(s.status, 'ACTIVE');
    assert.equal(s.invoices[0].status, 'PAID');
    assert.equal(s.invoices[0].amount, s.amount);
    assert.equal(s.tenant.status, 'ACTIVE');
  });

  test('cartão sem limite no fim do teste → atraso → suspensão; pagar com outro cartão reabre', async () => {
    const A = api(empresaA.token);
    const antes = await A.put('/billing/payment-method', { method: 'CARD', cardToken: 'tok_mock_master_0341_1230' });
    // Viaja a partir do fim REAL do período: outro teste deste arquivo já pode ter rodado o ciclo
    // (o job varre todas as empresas) e renovado esta — data fixa tornaria o teste dependente da ordem.
    const fim = new Date(antes.currentPeriodEnd).getTime();
    const { runBillingCycle } = await import('../../src/core/billing/billing.service');
    await runBillingCycle(new Date(fim + DIA));
    let s = await A.get('/billing/subscription');
    assert.equal(s.invoices[0].status, 'FAILED');
    assert.match(s.invoices[0].failureReason, /limite/);
    assert.equal(s.invoices[0].amount, '129.40', 'cobra o plano já alterado');
    assert.equal((await A.raw('GET', '/dashboard')).status, 200, 'dentro da carência segue aberto');

    await runBillingCycle(new Date(fim + 12 * DIA)); // carência de 10 dias vencida
    s = await A.get('/billing/subscription');
    assert.equal(s.status, 'PAST_DUE');
    assert.equal(s.tenant.status, 'SUSPENDED');
    const bloq = await A.raw('GET', '/dashboard');
    assert.equal(bloq.status, 403);
    assert.equal(bloq.body.details.reason, 'TENANT_SUSPENDED');

    s = await A.put('/billing/payment-method', { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' });
    assert.equal(s.invoices[0].status, 'PAID');
    assert.equal(s.status, 'ACTIVE');
    assert.equal(s.tenant.status, 'ACTIVE');
    assert.equal((await A.raw('GET', '/dashboard')).status, 200);
  });

  test('cancelar vale no fim do período e pode ser desfeito antes', async () => {
    const A = api(empresaA.token);
    assert.equal((await A.post('/billing/subscription/cancel')).cancelAtPeriodEnd, true);
    assert.equal((await A.post('/billing/subscription/reactivate')).cancelAtPeriodEnd, false);
    // Usuário sem a permissão não mexe na assinatura (contra-prova do gate).
    const op = await A.post('/users', { name: `Op ${run}`, email: `op-${run.toLowerCase()}@exemplo.com`, password: 'Senha-forte-123' });
    const { prisma } = await import('../../src/infra/prisma');
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: empresaA.tenantId } });
    const lo = await api().post('/auth/login', { tenant: tenant.slug, email: op.email, password: 'Senha-forte-123' });
    assert.equal((await api(lo.accessToken).raw('GET', '/billing/subscription')).status, 403);
    // E o dono entra pelo login antigo (empresa + e-mail + senha da conta) também.
    const dono = await api().post('/auth/login', { tenant: tenant.slug, email, password: 'Senha-forte-123' });
    assert.equal(dono.tenant.id, empresaA.tenantId);
  });
}
