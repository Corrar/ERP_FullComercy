// test/e2e/funcoes-prontas.test.ts — contratar uma função no meio do caminho e ela JÁ FUNCIONAR.
// Uma empresa com os 8 módulos, só com o obrigatório; depois cada função opcional do catálogo é
// acrescentada pela tela de Assinatura (PUT /billing/subscription/features), uma de cada vez:
//   • antes: as rotas da função respondem 403 NOT_IN_PLAN (o plano corta até o admin);
//   • depois: as MESMAS rotas passam do corte na hora, sem sair e entrar (sem 403);
//   • o menu do admin (`GET /auth/me` → permissões visíveis) passa a ter as chaves da função;
//   • quem precisa de preparo (cadastrar zona de entrega, chave Pix, catraca…) aparece no guia de
//     primeiros passos do painel — que volta mesmo se o dono o tinha dispensado;
//   • o perfil pronto da equipe que cita a chave (ex.: Recepção com Turmas) ganha a tela sozinho.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { E2E, start, stop, api, run } from './_harness';

/** Funções que funcionam sem preparo nenhum (o resto TEM de ter passo no guia do painel). */
const SEM_PREPARO = new Set([
  'varejo.grade', // os eixos Tamanho e Cor nascem com o módulo
  'varejo.etiquetas', 'varejo.devolucoes', 'varejo.relatorios',
  'food.cozinha', // a estação vem de cada prato do cardápio
  'food.relatorios', 'gym.recepcao', 'gym.turmas', // turmas: já é passo do roteiro da academia
  'svc.veiculos', 'svc.relatorios',
  'bel.comissoes', // o percentual fica no cadastro do profissional (passo obrigatório do salão)
  'bel.relatorios', 'pet.banho', 'pet.relatorios', // banho e tosa: já é passo do roteiro do pet
  'cli.prontuario', 'cli.relatorios', 'hot.governanca', 'hot.relatorios',
]);

function cpf(seed: number) {
  const b = String(100_000_000 + ((Date.now() + seed * 7919) % 899_999_999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) { let s = 0; for (let i = 0; i < len; i++) s += b[i] * (len + 1 - i); b.push(((s * 10) % 11) % 10); }
  return b.join('');
}

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('toda função opcional, contratada depois, já responde (e antes o plano cortava)', async () => {
    const { FEATURES } = await import('../../src/core/billing/catalog');
    const { MOUNTED_ROUTES } = await import('../../src/app');
    const { ModuleKey } = await import('@prisma/client');
    const modulos = Object.values(ModuleKey);

    const t = (await api().post('/account/register', { name: 'Dona Completa', email: `prontas-${run.toLowerCase()}@exemplo.com`, password: 'Senha-forte-123' })).token;
    const r = await api(t).post('/account/checkout', { company: { name: `Tudo ${run}`, document: cpf(31) }, modules: modulos, features: [], payment: { method: 'CARD', cardToken: 'tok_mock_visa_4242_1230' } });
    const A = api(r.session.accessToken);
    const contratadas = async () => new Set<string>((await A.get('/billing/subscription')).items.map((i: any) => i.key));

    /** Uma rota de cada chave (GET sem parâmetro primeiro; parâmetro vira um id qualquer). */
    const rotaDa = (perm: string) => {
      const rs = MOUNTED_ROUTES.filter((x) => x.permission === perm);
      const r0 = rs.find((x) => x.method === 'GET' && !x.path.includes(':')) ?? rs.find((x) => x.method === 'GET') ?? rs[0];
      return r0 ? { method: r0.method, path: r0.path.replace(/:[A-Za-z]+/g, randomUUID()) } : null;
    };
    const status = async (perm: string) => { const x = rotaDa(perm)!; const res = await A.raw(x.method, x.path, x.method === 'GET' ? undefined : {}); return { ...x, status: res.status, code: res.body?.details?.reason ?? res.body?.code }; };

    const opcionais = FEATURES.filter((f) => !f.required);
    await A.post('/tenant/primeiros-passos/dispensar', { dispensar: true }); // o dono dispensou o guia
    let feitas = 0;
    const escolhidas: string[] = [];
    for (const f of opcionais) {
      const antes = await contratadas();
      if (antes.has(f.key)) continue; // já veio como dependência de outra
      const comRota = f.permissions.filter((p) => rotaDa(p));
      for (const p of comRota) {
        const s = await status(p);
        assert.equal(s.status, 403, `${f.key}: ${s.method} ${s.path} deveria estar cortada pelo plano antes de contratar`);
        assert.equal(s.code, 'NOT_IN_PLAN', `${f.key}: ${p}`);
      }
      escolhidas.push(f.key);
      await A.put('/billing/subscription/features', { modules: modulos, features: escolhidas });
      assert.ok((await contratadas()).has(f.key), `${f.key} contratada`);
      for (const p of comRota) {
        const s = await status(p);
        assert.notEqual(s.status, 403, `${f.key}: ${s.method} ${s.path} ainda cortada DEPOIS de contratar (${s.code})`);
        assert.ok(s.status < 500, `${f.key}: ${s.method} ${s.path} → ${s.status}`);
      }
      // O menu do admin já mostra a função (o front relê /auth/me ao salvar o plano).
      const me = await A.get('/auth/me');
      for (const p of f.permissions) assert.ok(me.permissions.includes(p), `${f.key}: ${p} no menu do admin`);
      // E o "como começar" no painel.
      const guia = await A.get('/tenant/primeiros-passos');
      assert.equal(guia.dispensado, false, `${f.key}: função nova traz o guia de volta`);
      if (!SEM_PREPARO.has(f.key)) assert.ok(guia.passos.some((x: any) => f.permissions.includes(x.permissao) && !x.feito), `${f.key}: sem passo pendente no guia do painel`);
      await A.post('/tenant/primeiros-passos/dispensar', { dispensar: true });
      feitas++;
    }
    assert.ok(feitas >= 20, `percorreu ${feitas} funções`);

    // Perfil pronto da equipe: a Recepção da academia cita Turmas; contratada a função, o funcionário vê.
    const { roles: perfis } = await A.get('/roles');
    const recepcao = perfis.find((p: any) => p.key === 'recepcao');
    assert.ok(recepcao, 'perfil Recepção do modelo da academia');
    const email = `recepcao-${run.toLowerCase()}@tudo.local`;
    await A.post('/users', { name: `Recepção ${run}`, email, password: 'Senha-da-recepcao-1', roleIds: [recepcao.id] });
    const slug = (await A.get('/auth/me')).tenant.slug;
    const R = api((await api().post('/auth/login', { tenant: slug, email, password: 'Senha-da-recepcao-1' })).accessToken);
    assert.equal((await R.raw('GET', '/m/academia/turmas')).status, 200, 'perfil da equipe já usa a função contratada');
  });
}
