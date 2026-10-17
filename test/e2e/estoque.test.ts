// test/e2e/estoque.test.ts — inventário físico, devolução ao fornecedor, CSV, pedido online pago.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, login, api, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Inventário físico: abrir → contar (bipando) → aplicar ajusta só a divergência; reserva segura', async () => {
    const { api: A } = await login('oficina-demo');
    const a = await A.post('/products', { name: `Pastilha ${run}`, sku: `PAS-${run}`, barcode: `789${Date.now()}`, salePrice: 90 });
    const b = await A.post('/products', { name: `Vela ${run}`, sku: `VEL-${run}`, salePrice: 25 });
    await A.post('/stock/movements', { variantId: a.variants[0].id, kind: 'RECEIVE', quantity: 10 });
    await A.post('/stock/movements', { variantId: b.variants[0].id, kind: 'RECEIVE', quantity: 10 });
    // Uma OS reserva 4 velas: o inventário não pode deixar o saldo abaixo disso.
    const cli = await A.post('/customers', { name: `Inv ${run}` });
    await A.post('/orders', { customerId: cli.id, items: [{ code: `VEL-${run}`, quantity: 4 }], moduleData: { plate: `INV${String(Date.now()).slice(-4)}` } });

    const count = await A.post('/stock/counts', { notes: `teste ${run}` });
    assert.ok(count._count.items >= 2);
    assert.equal((await A.raw('POST', '/stock/counts', {})).status, 409, 'uma contagem aberta por armazém');
    await A.post(`/stock/counts/${count.id}/items`, { lancamentos: [{ code: a.variants[0].barcode, quantity: 7 }, { code: `VEL-${run}`, quantity: 2 }] });
    const det = await A.get(`/stock/counts/${count.id}`);
    const ia = det.items.find((i: any) => i.variantId === a.variants[0].id);
    assert.equal(ia.snapshotQty, '10'); assert.equal(ia.countedQty, '7'); assert.equal(ia.divergencia, '-3');
    // Vela contada 2 < reservado 4 → aplicar falha e aponta o item.
    const falha = await A.raw('POST', `/stock/counts/${count.id}/apply`, {});
    assert.equal(falha.status, 409); assert.equal(falha.body.details[0].variantId, b.variants[0].id);
    await A.post(`/stock/counts/${count.id}/items`, { lancamentos: [{ code: `VEL-${run}`, quantity: 4 }] });
    const aplicado = await A.post(`/stock/counts/${count.id}/apply`, {});
    assert.equal(aplicado.ajustes, 2);
    assert.equal((await A.get(`/stock/balances?variantId=${a.variants[0].id}`))[0].onHand, '7');
    const vela = (await A.get(`/stock/balances?variantId=${b.variants[0].id}`))[0];
    assert.equal(vela.onHand, '4'); assert.equal(vela.reserved, '4');
    const razao = await A.get(`/stock/ledger?refType=INVENTORY`);
    assert.ok(razao.filter((r: any) => r.refId === count.id).length === 2);
    // CSV em qualquer listagem.
    const csv = await A.raw('GET', `/stock/ledger?refType=INVENTORY&format=csv`);
    assert.equal(csv.status, 200); assert.ok(csv.text.startsWith('id;') && csv.text.includes('\r\n'), 'CSV com cabeçalho e linhas (o BOM é removido pelo fetch)');
  });

  test('Devolução ao fornecedor: abate o título a pagar e devolve estoque', async () => {
    const { api: A } = await login('loja-demo');
    const forn = await A.post('/suppliers', { name: `Dev ${run}` });
    const p = await A.post('/products', { name: `Sapato ${run}`, sku: `SAP-${run}`, salePrice: 300 });
    const po = await A.post('/purchases', { supplierId: forn.id, items: [{ variantId: p.variants[0].id, quantity: 10, unitCost: 100 }] });
    await A.post(`/purchases/${po.id}/ordered`);
    await A.post(`/purchases/${po.id}/receive`);
    assert.equal((await A.get(`/stock/balances?variantId=${p.variants[0].id}`))[0].onHand, '10');
    assert.equal((await A.raw('POST', `/purchases/${po.id}/returns`, { items: [{ variantId: p.variants[0].id, quantity: 11 }] })).status, 400);
    const r = await A.post(`/purchases/${po.id}/returns`, { reason: 'defeito', items: [{ variantId: p.variants[0].id, quantity: 3 }] });
    assert.equal(r.devolucao.totalAmount, '300'); assert.equal(r.abatidoEmTitulos, '300'); assert.equal(r.creditoAReceber, '0');
    assert.equal((await A.get(`/stock/balances?variantId=${p.variants[0].id}`))[0].onHand, '7');
    const titulo = (await A.get('/finance/entries?kind=PAYABLE')).find((e: any) => e.description.startsWith(`Compra #${po.number} `) || e.description === `Compra #${po.number} · ${forn.name}`);
    assert.equal(titulo.status, 'PARTIAL'); assert.equal(titulo.paidAmount, '300');
  });

  test('Pedido online com pagamento no ato: QR volta no pedido e webhook completa', async () => {
    const { api: A } = await login('burger-demo');
    await A.put('/tenant/settings', { extra: { payments: { mock: { webhookToken: `pub-${run}` } } } });
    const prod = await A.post('/products', { name: `Combo ${run}`, sku: `CMB-${run}`, salePrice: 40, trackStock: false });
    const menu = await A.post('/m/food/menus', { name: `Online ${run}`, slug: `online-${run.toLowerCase()}` });
    const item = await A.post(`/m/food/menus/${menu.id}/itens`, { variantId: prod.variants[0].id, displayName: 'Combo', price: 42 });
    await A.patch(`/m/food/menus/${menu.id}`, { isPublished: true });
    const P = api();
    const semProvedor = await P.raw('POST', '/public/food/pedidos/burger-demo', { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Zé', telefone: '11999990000' }, itens: [{ menuItemId: item.id, quantity: 1 }], pagamentoNaEntrega: 'PIX', pagarOnline: { provider: 'manual', method: 'PIX' } });
    assert.equal(semProvedor.status, 400);
    const ped = await P.post('/public/food/pedidos/burger-demo', { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Zé', telefone: '11999990000' }, itens: [{ menuItemId: item.id, quantity: 1 }], pagamentoNaEntrega: 'PIX', pagarOnline: { provider: 'mock', method: 'PIX' } });
    assert.equal(ped.total, '42'); assert.ok(ped.pagamento.qrCode);
    const intent = (await A.get(`/payments/intents?orderId=${ped.id}`))[0];
    await P.post('/public/payments/mock/webhook', { externalId: intent.externalId, status: 'PAID' }, { 'x-mock-token': `pub-${run}` });
    assert.equal((await A.get(`/orders/${ped.id}`)).status, 'COMPLETED');
    const acomp = await P.get(`/public/food/pedidos/burger-demo/${ped.number}?telefone=11999990000`);
    assert.equal(acomp.status, 'COMPLETED');
    assert.equal((await api().raw('GET', '/health/ready')).body.db, 'up');
  });
}
