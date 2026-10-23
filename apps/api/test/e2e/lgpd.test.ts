// test/e2e/lgpd.test.ts — atendimento ao titular (LGPD): exportar tudo o que a empresa guarda do
// cliente e anonimizar quando ele pede, sem perder pedido nem título (obrigação fiscal).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, login, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('LGPD: exporta o titular com os dados do módulo; anonimiza só sem vínculo ativo; pedido fica', async () => {
    const { api: A } = await login('fit-demo');
    const nome = `Titular ${run}`;
    const doc = `${Date.now()}`.slice(-11);
    const email = `titular-${run.toLowerCase()}@exemplo.com`;
    const tel = `11 9${String(Date.now()).slice(-8)}`;
    const cli = await A.post('/customers', { name: nome, document: doc, email, phone: tel, notes: 'Prefere treinar cedo', tags: ['vip'] });
    await A.post(`/customers/${cli.id}/addresses`, { label: 'Casa', street: 'Rua das Flores', number: '42', city: 'São Paulo', state: 'SP', zipCode: '01000-000' });
    const plano = await A.post('/m/academia/planos', { name: `LGPD ${run}`, price: 99.9 });
    const adesao = await A.post('/orders', { channel: 'SUBSCRIPTION', customerId: cli.id, items: [], moduleData: { planId: plano.id } });
    await A.post(`/orders/${adesao.id}/payments`, { payments: [{ method: 'PIX', amount: 99.9 }] });
    await A.post('/m/academia/credenciais', { customerId: cli.id, kind: 'CARD', value: `LGPD-${run}` });
    const dev = await A.post('/m/academia/dispositivos', { name: `Catraca LGPD ${run}`, provider: 'webhook' });
    assert.equal((await api().post(dev.webhookUrl, { token: dev.webhookToken, kind: 'CARD', value: `LGPD-${run}` })).allowed, true);

    // Exportar: cadastro, endereço, pedido e o que o módulo guarda — sem o hash da credencial.
    const ex = await A.get(`/customers/${cli.id}/lgpd/export`);
    assert.equal(ex.titular.nome, nome); assert.equal(ex.titular.email, email); assert.equal(ex.titular.documento, doc);
    assert.equal(ex.enderecos.length, 1); assert.equal(ex.enderecos[0].logradouro, 'Rua das Flores');
    assert.equal(ex.pedidos.length, 1); assert.equal(Number(ex.pedidos[0].total), 99.9);
    assert.equal(ex.pedidos[0].pagamentos[0].meio, 'PIX');
    const gym = ex.modulos.Academias;
    assert.equal(gym.matriculas.length, 1); assert.equal(gym.matriculas[0].plano, `LGPD ${run}`);
    assert.equal(gym.credenciais.length, 1); assert.equal(gym.credenciais[0].tipo, 'CARD');
    assert.equal(gym.acessosNaCatraca.length, 1);
    assert.ok(!JSON.stringify(ex).includes('valueHash') && !JSON.stringify(ex).includes(`LGPD-${run}`), 'credencial sai sem o valor nem o hash');

    // A busca acha a pessoa por nome, documento e telefone (para o "depois" não passar no vazio).
    const buscas = [nome, doc, tel.replace(/\D/g, '')];
    for (const q of buscas) assert.equal((await A.get(`/customers?q=${encodeURIComponent(q)}`)).length, 1, `antes: busca por ${q}`);

    // Matrícula ativa bloqueia; o nome digitado errado também.
    assert.equal((await A.raw('POST', `/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: 'outro nome' })).status, 400);
    const bloqueado = await A.raw('POST', `/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: nome });
    assert.equal(bloqueado.status, 409);
    assert.match(bloqueado.body.error, /matrícula/);
    assert.equal((await A.get(`/customers/${cli.id}`)).email, email, 'recusado: nada mudou');

    const [mat] = await A.get(`/m/academia/matriculas?customerId=${cli.id}`);
    await A.post(`/m/academia/matriculas/${mat.id}/cancelar`, { reason: 'Pedido do titular (LGPD)' });
    assert.deepEqual((await A.get(`/customers/${cli.id}/lgpd/pendencias`)).pendencias, []);
    const r = await A.post(`/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: `  ${nome.toUpperCase()} ` });
    assert.match(r.nome, /^Titular anonimizado /);

    const depois = await A.get(`/customers/${cli.id}`);
    assert.equal(depois.name, r.nome);
    for (const k of ['document', 'email', 'phone', 'birthDate', 'notes'] as const) assert.equal(depois[k], null, `${k} apagado`);
    assert.deepEqual(depois.tags, []); assert.equal(depois.isActive, false);
    assert.equal((depois.addresses ?? []).length, 0, 'endereços apagados');
    const pedido = await A.get(`/orders/${adesao.id}`);
    assert.equal(Number(pedido.total), 99.9, 'pedido e valor ficam (obrigação fiscal)');
    assert.equal(pedido.customer.name, r.nome);
    // A credencial da catraca deixa de abrir a porta e o valor antigo some.
    assert.equal((await api().post(dev.webhookUrl, { token: dev.webhookToken, kind: 'CARD', value: `LGPD-${run}` })).reason, 'CREDENCIAL_DESCONHECIDA');

    // Buscar pelo nome, documento ou telefone antigos não acha mais ninguém.
    for (const q of buscas) assert.equal((await A.get(`/customers?q=${encodeURIComponent(q)}`)).length, 0, `busca por ${q}`);
    const ex2 = await A.get(`/customers/${cli.id}/lgpd/export`);
    const txt = JSON.stringify(ex2);
    for (const pii of [nome, email, doc, 'Rua das Flores', 'Prefere treinar cedo']) assert.ok(!txt.includes(pii), `sobrou "${pii}" depois de anonimizar`);
    assert.equal((await A.raw('POST', `/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: r.nome })).status, 409, 'uma vez só');

    // Auditoria: quem pediu cada coisa — e o rastro não guarda o nome antigo.
    const aud = await A.get(`/audit?action=customer.lgpd.&entityId=${cli.id}`);
    assert.deepEqual(aud.map((x: any) => x.action).sort(), ['customer.lgpd.anonimizado', 'customer.lgpd.exportado', 'customer.lgpd.exportado']);
    assert.ok(aud.every((x: any) => x.userId), 'com o usuário que pediu');
    assert.ok(!JSON.stringify(aud).includes(nome), 'auditoria sem o nome antigo');
  });

  test('LGPD: dado de módulo DESLIGADO também sai (a loja já foi academia)', async () => {
    const { prisma } = await import('../../src/infra/prisma');
    const { api: A } = await login('loja-demo'); // só VAREJO
    const cli = await A.post('/customers', { name: `Ex-aluno ${run}` });
    // Sobra de quando a empresa tinha Academia: a tabela fica mesmo com o módulo desligado.
    const cred = await prisma.gymAccessCredential.create({ data: { tenantId: cli.tenantId, customerId: cli.id, kind: 'CARD', valueHash: `sobra-${run}` } });
    const ex = await A.get(`/customers/${cli.id}/lgpd/export`);
    assert.equal(ex.modulos.Academias?.credenciais.length, 1, 'seção do módulo desligado, porque tem dado');
    assert.equal(ex.modulos['Clínica e consultório'], undefined, 'módulo desligado e vazio não entra');
    await A.post(`/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: cli.name });
    const depois = await prisma.gymAccessCredential.findUniqueOrThrow({ where: { id: cred.id } });
    assert.equal(depois.isActive, false); assert.equal(depois.valueHash, `anon:${cred.id}`);
  });

  test('LGPD: prontuário clínico impede anonimizar (guarda de 20 anos) mas é exportado', async () => {
    const { api: A } = await login('clinica-demo');
    const dra = await A.post('/m/clinica/profissionais', { name: `Dra. LGPD ${run}`, specialty: 'Clínica geral', registry: 'CRM 9', defaultDurationMin: 30, defaultPrice: 200 });
    const pac = await A.post('/customers', { name: `Paciente LGPD ${run}` });
    await A.post(`/m/clinica/pacientes/${pac.id}/prontuario`, { professionalId: dra.id, evolution: 'Paciente estável.' });
    const ex = await A.get(`/customers/${pac.id}/lgpd/export`);
    assert.equal(ex.modulos['Clínica e consultório'].prontuario[0].evolucao, 'Paciente estável.');
    const r = await A.raw('POST', `/customers/${pac.id}/lgpd/anonimizar`, { confirmacao: pac.name });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /13\.787/);
  });

  test('LGPD: só quem tem a permissão própria (nem quem edita cliente)', async () => {
    const { api: A } = await login('fit-demo');
    const perfil = await A.post('/roles', { key: `balcao_lgpd_${run.toLowerCase()}`, name: `Balcão LGPD ${run}` });
    await A.put(`/roles/${perfil.id}/permissions`, { permissions: ['core.customers:view', 'core.customers:manage'] });
    const email = `balcao-lgpd-${run.toLowerCase()}@fit-demo.local`;
    await A.post('/users', { name: `Balcão ${run}`, email, password: 'Senha-do-balcao-123', roleIds: [perfil.id] });
    const l = await api().post('/auth/login', { tenant: 'fit-demo', email, password: 'Senha-do-balcao-123' });
    const B = api(l.accessToken);
    const cli = await A.post('/customers', { name: `Outro titular ${run}` });
    assert.equal((await B.raw('GET', `/customers/${cli.id}`)).status, 200);
    assert.equal((await B.raw('GET', `/customers/${cli.id}/lgpd/export`)).status, 403);
    assert.equal((await B.raw('POST', `/customers/${cli.id}/lgpd/anonimizar`, { confirmacao: cli.name })).status, 403);
  });
}
