// test/e2e/financeiro.test.ts — DRE pelo regime de caixa: só o que foi baixado no período, por
// categoria (sem categoria, pela origem); título cancelado e vale-troca ficam de fora.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('DRE: receita por categoria, despesa pela origem, aberto e cancelado fora; PDF sai', async () => {
    // Empresa nova: os totais do DRE são exatamente os lançamentos deste teste.
    const slug = `dre-${run.toLowerCase()}`;
    const r = await api().raw('POST', '/platform/tenants', { slug, name: 'DRE Ltda', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    assert.equal(r.status, 201);
    const l = await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' });
    const A = api(l.accessToken);
    const hoje = new Date().toISOString();

    const consultoria = await A.post('/finance/categories', { name: 'Consultoria', kind: 'RECEIVABLE' });
    const rec = await A.post('/finance/entries', { kind: 'RECEIVABLE', description: 'Projeto', amount: 1000, dueDate: hoje, categoryId: consultoria.id });
    await A.post(`/finance/entries/${rec.id}/settle`, { amount: 600, method: 'PIX' }); // parcial: entra só o recebido
    const desp = await A.post('/finance/entries', { kind: 'PAYABLE', description: 'Aluguel', amount: 250, dueDate: hoje });
    await A.post(`/finance/entries/${desp.id}/settle`, { amount: 250, method: 'PIX' });
    await A.post('/finance/entries', { kind: 'PAYABLE', description: 'Em aberto', amount: 999, dueDate: hoje }); // sem baixa: fora
    const canc = await A.post('/finance/entries', { kind: 'RECEIVABLE', description: 'Cancelado', amount: 50, dueDate: hoje });
    await A.post(`/finance/entries/${canc.id}/cancel`, { reason: 'lançado errado' });

    const ini = new Date(Date.now() - 86_400_000).toISOString(); const fim = new Date(Date.now() + 86_400_000).toISOString();
    const d = await A.get(`/finance/dre?from=${ini}&to=${fim}`);
    assert.deepEqual(d.receitas, [{ grupo: 'Consultoria', total: '600' }]);
    assert.deepEqual(d.despesas, [{ grupo: 'Lançamentos manuais', total: '250' }]);
    assert.equal(d.resultado, '350');

    // Fora do período: nada.
    const antes = await A.get(`/finance/dre?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z`);
    assert.equal(antes.resultado, '0'); assert.equal(antes.receitas.length, 0);

    const pdf = await A.raw('GET', `/finance/dre?from=${ini}&to=${fim}&format=pdf`);
    assert.equal(pdf.status, 200); assert.ok(pdf.text.startsWith('%PDF'));

    // Edição: abaixo do já baixado é recusada; igual ao pago quita (antes ficava PARTIAL).
    assert.equal((await A.raw('PATCH', `/finance/entries/${rec.id}`, { amount: 500 })).status, 400);
    assert.equal((await A.patch(`/finance/entries/${rec.id}`, { amount: 600 })).status, 'PAID');
    assert.equal((await A.raw('PATCH', `/finance/entries/${canc.id}`, { amount: 80 })).status, 409, 'cancelado não se edita');
    assert.equal((await A.raw('POST', `/finance/entries/${canc.id}/cancel`, { reason: 'de novo' })).status, 409);

    // Baixa, edição e cancelamento feitos à mão ficam na auditoria.
    const acoes = (await A.get('/audit?action=finance.')).map((x: any) => x.action);
    for (const a of ['finance.entry.settle', 'finance.entry.update', 'finance.entry.cancel']) assert.ok(acoes.includes(a), `auditoria sem ${a}`);

    // Paginação: com `page` vem { rows, total }; sem, a lista de sempre (seletores dos módulos).
    const p1 = await A.get('/finance/entries?page=1&pageSize=3');
    assert.equal(p1.total, 4); assert.equal(p1.rows.length, 3);
    const p2 = await A.get('/finance/entries?page=2&pageSize=3');
    assert.equal(p2.rows.length, 1); assert.ok(!p1.rows.some((r: any) => r.id === p2.rows[0].id));
    const abertos = await A.get('/finance/entries?abertos=1&page=1');
    assert.equal(abertos.total, 1); assert.equal(abertos.rows[0].description, 'Em aberto');
    assert.equal((await A.get('/finance/entries')).length, 4);
    const cli = await A.get('/customers?page=1&pageSize=1');
    assert.ok(Array.isArray(cli.rows) && typeof cli.total === 'number');
    assert.equal((await A.raw('GET', '/customers?page=1&pageSize=500')).status, 400, 'pageSize tem teto');
  });
}
