// test/e2e/conta.test.ts — esqueci a senha, convite, dashboard, etiqueta em PDF.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, login, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Esqueci a senha: e-mail (console) com token de uso único; sessões antigas morrem', async () => {
    const { outbox } = await import('../../src/infra/mailer');
    const { api: A } = await login('loja-demo');
    const conv = await A.post('/users', { name: `Vendedora ${run}`, email: `v-${run.toLowerCase()}@loja-demo.local`, password: 'Senha-antiga-123' });
    const antes = outbox.length;
    assert.equal((await api().raw('POST', '/auth/forgot', { tenant: 'loja-demo', email: 'nao-existe@loja-demo.local' })).status, 204, 'não revela se existe');
    assert.equal(outbox.length, antes, 'e-mail inexistente não gera envio');
    await api().post('/auth/forgot', { tenant: 'loja-demo', email: conv.email });
    const mail = outbox.at(-1)!;
    assert.equal(mail.to, conv.email);
    const token = mail.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    assert.equal((await api().raw('POST', '/auth/reset', { token: 'x'.repeat(30), password: 'Nova-senha-123' })).status, 401);
    const r = await api().post('/auth/reset', { token, password: 'Nova-senha-123' });
    assert.equal(r.purpose, 'RESET');
    assert.equal((await api().raw('POST', '/auth/reset', { token, password: 'Outra-123456' })).status, 401, 'token de uso único');
    assert.equal((await api().raw('POST', '/auth/login', { tenant: 'loja-demo', email: conv.email, password: 'Senha-antiga-123' })).status, 401);
    const l = await api().post('/auth/login', { tenant: 'loja-demo', email: conv.email, password: 'Nova-senha-123' });
    assert.ok(l.accessToken);
  });

  test('Convite: usuário nasce sem senha utilizável e define a dele pelo link (72 h)', async () => {
    const { outbox } = await import('../../src/infra/mailer');
    const { api: A } = await login('fit-demo');
    // Os perfis do modelo já nascem com permissões; aqui vale um perfil novo, vazio.
    const operador = await A.post('/roles', { key: `vazio_${run.toLowerCase()}`, name: `Sem acesso ${run}` });
    // Marca da empresa no e-mail: cor e logo validados na rota (http é recusado).
    assert.equal((await A.raw('PUT', '/tenant/settings', { marca: { logoUrl: 'http://inseguro.local/l.png' } })).status, 400);
    await A.put('/tenant/settings', { marca: { cor: '#0f766e', logoUrl: 'https://cdn.exemplo.com/fit.png' } });
    const u = await A.post('/users/invite', { name: `Recepção <b>${run}</b>`, email: `rec-${run.toLowerCase()}@fit-demo.local`, roleIds: [operador.id] });
    const mail = outbox.at(-1)!;
    assert.match(mail.subject, /convite para a equipe/);
    assert.ok(mail.html?.includes('background:#0f766e') && mail.html.includes('src="https://cdn.exemplo.com/fit.png"'), 'cor e logo da empresa');
    assert.ok(mail.html!.includes('Recepção &lt;b&gt;') && !mail.html!.includes('<b>'), 'nome escapado no HTML');
    const token = mail.text.match(/token=([A-Za-z0-9_-]+)/)![1];
    const r = await api().post('/auth/reset', { token, password: 'Minha-senha-123' });
    assert.equal(r.purpose, 'INVITE'); assert.equal(r.userId, u.id);
    const l = await api().post('/auth/login', { tenant: 'fit-demo', email: u.email, password: 'Minha-senha-123' });
    assert.deepEqual(l.permissions, [], 'perfil vazio: sem permissões');
    assert.equal((await api(l.accessToken).raw('GET', '/m/academia/planos')).status, 403);
    assert.equal((await api(l.accessToken).raw('GET', '/notifications')).status, 200, 'sino é de qualquer logado');
  });

  test('Dashboard: KPIs do core + só dos módulos ativos', async () => {
    const { api: A } = await login('posto-demo');
    const d = await A.get('/dashboard');
    assert.ok('faturamento' in d.hoje && 'aReceber' in d.financeiro);
    assert.deepEqual(Object.keys(d.modulos).sort(), ['FOOD', 'VAREJO']);
    assert.ok('mesasOcupadas' in d.modulos.FOOD && 'caixasAbertos' in d.modulos.VAREJO);
  });

  test('Etiquetas em PDF com código de barras', async () => {
    const { api: A } = await login('loja-demo');
    const p = await A.post('/products', { name: `Meia ${run}`, sku: `MEI-${run}`, barcode: `790${Date.now()}`, salePrice: 19.9 });
    const lote = await A.post('/m/varejo/etiquetas/lotes', { itens: [{ variantId: p.variants[0].id, quantity: 3 }] });
    const r = await fetch(`${(await import('./_harness')).base()}/m/varejo/etiquetas/lotes/${lote.id}/pdf`, { headers: { authorization: `Bearer ${(await login('loja-demo')).token}` } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 2000);
  });
}
