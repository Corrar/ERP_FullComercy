// test/e2e/primeiros-passos.test.ts — a entrega a quem comprou: o guia de primeiros passos marca o
// que já foi feito olhando os dados, segue os módulos ligados e é só de quem administra a empresa.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('primeiros passos: roteiro do módulo, marcado pelos dados, dispensável e só do dono', async () => {
    const slug = `passos-${run.toLowerCase()}`;
    await api().post('/platform/tenants', { slug, name: 'Passos Ltda', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['VAREJO'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
    const passo = async (key: string) => (await A.get('/tenant/primeiros-passos')).passos.find((p: any) => p.key === key);

    const r = await A.get('/tenant/primeiros-passos');
    assert.equal(r.dispensado, false);
    const chaves = r.passos.map((p: any) => p.key);
    for (const k of ['varejo.produtos', 'varejo.estoque', 'varejo.caixa', 'varejo.venda', 'equipe', 'marca']) assert.ok(chaves.includes(k), `passo ${k}`);
    assert.ok(!chaves.some((k: string) => k.startsWith('food.')), 'só os módulos ligados');
    assert.ok(r.passos.every((p: any) => p.feito === false), 'empresa nova: nada feito');

    // Feito = olhando os dados, sem marcar à mão.
    const prod = await A.post('/products', { name: `Camiseta ${run}`, sku: `CAM-${run}`, salePrice: 50 });
    assert.equal((await passo('varejo.produtos')).feito, true);
    await A.post('/stock/movements', { variantId: prod.variants[0].id, kind: 'RECEIVE', quantity: 3 });
    assert.equal((await passo('varejo.estoque')).feito, true);
    await A.post('/m/varejo/caixa/abrir', { terminal: `T-${run}`, openingAmount: 0 });
    assert.equal((await passo('varejo.caixa')).feito, true);
    await A.put('/tenant/settings', { marca: { cor: '#0f766e' } });
    assert.equal((await passo('marca')).feito, true);
    assert.equal((await passo('varejo.venda')).feito, false);

    // Dispensar e trazer de volta.
    assert.equal((await A.post('/tenant/primeiros-passos/dispensar', {})).dispensado, true);
    assert.equal((await A.get('/tenant/primeiros-passos')).dispensado, true);
    await A.post('/tenant/primeiros-passos/dispensar', { dispensar: false });
    assert.equal((await A.get('/tenant/primeiros-passos')).dispensado, false);

    // Quem não administra a empresa não vê o guia (o perfil Caixa vende, mas não gere a empresa).
    const { roles } = await A.get('/roles');
    const caixa = roles.find((x: any) => x.key === 'caixa');
    await A.post('/users', { name: `Caixa ${run}`, email: `cx-${run.toLowerCase()}@${slug}.local`, password: 'Senha-do-caixa-123', roleIds: [caixa.id] });
    const C = api((await api().post('/auth/login', { tenant: slug, email: `cx-${run.toLowerCase()}@${slug}.local`, password: 'Senha-do-caixa-123' })).accessToken);
    assert.equal((await C.raw('GET', '/tenant/primeiros-passos')).status, 403);
    assert.equal((await passo('equipe')).feito, true, 'convidou alguém');
  });
}
