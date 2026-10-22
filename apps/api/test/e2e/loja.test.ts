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
    assert.deepEqual(cat.modules.map((m: any) => m.key).sort(), ['ACADEMIA', 'BELEZA', 'CLINICA', 'FOOD', 'HOTEL', 'PET', 'SERVICOS', 'VAREJO']);
    assert.ok(cat.features.every((f: any) => Array.isArray(f.permissions) && f.permissions.length), 'a prévia precisa das chaves de cada função');
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

  test('pós-compra: e-mail com dados de acesso (sem senha), link de senha e perfis prontos do módulo', async () => {
    const { outbox } = await import('../../src/infra/mailer');
    const A = api(empresaA.token);
    const { slug } = await A.get('/tenant/settings');
    const mail = [...outbox].reverse().find((m) => m.to === email && /seu sistema está pronto/.test(m.subject));
    assert.ok(mail, 'e-mail de boas-vindas enviado');
    assert.ok(mail!.text.includes(`empresa: ${slug}`) && mail!.text.includes(`e-mail: ${email}`), 'dados de acesso');
    assert.ok(mail!.text.includes('Etiquetas') && mail!.text.includes('Teste grátis até'), 'o que foi contratado');
    assert.ok(mail!.text.includes('Caixa') && mail!.text.includes('Gerente'), 'perfis prontos listados');
    assert.ok(!mail!.text.includes('Senha-forte-123') && !mail!.html!.includes('Senha-forte-123'), 'senha nunca vai no e-mail');
    assert.ok(mail!.html!.includes('Definir minha senha'));

    // A senha da conta já entra no acesso da equipe; o link define uma só do sistema (uso único).
    assert.ok((await api().post('/auth/login', { tenant: slug, email, password: 'Senha-forte-123' })).accessToken);
    const token = mail!.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    // (Define pelo link a mesma senha: os testes seguintes entram com ela.)
    assert.equal((await api().post('/auth/reset', { token, password: 'Senha-forte-123' })).purpose, 'INVITE');
    assert.equal((await api().raw('POST', '/auth/reset', { token, password: 'Outra-senha-1234' })).status, 401, 'link de uso único');
    const dono = await api().post('/auth/login', { tenant: slug, email, password: 'Senha-forte-123' });
    assert.ok(dono.permissions.includes('varejo.etiquetas:print') && !dono.permissions.includes('varejo.grade:manage'), 'admin vê só o comprado');

    // Perfis do modelo: Caixa com PDV; a pessoa convidada como Caixa vende, mas não mexe no financeiro.
    const { roles } = await A.get('/roles');
    const caixa = roles.find((r: any) => r.key === 'caixa');
    assert.ok(caixa.permissions.some((p: any) => p.permissionKey === 'varejo.pdv:operate'));
    for (const k of ['gerente', 'financeiro', 'operador']) assert.ok(roles.some((r: any) => r.key === k), `perfil ${k}`);
    assert.ok(!roles.some((r: any) => r.key === 'garcom'), 'perfil de módulo não comprado não nasce');
    const conv = await A.post('/users/invite', { name: 'Caixa Um', email: `caixa-${run.toLowerCase()}@exemplo.com`, roleIds: [caixa.id] });
    const tk = outbox.at(-1)!.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    await api().post('/auth/reset', { token: tk, password: 'Senha-do-caixa-123' });
    const c = await api().post('/auth/login', { tenant: slug, email: conv.email, password: 'Senha-do-caixa-123' });
    assert.ok(c.permissions.includes('varejo.pdv:operate') && c.permissions.includes('core.orders:create'));
    assert.ok(!c.permissions.includes('core.finance:view') && !c.permissions.includes('varejo.etiquetas:print'));
  });

  test('módulo ligado depois ganha os perfis dele; o Gerente recebe as chaves do módulo novo', async () => {
    const slug = `perfis-${run.toLowerCase()}`;
    await api().post('/platform/tenants', { slug, name: 'Perfis Ltda', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
    const chaves = (rs: any[], k: string) => (rs.find((r) => r.key === k)?.permissions ?? []).map((p: any) => p.permissionKey);
    let { roles } = await A.get('/roles');
    assert.ok(chaves(roles, 'tecnico').includes('svc.os:update'));
    assert.ok(!roles.some((r: any) => r.key === 'governanca'));
    await A.put('/tenant/modules/HOTEL', { enabled: true });
    ({ roles } = await A.get('/roles'));
    assert.ok(chaves(roles, 'governanca').includes('hot.governanca:operate'));
    assert.ok(chaves(roles, 'recepcao').includes('hot.reservas:operate'));
    assert.ok(chaves(roles, 'gerente').includes('hot.quartos:manage') && chaves(roles, 'gerente').includes('svc.os:view'), 'gerente soma os dois módulos');
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
    // Ligar módulo pela tela antiga daria o módulo sem cobrar: recusado (o caminho é a assinatura).
    assert.equal((await A.raw('PUT', '/tenant/modules/FOOD', { enabled: true })).status, 409);
    const add = await A.put('/billing/subscription/features', { modules: ['VAREJO', 'FOOD'], features: ['varejo.grade'] });
    assert.deepEqual(add.modules.sort(), ['FOOD', 'VAREJO']);
    assert.ok((await A.get('/auth/me')).modules.includes('FOOD'));
    const volta = await A.put('/billing/subscription/features', { modules: ['VAREJO'], features: ['varejo.grade'] });
    assert.equal(volta.amount, '129.40');
    assert.deepEqual((await A.get('/auth/me')).modules, ['VAREJO']);
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
    const { outbox } = await import('../../src/infra/mailer');
    const avisos = (re: RegExp) => outbox.filter((m) => m.to === email && m.subject.startsWith(`Loja ${run}:`) && re.test(m.subject));
    await runBillingCycle(new Date(fim + DIA));
    let s = await A.get('/billing/subscription');
    assert.equal(s.invoices[0].status, 'FAILED');
    assert.match(s.invoices[0].failureReason, /limite/);
    assert.equal(s.invoices[0].amount, '129.40', 'cobra o plano já alterado');
    assert.equal((await A.raw('GET', '/dashboard')).status, 200, 'dentro da carência segue aberto');
    // Aviso de recusa na 1ª tentativa: motivo, data da suspensão e o caminho para resolver.
    const [recusa] = avisos(/não conseguimos cobrar/);
    assert.ok(recusa, 'aviso de recusa');
    assert.match(recusa.text, /limite/);
    assert.match(recusa.text, /suspenso/);
    assert.match(recusa.text, /\/minha-conta/);

    // Novas tentativas nos dias seguintes: só a ÚLTIMA vira outro aviso (não um e-mail por dia).
    // (Viajando no tempo, uma passada pode tentar duas vezes — o `updatedAt` é do relógio real —,
    // então o teste segue o número de tentativas, não o dia.)
    for (let d = 2; d <= 6; d++) {
      await runBillingCycle(new Date(fim + d * DIA));
      const tentativas = (await A.get('/billing/subscription')).invoices[0].attempts;
      assert.equal(avisos(/última tentativa/).length, tentativas >= 4 ? 1 : 0, `${tentativas} tentativas`);
      assert.equal(avisos(/não conseguimos cobrar/).length, 1, 'as recusas do meio não avisam');
    }

    await runBillingCycle(new Date(fim + 12 * DIA)); // carência de 10 dias vencida
    s = await A.get('/billing/subscription');
    assert.equal(s.status, 'PAST_DUE');
    assert.equal(s.tenant.status, 'SUSPENDED');
    const bloq = await A.raw('GET', '/dashboard');
    assert.equal(bloq.status, 403);
    assert.equal(bloq.body.details.reason, 'TENANT_SUSPENDED');
    assert.equal(avisos(/acesso suspenso/).length, 1, 'aviso de suspensão');
    assert.match(avisos(/acesso suspenso/)[0].text, /Nenhum dado foi apagado/);
    await runBillingCycle(new Date(fim + 13 * DIA));
    assert.equal(avisos(/acesso suspenso/).length, 1, 'a passada seguinte não repete o aviso');

    s = await A.put('/billing/payment-method', { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' });
    assert.equal(s.invoices[0].status, 'PAID');
    assert.equal(s.status, 'ACTIVE');
    assert.equal(s.tenant.status, 'ACTIVE');
    assert.equal((await A.raw('GET', '/dashboard')).status, 200);
    // Comprovante, dizendo que o acesso voltou; confirmar de novo (o webhook) não manda outro.
    // (O teste anterior já recebeu um comprovante de 129,40, de outra fatura: conta só o da volta.)
    const recibos = () => avisos(/pagamento de R\$\s?129,40 recebido/).filter((m) => /liberado de novo/.test(m.text));
    assert.equal(recibos().length, 1);
    const todos = avisos(/recebido/).length;
    const { markInvoicePaid } = await import('../../src/core/billing/billing.service');
    await markInvoicePaid(s.invoices[0].id);
    assert.equal(avisos(/recebido/).length, todos, 'confirmação repetida não duplica o comprovante');
  });

  test('aviso de fim do teste grátis: 2 dias antes, uma vez, com valor e cartão', async () => {
    const mail = `teste-acabando-${run.toLowerCase()}@exemplo.com`;
    const t = (await api().post('/account/register', { name: 'Dona Fim de Teste', email: mail, password: 'Senha-forte-123' })).token;
    const r = await api(t).post('/account/checkout', { company: { name: `Fim ${run}`, document: cpf(7) }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } });
    assert.equal(r.trial, true);
    const fim = new Date(r.trialEndsAt).getTime();
    const { runBillingCycle } = await import('../../src/core/billing/billing.service');
    const { outbox } = await import('../../src/infra/mailer');
    const avisos = () => outbox.filter((m) => m.to === mail && /teste grátis termina/.test(m.subject));

    await runBillingCycle(new Date(fim - 3 * DIA));
    assert.equal(avisos().length, 0, 'faltando 3 dias ainda não avisa');
    await runBillingCycle(new Date(fim - 2 * DIA + 60_000));
    await runBillingCycle(new Date(fim - DIA));
    assert.equal(avisos().length, 1, 'avisa uma vez só na janela de 2 dias');
    const [a] = avisos();
    assert.match(a.subject, new RegExp(`^Fim ${run}: o teste grátis termina em \\d{2}/\\d{2}/\\d{4}$`));
    assert.match(a.text, /R\$\s?114,50/);
    assert.match(a.text, /final 4242/);
    assert.ok(a.html?.includes('Revisar minha assinatura'));
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
