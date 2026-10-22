// test/e2e/segredos.test.ts — rotação da APP_ENCRYPTION_KEY: os segredos do banco (webhook e
// catraca) vão para a chave nova sem perder o valor; com a chave fora do ambiente, quem depende
// do segredo falha SÓ naquele item (401 na catraca, entrega falha no webhook), sem 500 nem lote
// parado; e volta tudo ao recifrar de novo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { E2E, start, stop, login, api, run } from './_harness';

if (!E2E || !process.env.APP_ENCRYPTION_KEY) {
  test('e2e pulado (sem banco ou sem APP_ENCRYPTION_KEY)', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  const P = { 'x-platform-key': process.env.PLATFORM_API_KEY! };

  test('Segredos: recifra na chave nova, sobrevive à ida e volta; ilegível não derruba ninguém', async () => {
    const { criarCifra, cifra } = await import('../../src/shared/crypto');
    const { recifrarSegredos, statusDosSegredos } = await import('../../src/core/platform/segredos.service');
    const atual = process.env.APP_ENCRYPTION_KEY!;
    const nova = `chave-nova-${run}-0123456789`;

    // Catraca na academia e webhook numa empresa nova (endpoint local que confere a assinatura).
    const { api: G } = await login('fit-demo');
    const dev = await G.post('/m/academia/dispositivos', { name: `Catraca cifra ${run}`, provider: 'webhook' });
    const bater = () => api().raw('POST', dev.webhookUrl, { token: dev.webhookToken, kind: 'CARD', value: `NINGUEM-${run}` });
    assert.equal((await bater()).status, 200);

    const slug = `cifra-${run.toLowerCase()}`;
    await api().post('/platform/tenants', { slug, name: 'Cifra Co', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, P);
    const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
    const recebidos: { sig: string; body: string; orderId: string }[] = [];
    const srv: Server = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { recebidos.push({ sig: String(req.headers['x-fc-signature']), body: b, orderId: JSON.parse(b).data?.orderId }); res.end(); }); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const wh = await A.post('/webhooks', { url: `http://127.0.0.1:${(srv.address() as any).port}/hook`, events: ['order.created'] });
    const cli = await A.post('/customers', { name: `Cifra ${run}` });
    const vender = () => A.post('/orders', { customerId: cli.id, items: [{ kind: 'SERVICE', description: 'Lavagem', quantity: 1, unitPrice: 50 }], moduleData: { plate: `CFR${String(Date.now()).slice(-4)}` } });
    const despachar = async (ok: () => boolean | Promise<boolean>) => { for (let i = 0; i < 25 && !(await ok()); i++) { await new Promise((r) => setTimeout(r, 200)); await A.post('/webhooks/events/dispatch'); } };
    const entregas = async () => { const r = await A.get(`/webhooks/${wh.id}/deliveries`); return (Array.isArray(r) ? r : r.rows) as any[]; };

    try {
      // 1) Na chave do ambiente: a plataforma recifra o que for legado e zera as pendências.
      const r0 = await api().post('/platform/segredos/recifrar', {}, P);
      assert.equal(r0.status.chaveAtual, cifra.kid);
      assert.equal(r0.status.pendentes, 0); assert.equal(r0.status.ilegiveis, 0);
      assert.ok(r0.status.porChave[cifra.kid!] >= 2, 'o webhook e a catraca novos já nascem na chave atual');
      assert.equal((await api().raw('GET', '/platform/segredos')).status, 401, 'só com a chave de plataforma');

      // 2) Rotação: chave nova, a do ambiente vira a anterior. Tudo vai para a nova.
      const rot = criarCifra(nova, atual);
      const r1 = await recifrarSegredos(rot);
      assert.ok(r1.recifrados >= 2); assert.equal(r1.ilegiveis, 0);
      const s1 = await statusDosSegredos(rot);
      assert.equal(s1.pendentes, 0); assert.equal(s1.porChave[cifra.kid!] ?? 0, 0, 'nada ficou na chave antiga');
      assert.equal((await recifrarSegredos(rot)).recifrados, 0, 'segunda passada não regrava nada');
      // A API no ar ainda NÃO tem a chave nova: o status mostra e quem depende do segredo falha sozinho.
      assert.equal((await statusDosSegredos()).ilegiveis, s1.total);
      assert.equal((await bater()).status, 401, 'catraca recusa, sem 500');
      const semSegredo = await vender();
      await despachar(async () => (await entregas()).some((d) => d.status === 'FAILED'));
      const falha = (await entregas()).find((d) => d.status === 'FAILED');
      assert.match(falha?.lastError ?? '', /segredo do webhook ilegível/);
      assert.ok(!recebidos.some((x) => x.orderId === semSegredo.id), 'nada sai assinado com segredo errado');

      // 3) Volta: o mesmo segredo de antes, de novo na chave do ambiente.
      assert.ok((await recifrarSegredos(criarCifra(atual, nova))).recifrados >= 2);
      assert.equal((await statusDosSegredos()).ilegiveis, 0);
      assert.equal((await bater()).status, 200, 'o token da catraca é o mesmo');
      const ped = await vender();
      await despachar(() => recebidos.some((x) => x.orderId === ped.id));
      const ev = recebidos.find((x) => x.orderId === ped.id);
      assert.ok(ev, 'webhook voltou a receber');
      assert.equal(ev!.sig, 'sha256=' + createHmac('sha256', wh.secret).update(ev!.body).digest('hex'), 'assinado com o segredo original');
    } finally {
      // Nunca deixa o banco local numa chave que o .env não abre.
      await recifrarSegredos(criarCifra(atual, nova));
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
}
