// test/e2e/integracao.test.ts — compras, webhooks assinados, pagamento online, ficha técnica, sino.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { E2E, start, stop, login, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Compras: pedido → recebimento parcial → custo médio → contas a pagar → sugestão', async () => {
    const { api: A } = await login('loja-demo');
    const forn = await A.post('/suppliers', { name: `Confecções ${run}`, document: `${Date.now()}`.padStart(14, '1') });
    const prod = await A.post('/products', { name: `Calça ${run}`, sku: `CAL-${run}`, salePrice: 150, costPrice: 40 });
    const v = prod.variants[0];
    await A.post('/stock/movements', { variantId: v.id, kind: 'RECEIVE', quantity: 10 }); // 10 un a 40
    const wh = (await A.get('/stock/warehouses')).find((w: any) => w.isDefault);
    await A.put(`/products/${prod.id}/variants/${v.id}/min-level`, { warehouseId: wh.id, minLevel: 50 });

    const po = await A.post('/purchases', { supplierId: forn.id, freight: 20, items: [{ variantId: v.id, quantity: 10, unitCost: 60 }] });
    assert.equal(po.number >= 1, true); assert.equal(po.total, '620');
    assert.equal((await A.raw('POST', `/purchases/${po.id}/receive`)).status, 409, 'rascunho não recebe');
    await A.post(`/purchases/${po.id}/ordered`);
    const r1 = await A.post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.items[0].id, quantity: 4 }], invoiceNumber: 'NF-1' });
    assert.equal(r1.compra.status, 'PARTIAL'); assert.equal(r1.tituloGerado, '240');
    // custo médio: (10×40 + 4×60) / 14 = 45.71
    assert.equal((await A.get(`/products/${prod.id}`)).costPrice, '45.71');
    const r2 = await A.post(`/purchases/${po.id}/receive`);
    assert.equal(r2.compra.status, 'RECEIVED'); assert.equal(r2.tituloGerado, '380', '6×60 + frete 20');
    assert.equal((await A.get(`/stock/balances?variantId=${v.id}`))[0].onHand, '20');
    const pagar = await A.get('/finance/entries?kind=PAYABLE');
    assert.ok(pagar.filter((e: any) => e.description.includes(`Compra #${po.number}`)).length === 2);
    const sug = await A.get('/purchases/sugestao');
    const linha = sug.find((s: any) => s.variant_id === v.id);
    assert.ok(linha && linha.ultimo_fornecedor === forn.name && Number(linha.ultimo_custo) === 60);
    assert.ok((await A.get('/stock/low')).some((l: any) => l.variant_id === v.id));
  });

  test('Webhooks: evento durável → entrega assinada num endpoint local → retry/backoff', async () => {
    // Empresa NOVA por rodada: webhooks de rodadas anteriores (porta morta) não contaminam o despacho.
    const slug = `hook-${run.toLowerCase()}`;
    await api().post('/platform/tenants', { slug, name: 'Hook Co', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    const l = await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' });
    const A = api(l.accessToken);
    const recebidos: { headers: any; body: any }[] = [];
    let falhar = false;
    const srv: Server = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { recebidos.push({ headers: req.headers, body: JSON.parse(b) }); res.statusCode = falhar ? 500 : 200; res.end(); }); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(srv.address() as any).port}/hook`;
    try {
      const wh = await A.post('/webhooks', { url, events: ['order.created', 'os.status'] });
      assert.ok(wh.secret.length > 20);
      const cli = await A.post('/customers', { name: `Hook ${run}` });
      const os = await A.post('/orders', { customerId: cli.id, items: [{ kind: 'SERVICE', description: 'Lavagem', quantity: 1, unitPrice: 50 }], moduleData: { plate: `HOK${String(Date.now()).slice(-4)}` } });
      // O outbox grava via setImmediate: sob carga o evento chega depois de um tempo fixo qualquer
      // (300 ms falhava às vezes). Despacha até a entrega aparecer, com teto.
      const achar = () => recebidos.find((r) => r.body.type === 'order.created' && r.body.data.orderId === os.id);
      let enviados = 0;
      for (let i = 0; i < 25 && !achar(); i++) { await new Promise((r) => setTimeout(r, 200)); enviados += (await A.post('/webhooks/events/dispatch')).enviados; }
      assert.ok(enviados >= 1);
      const ev = achar();
      assert.ok(ev, 'webhook recebeu order.created');
      const esperado = 'sha256=' + createHmac('sha256', wh.secret).update(JSON.stringify(ev!.body)).digest('hex');
      assert.equal(ev!.headers['x-fc-signature'], esperado, 'assinatura HMAC confere');
      assert.equal(ev!.headers['x-fc-event'], 'order.created');

      // Endpoint fora do ar: evento fica PENDING com backoff; volta → retry entrega.
      falhar = true;
      await A.post(`/m/servicos/os/${os.serviceOrder.id}/mover`, { to: 'DIAGNOSING' });
      let comFalha = 0;
      for (let i = 0; i < 25 && !comFalha; i++) { await new Promise((r) => setTimeout(r, 200)); comFalha = (await A.post('/webhooks/events/dispatch')).comFalha; }
      assert.ok(comFalha >= 1);
      const pend = (await A.get('/webhooks/events/list?status=PENDING')).find((e: any) => e.eventType === 'os.status');
      assert.ok(pend && pend.attempts === 1 && new Date(pend.nextAttemptAt) > new Date());
      falhar = false;
      await A.post(`/webhooks/events/${pend.id}/retry`);
      const d3 = await A.post('/webhooks/events/dispatch');
      assert.ok(d3.enviados >= 1);
      const entregas = await A.get(`/webhooks/${wh.id}/deliveries`);
      assert.ok(entregas.some((d: any) => d.status === 'FAILED') && entregas.some((d: any) => d.status === 'SENT' && d.event.eventType === 'os.status'));
    } finally { srv.close(); }
  });

  test('Pagamento online: intenção mock → webhook do provedor → pedido completo → notificação', async () => {
    const { api: A } = await login('loja-demo');
    await A.put('/tenant/settings', { extra: { payments: { mock: { webhookToken: `tok-${run}` } } } });
    const prod = await A.post('/products', { name: `Bolsa ${run}`, sku: `BOL-${run}`, salePrice: 200, trackStock: false });
    const pedido = await A.post('/orders', { channel: 'COUNTER', items: [{ variantId: prod.variants[0].id, quantity: 1 }] });
    assert.equal(pedido.status, 'OPEN');
    assert.ok((await A.get('/payments/providers')).some((p: any) => p.key === 'mock'));
    const intent = await A.post('/payments/intents', { provider: 'mock', method: 'PIX', orderId: pedido.id });
    assert.equal(intent.status, 'PENDING'); assert.ok(intent.qrCode && intent.externalId);
    const P = api();
    assert.equal((await P.raw('POST', '/public/payments/mock/webhook', { externalId: intent.externalId, status: 'PAID' }, { 'x-mock-token': 'errado' })).status, 401);
    const ok = await P.post('/public/payments/mock/webhook', { externalId: intent.externalId, status: 'PAID' }, { 'x-mock-token': `tok-${run}` });
    assert.equal(ok.status, 'PAID');
    const final = await A.get(`/orders/${pedido.id}`);
    assert.equal(final.status, 'COMPLETED'); assert.equal(final.payments[0].method, 'PIX');
    // Reentrega do mesmo webhook é idempotente.
    assert.equal((await P.post('/public/payments/mock/webhook', { externalId: intent.externalId, status: 'PAID' }, { 'x-mock-token': `tok-${run}` })).status, 'PAID');
    assert.equal((await A.get(`/orders/${pedido.id}`)).payments.length, 1);
    await new Promise((r) => setTimeout(r, 200));
    const sino = await A.get('/notifications?unread=1');
    assert.ok(sino.some((n: any) => n.kind === 'payment.paid'));
    const lidas = await A.post('/notifications/read', { ids: 'all' });
    assert.ok(lidas.lidas >= 1);
    assert.equal((await A.get('/notifications/unread-count')).count, 0);
  });

  test('Ficha técnica: prato pronto baixa insumos; CMV calculado', async () => {
    const { api: A } = await login('burger-demo');
    const pao = await A.post('/products', { name: `Pão ${run}`, sku: `PAO-${run}`, unit: 'UN', costPrice: 1.5, salePrice: 0 });
    const carne = await A.post('/products', { name: `Carne ${run}`, sku: `CAR-${run}`, unit: 'KG', costPrice: 40, salePrice: 0 });
    await A.post('/stock/movements', { variantId: pao.variants[0].id, kind: 'RECEIVE', quantity: 50 });
    await A.post('/stock/movements', { variantId: carne.variants[0].id, kind: 'RECEIVE', quantity: 5 });
    const burger = await A.post('/products', { name: `Smash ${run}`, sku: `SMA-${run}`, salePrice: 30, trackStock: false });
    const menu = await A.post('/m/food/menus', { name: `Ficha ${run}`, slug: `ficha-${run.toLowerCase()}` });
    const item = await A.post(`/m/food/menus/${menu.id}/itens`, { variantId: burger.variants[0].id, displayName: 'Smash', price: 32, station: 'CHAPA' });
    await A.put(`/m/food/menus/${menu.id}/itens/${item.id}/ficha`, { insumos: [{ ingredientVariantId: pao.variants[0].id, quantity: 1 }, { ingredientVariantId: carne.variants[0].id, quantity: 0.15 }] });
    const ficha = await A.get(`/m/food/menus/${menu.id}/itens/${item.id}/ficha`);
    assert.equal(ficha.cmv.custo, '7.5'); // 1×1.5 + 0.15×40
    assert.equal(ficha.cmv.margem, '76.56');

    const pedido = await A.post('/orders', { channel: 'COUNTER', items: [{ variantId: burger.variants[0].id, quantity: 2 }], moduleData: { serviceType: 'TAKEOUT', menuId: menu.id } });
    const t = (await A.get('/m/food/cozinha/fila?station=CHAPA')).find((x: any) => x.foodOrder.order.number === pedido.number);
    await A.post(`/m/food/cozinha/tickets/${t.id}/mover`, { to: 'PREPARING' });
    await A.post(`/m/food/cozinha/tickets/${t.id}/mover`, { to: 'READY' });
    assert.equal((await A.get(`/stock/balances?variantId=${pao.variants[0].id}`))[0].onHand, '48');
    assert.equal((await A.get(`/stock/balances?variantId=${carne.variants[0].id}`))[0].onHand, '4.7');
    const razao = await A.get(`/stock/ledger?refType=RECIPE&variantId=${carne.variants[0].id}`);
    assert.equal(razao.length, 1);
  });
}
