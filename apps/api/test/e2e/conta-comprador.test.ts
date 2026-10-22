// test/e2e/conta-comprador.test.ts — a conta de quem comprou: ver plano e faturas de cada empresa,
// reenviar os dados de acesso (com limite) e "esqueci a senha" da conta, que leva junto a senha das
// empresas que ainda usam a da conta (e derruba as sessões delas) sem tocar em senha própria.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 104_729) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('conta do comprador: assinatura e faturas, reenviar acesso e esqueci a senha', async () => {
    const { outbox } = await import('../../src/infra/mailer');
    const email = `comprador-${run.toLowerCase()}@exemplo.com`;
    const ultimo = (re: RegExp) => [...outbox].reverse().find((m) => m.to === email && re.test(m.subject))!;
    const token = (m: { text: string }) => m.text.match(/token=([A-Za-z0-9_-]+)/)![1];

    const acct = (await api().post('/account/register', { name: 'Comprador Teste', email, password: 'Senha-antiga-123' })).token;
    const r = await api(acct).post('/account/checkout', { company: { name: `Mercado ${run}`, document: cpf(7) }, modules: ['VAREJO'], features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } });
    const tenantId = r.session.tenant.id; const slug = r.session.tenant.slug;

    // Plano e faturas: só a conta dona da empresa.
    const a = await api(acct).get(`/account/companies/${tenantId}/assinatura`);
    assert.equal(a.status, 'TRIALING'); assert.equal(a.amount, r.amount);
    assert.ok(a.items.some((i: any) => i.label === 'PDV e caixa')); assert.deepEqual(a.faturas, []);
    assert.equal(a.pagamento.last4, '4242');
    const outra = (await api().post('/account/register', { name: 'Outra', email: `outra-${run.toLowerCase()}@exemplo.com`, password: 'Senha-forte-123' })).token;
    assert.equal((await api(outra).raw('GET', `/account/companies/${tenantId}/assinatura`)).status, 403);
    assert.equal((await api(outra).raw('POST', `/account/companies/${tenantId}/reenviar-acesso`)).status, 403);

    // Reenviar dados de acesso: e-mail novo com link novo; o limite segura o disparo.
    const antes = token(ultimo(/seu sistema está pronto/));
    const re = await api(acct).post(`/account/companies/${tenantId}/reenviar-acesso`);
    assert.equal(re.enviadoPara, email);
    const novoLink = token(ultimo(/seu sistema está pronto/));
    assert.notEqual(novoLink, antes);
    assert.equal((await api().raw('POST', '/auth/reset', { token: antes, password: 'Qualquer-123456' })).status, 401, 'link antigo deixa de valer');
    await api(acct).post(`/account/companies/${tenantId}/reenviar-acesso`);
    await api(acct).post(`/account/companies/${tenantId}/reenviar-acesso`);
    assert.equal((await api(acct).raw('POST', `/account/companies/${tenantId}/reenviar-acesso`)).status, 429);

    // Esqueci a senha da conta: resposta igual para e-mail que não existe.
    const staff = await api().post('/auth/login', { tenant: slug, email, password: 'Senha-antiga-123' });
    assert.deepEqual(await api().post('/account/forgot', { email: `ninguem-${run.toLowerCase()}@exemplo.com` }), { ok: true });
    assert.deepEqual(await api().post('/account/forgot', { email }), { ok: true });
    const m = ultimo(/redefinir a senha da sua conta/);
    assert.ok(m.text.includes('/conta/redefinir-senha?token=') && !m.text.includes('Senha-antiga-123'));
    const t1 = token(m);
    const reset = await api().post('/account/reset', { token: t1, password: 'Senha-nova-456' });
    assert.equal(reset.empresasAtualizadas, 1, 'a empresa que usava a senha da conta acompanha');
    assert.equal((await api().raw('POST', '/account/reset', { token: t1, password: 'Outra-senha-789' })).status, 401, 'uso único');
    assert.equal((await api().raw('POST', '/account/login', { email, password: 'Senha-antiga-123' })).status, 401);
    assert.ok((await api().post('/account/login', { email, password: 'Senha-nova-456' })).token);
    assert.ok((await api().post('/auth/login', { tenant: slug, email, password: 'Senha-nova-456' })).accessToken, 'acesso da equipe com a nova');
    assert.equal((await api().raw('POST', '/auth/refresh', { refreshToken: staff.refreshToken })).status, 401, 'sessões antigas caem');

    // Quem definiu senha própria no sistema continua com ela quando a senha da conta muda.
    const proprio = token(ultimo(/seu sistema está pronto/)); // o link do último reenvio
    await api().post('/auth/reset', { token: proprio, password: 'Senha-do-sistema-999' });
    await api().post('/account/forgot', { email });
    assert.equal((await api().post('/account/reset', { token: token(ultimo(/redefinir a senha da sua conta/)), password: 'Senha-terceira-321' })).empresasAtualizadas, 0);
    assert.ok((await api().post('/auth/login', { tenant: slug, email, password: 'Senha-do-sistema-999' })).accessToken);
  });
}
