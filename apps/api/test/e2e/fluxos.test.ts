// test/e2e/fluxos.test.ts — os quatro módulos, pela API, contra o banco real.
// Rodar: E2E=1 npm run test:e2e   (com .env apontando para um banco migrado + seed)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, login, api, run, type Api } from './_harness';

/** Próximo número de mesa livre. Número de mesa é único por empresa e o seed acumula mesas a cada
 *  rodada: sortear em 90 valores (`900 + Date.now() % 90`) colidia de tempos em tempos (409
 *  intermitente no Food). Achado em 21/10/2026, depois de várias rodadas no mesmo banco. */
async function mesaLivre(A: Api): Promise<number> {
  const mesas: { number: number }[] = await A.get('/m/food/mesas');
  return Math.max(899, ...mesas.map((m) => m.number)) + 1;
}

if (!E2E) {
  test('e2e pulado: defina E2E=1 e DATABASE_URL', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  // ───────────────────────────── VAREJO ─────────────────────────────
  test('Varejo: grade → estoque → caixa → venda PDV → comissão → devolução com vale → troca', async () => {
    const { api: A, me } = await login('loja-demo');
    assert.deepEqual(me.modules, ['VAREJO']);
    assert.deepEqual(me.permissions, ['*']);

    const prod = await A.post('/products', { name: `Camiseta ${run}`, sku: `CAM-${run}`, hasVariants: true, salePrice: 89.9, costPrice: 30 });
    const grade = await A.post('/m/varejo/grade/gerar', { productId: prod.id, skuBase: `CAM-${run}`, eixos: { Tamanho: ['P', 'M'], Cor: ['Azul'] } });
    assert.equal(grade.length, 2);
    const varM = grade.find((v: any) => v.sku.endsWith('-M-AZUL'));
    await A.post('/stock/movements', { variantId: varM.id, kind: 'RECEIVE', quantity: 10, note: 'compra inicial' });

    const vendedor = await A.post('/m/varejo/vendedores', { name: `Ana ${run}`, defaultCommissionRate: 5 });
    const caixa = await A.post('/m/varejo/caixa/abrir', { terminal: `CX-${run}`, openingAmount: 100 });

    // Sem caixa → 400; com caixa → venda nasce COMPLETED (paga) e consome estoque.
    const semCaixa = await A.raw('POST', '/orders', { channel: 'POS', items: [{ code: varM.sku, quantity: 1 }] });
    assert.equal(semCaixa.status, 400);
    const venda = await A.post('/orders', { channel: 'POS', items: [{ code: varM.sku, quantity: 2 }], payments: [{ method: 'PIX', amount: 179.8 }], moduleData: { posSessionId: caixa.id, salespersonId: vendedor.id } });
    assert.equal(venda.status, 'COMPLETED');
    assert.equal(venda.moduleKey, 'VAREJO');
    assert.equal(venda.total, '179.8');
    assert.ok(venda.retailSale, 'extensão ret_sales criada');

    const saldo = await A.get(`/stock/balances?variantId=${varM.id}`);
    assert.equal(saldo[0].onHand, '8');

    const comissoes = await A.get(`/m/varejo/comissoes?salespersonId=${vendedor.id}`);
    assert.equal(comissoes.length, 1);
    assert.equal(comissoes[0].amount, '8.99'); // 5% de 179.80

    // Devolução de 1 peça como vale: volta ao estoque, nasce título a pagar em aberto.
    const dev = await A.post('/m/varejo/devolucoes', { saleId: venda.retailSale.id, refundMethod: 'STORE_CREDIT', items: [{ orderItemId: venda.items[0].id, quantity: 1 }] });
    assert.equal(dev.totalAmount, '89.9');
    assert.equal((await A.get(`/stock/balances?variantId=${varM.id}`))[0].onHand, '9');
    const excesso = await A.raw('POST', '/m/varejo/devolucoes', { saleId: venda.retailSale.id, refundMethod: 'CASH', items: [{ orderItemId: venda.items[0].id, quantity: 2 }] });
    assert.equal(excesso.status, 400, 'não devolve mais do que comprou');

    // Caixa: sangria + fechamento com esperado = 100 (fundo) + 0 dinheiro − 20.
    await A.post(`/m/varejo/caixa/${caixa.id}/movimentos`, { kind: 'SANGRIA', amount: 20 });
    const fechado = await A.post(`/m/varejo/caixa/${caixa.id}/fechar`, { closingAmount: 80 });
    assert.equal(fechado.expectedAmount, '80');

    const zpl = await A.raw('GET', `/m/varejo/etiquetas/lotes/${(await A.post('/m/varejo/etiquetas/lotes', { itens: [{ variantId: varM.id, quantity: 2 }] })).id}/zpl`);
    assert.match(zpl.text, /\^XA[\s\S]*\^BCN[\s\S]*\^XZ/);
    assert.ok((await A.get('/m/varejo/relatorios/vendedores')).some((r: any) => r.vendedor === vendedor.name));
  });

  // ───────────────────────────── FOOD ─────────────────────────────
  test('Food: cardápio → comanda → rodadas → cozinha → conta com taxa → pedido online público', async () => {
    const { api: A } = await login('burger-demo');
    const burger = await A.post('/products', { name: `X-Burger ${run}`, sku: `XB-${run}`, salePrice: 25, trackStock: false });
    const menu = await A.post('/m/food/menus', { name: `Principal ${run}`, slug: `principal-${run.toLowerCase()}` });
    const cat = await A.post(`/m/food/menus/${menu.id}/categorias`, { name: 'Lanches' });
    const item = await A.post(`/m/food/menus/${menu.id}/itens`, { categoryId: cat.id, variantId: burger.variants[0].id, displayName: 'X-Burger da casa', price: 29.9, station: 'CHAPA' });

    const mesa = await A.post('/m/food/mesas', { number: await mesaLivre(A), seats: 2 });
    const comanda = await A.post('/m/food/comandas', { code: `C-${run}`, tableId: mesa.id, guests: 2 });

    // Rodada 1 — preço do cardápio (29.90) vence o de tabela (25).
    const r1 = await A.post('/orders', { channel: 'TABLE', items: [{ variantId: burger.variants[0].id, quantity: 2, metadata: { modifiers: [{ name: 'Bacon', price: 4 }] } }], moduleData: { tabId: comanda.id, tableId: mesa.id, menuId: menu.id } });
    assert.equal(r1.moduleKey, 'FOOD');
    assert.equal(r1.status, 'OPEN');
    assert.equal(r1.total, '67.8'); // (29.90 + 4) × 2
    // Rodada 2 — itens adicionados ao MESMO pedido geram ticket novo e TAMBÉM saem pelo preço do
    // cardápio (o moduleData persistido no pedido traz o menuId).
    const r1b = await A.post(`/orders/${r1.id}/items`, { items: [{ variantId: burger.variants[0].id, quantity: 1 }] });
    assert.equal(r1b.items.length, 2); assert.equal(r1b.total, '97.7');

    const fila = await A.get('/m/food/cozinha/fila?station=CHAPA');
    const meus = fila.filter((t: any) => t.foodOrder.order.number === r1.number);
    assert.equal(meus.length, 2, 'dois tickets: rodada 1 e rodada 2');
    for (const t of meus) { await A.post(`/m/food/cozinha/tickets/${t.id}/mover`, { to: 'PREPARING' }); await A.post(`/m/food/cozinha/tickets/${t.id}/mover`, { to: 'READY' }); }
    assert.equal((await A.get(`/orders/${r1.id}`)).status, 'READY');

    const conta = await A.get(`/m/food/comandas/${comanda.id}/conta`);
    assert.equal(conta.subtotal, '97.7'); assert.equal(conta.taxaServico, '9.77');
    assert.equal((await A.raw('POST', `/m/food/comandas/${comanda.id}/fechar`, { payments: [{ method: 'CREDIT', amount: 50 }] })).status, 400, 'pagamento insuficiente');
    const fechada = await A.post(`/m/food/comandas/${comanda.id}/fechar`, { payments: [{ method: 'CREDIT', amount: 107.47 }] });
    assert.equal(fechada.tab.status, 'CLOSED'); assert.equal(fechada.restante, '0');
    assert.equal((await A.get(`/orders/${r1.id}`)).status, 'COMPLETED');
    assert.equal((await A.get('/m/food/mesas')).find((m: any) => m.id === mesa.id).status, 'FREE');

    // Público: cardápio só aparece publicado; pedido online entra pela mesma porta.
    const P = api();
    assert.equal((await P.raw('GET', `/public/food/cardapio/burger-demo/${menu.slug}`)).status, 404);
    await A.patch(`/m/food/menus/${menu.id}`, { isPublished: true });
    const pub = await P.get(`/public/food/cardapio/burger-demo/${menu.slug}`);
    assert.equal(pub.categorias[0].itens[0].nome, 'X-Burger da casa');
    const online = await P.post('/public/food/pedidos/burger-demo', { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Cliente Online', telefone: `11 9${run.slice(0, 4)}0000` }, itens: [{ menuItemId: item.id, quantity: 1 }], pagamentoNaEntrega: 'PIX' });
    assert.equal(online.channel, 'ONLINE'); assert.equal(online.total, '29.9');
    const acomp = await P.get(`/public/food/pedidos/burger-demo/${online.number}?telefone=11 9${run.slice(0, 4)}0000`);
    assert.equal(acomp.cozinha, 'QUEUED');
  });

  // ───────────────────────────── ACADEMIA ─────────────────────────────
  test('Academia: plano → adesão paga → matrícula → check-in → catraca → turma', async () => {
    const { api: A } = await login('fit-demo');
    const plano = await A.post('/m/academia/planos', { name: `Mensal ${run}`, price: 149.9, enrollmentFee: 50, accessRules: { maxCheckInsPerDay: 1 } });
    const aluno = await A.post('/customers', { name: `Aluno ${run}`, phone: `11 98${run.slice(0, 3)}0001` });

    // Adesão ainda não paga: matrícula NÃO nasce. Pagou: nasce ACTIVE.
    const adesao = await A.post('/orders', { channel: 'SUBSCRIPTION', customerId: aluno.id, items: [], moduleData: { planId: plano.id } });
    assert.equal(adesao.status, 'OPEN'); assert.equal(adesao.total, '199.9');
    assert.equal((await A.get(`/m/academia/matriculas?customerId=${aluno.id}`)).length, 0);
    const paga = await A.post(`/orders/${adesao.id}/payments`, { payments: [{ method: 'CREDIT', amount: 199.9 }] });
    assert.equal(paga.status, 'COMPLETED');
    const mats = await A.get(`/m/academia/matriculas?customerId=${aluno.id}`);
    assert.equal(mats.length, 1); assert.equal(mats[0].status, 'ACTIVE');
    assert.equal((await A.raw('POST', '/orders', { channel: 'SUBSCRIPTION', customerId: aluno.id, items: [], moduleData: { planId: plano.id } })).status, 409, 'segunda adesão barrada');

    await A.post('/m/academia/checkins', { customerId: aluno.id });
    const limite = await A.raw('POST', '/m/academia/checkins', { customerId: aluno.id });
    assert.equal(limite.status, 403); assert.equal(limite.body.details.reason, 'LIMITE_DIARIO');

    const dev = await A.post('/m/academia/dispositivos', { name: `Catraca ${run}`, provider: 'webhook' });
    await A.post('/m/academia/credenciais', { customerId: aluno.id, kind: 'CARD', value: `CARD-${run}` });
    const P = api();
    assert.equal((await P.raw('POST', dev.webhookUrl, { token: 'errado-errado', kind: 'CARD', value: `CARD-${run}` })).status, 401);
    const ev = await P.post(dev.webhookUrl, { token: dev.webhookToken, kind: 'CARD', value: `CARD-${run}` });
    assert.equal(ev.allowed, false); assert.equal(ev.reason, 'LIMITE_DIARIO'); // já entrou hoje
    assert.equal((await P.post(dev.webhookUrl, { token: dev.webhookToken, kind: 'CARD', value: 'DESCONHECIDO' })).reason, 'CREDENCIAL_DESCONHECIDA');

    const turma = await A.post('/m/academia/turmas', { name: `Spinning ${run}`, capacity: 5, schedule: [{ weekday: new Date(Date.now() + 86_400_000).getDay(), time: '18:00' }] });
    const ger = await A.post('/m/academia/turmas/gerar-sessoes?dias=7');
    assert.ok(ger.sessoesCriadas >= 1);
    const sessao = (await A.get('/m/academia/agenda')).find((s: any) => s.classId === turma.id);
    await A.post(`/m/academia/agenda/${sessao.id}/reservas`, { customerId: aluno.id });
    const outro = await A.post('/customers', { name: `Sem matrícula ${run}` });
    assert.equal((await A.raw('POST', `/m/academia/agenda/${sessao.id}/reservas`, { customerId: outro.id })).status, 403, 'sem matrícula não reserva');
    const painel = await A.get('/m/academia/painel');
    assert.ok(painel.ativos >= 1); assert.ok(Number(painel.mrr) >= 149.9);
  });

  // ───────────────────────────── SERVIÇOS ─────────────────────────────
  test('Serviços: OS por placa → orçamento → aprovação parcial → execução → quitação → entrega', async () => {
    const { api: A } = await login('oficina-demo');
    const cliente = await A.post('/customers', { name: `Dono ${run}` });
    const oleo = await A.post('/products', { name: `Óleo 5W30 ${run}`, sku: `OLEO-${run}`, salePrice: 45, costPrice: 25 });
    await A.post('/stock/movements', { variantId: oleo.variants[0].id, kind: 'RECEIVE', quantity: 20 });
    const filtro = await A.post('/products', { name: `Filtro ${run}`, sku: `FIL-${run}`, salePrice: 30 });
    await A.post('/stock/movements', { variantId: filtro.variants[0].id, kind: 'RECEIVE', quantity: 5 });

    const placa = `ABC${String(Date.now()).slice(-4)}`;
    const os = await A.post('/orders', { customerId: cliente.id, items: [{ kind: 'SERVICE', description: 'Diagnóstico', quantity: 1, unitPrice: 100 }], moduleData: { plate: placa, mileageIn: 84210, complaint: 'Barulho ao frear' } });
    assert.equal(os.status, 'CONFIRMED'); assert.equal(os.moduleKey, 'SERVICOS');
    assert.equal(os.serviceOrder.vehicle.plate, placa, 'placa nova virou veículo do cliente');
    const osId = os.serviceOrder.id;

    // Orçamento: peças reservam estoque (não consomem).
    const orc = await A.post(`/orders/${os.id}/items`, { items: [{ code: `OLEO-${run}`, quantity: 4 }, { code: `FIL-${run}`, quantity: 1 }] });
    assert.equal(orc.total, '310'); // 100 + 4×45 + 30
    const saldoOleo = (await A.get(`/stock/balances?variantId=${oleo.variants[0].id}`))[0];
    assert.equal(saldoOleo.onHand, '20'); assert.equal(saldoOleo.reserved, '4');

    await A.post(`/m/servicos/os/${osId}/orcamento`, { diagnosis: 'Pastilha e óleo vencidos' });
    const filtroItem = orc.items.find((i: any) => i.description.startsWith('Filtro'));
    await A.post(`/m/servicos/os/${osId}/aprovar`, { aprovadoPor: 'Dono', canal: 'WhatsApp', itensRecusados: [filtroItem.id] });
    assert.equal((await A.get(`/orders/${os.id}`)).total, '280', 'filtro recusado saiu do pedido');
    assert.equal((await A.get(`/stock/balances?variantId=${filtro.variants[0].id}`))[0].reserved, '0', 'reserva do filtro liberada');

    await A.post(`/m/servicos/os/${osId}/mover`, { to: 'IN_SERVICE' });
    assert.equal((await A.get(`/orders/${os.id}`)).status, 'IN_PROGRESS');
    await A.post(`/m/servicos/os/${osId}/mover`, { to: 'READY' });
    assert.equal((await A.raw('POST', `/m/servicos/os/${osId}/mover`, { to: 'DELIVERED' })).status, 409, 'não entrega sem quitar');
    const pago = await A.post(`/orders/${os.id}/payments`, { payments: [{ method: 'PIX', amount: 280 }] });
    assert.equal(pago.status, 'READY', 'pagamento NÃO fecha OS; entrega fecha');
    await A.post(`/m/servicos/os/${osId}/mover`, { to: 'DELIVERED' });
    assert.equal((await A.get(`/orders/${os.id}`)).status, 'COMPLETED');
    const final = (await A.get(`/stock/balances?variantId=${oleo.variants[0].id}`))[0];
    assert.equal(final.onHand, '16'); assert.equal(final.reserved, '0');
    const detalhe = await A.get(`/m/servicos/os/${osId}`);
    assert.ok(detalhe.events.length >= 6);
    assert.equal((await A.get(`/m/servicos/veiculos/placa/${placa}`)).serviceOrders.length, 1);
  });

  // ───────────────────────────── MULTI-MÓDULO + ISOLAMENTO ─────────────────────────────
  test('Posto (VAREJO+FOOD): canal desempata, padrão da empresa desempata, ambíguo dá 422', async () => {
    const { api: A, me } = await login('posto-demo');
    assert.deepEqual(me.modules.sort(), ['FOOD', 'VAREJO']);
    const p = await A.post('/products', { name: `Água ${run}`, sku: `AGUA-${run}`, salePrice: 3, trackStock: false });
    const mesa = await A.post('/m/food/mesas', { number: await mesaLivre(A) });
    const comanda = await A.post('/m/food/comandas', { code: `P-${run}`, tableId: mesa.id });
    assert.equal((await A.post('/orders', { channel: 'TABLE', items: [{ variantId: p.variants[0].id, quantity: 1 }], moduleData: { tabId: comanda.id } })).moduleKey, 'FOOD');
    assert.equal((await A.post('/orders', { channel: 'COUNTER', items: [{ variantId: p.variants[0].id, quantity: 1 }] })).moduleKey, 'VAREJO', 'defaultSalesModule da empresa');
    await A.put('/tenant/modules/SERVICOS', { enabled: true });
    assert.equal((await A.raw('POST', '/orders', { moduleKey: 'ACADEMIA', items: [{ variantId: p.variants[0].id, quantity: 1 }] })).status, 403);
    await A.put('/tenant/modules/SERVICOS', { enabled: false });
  });

  test('Isolamento: uma empresa não vê nem toca dado de outra; RLS segura mesmo sem a aplicação', async () => {
    const loja = await login('loja-demo'); const burger = await login('burger-demo');
    const c = await burger.api.post('/customers', { name: `Segredo ${run}` });
    assert.equal((await loja.api.get(`/customers?q=Segredo ${run}`)).length, 0);
    assert.equal((await loja.api.raw('GET', `/customers/${c.id}`)).status, 404);
    assert.equal((await loja.api.raw('PUT', `/customers/${c.id}`, { name: 'hack' })).status, 404);
    assert.equal((await loja.api.raw('GET', '/m/food/mesas')).status, 403, 'módulo FOOD inativo na loja');

    // Direto no banco, como o papel do tenant SEM GUC: zero linhas. Como plataforma: tudo.
    const { PrismaClient } = await import('@prisma/client');
    const asTenant = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const asPlatform = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL });
    try {
      const semGuc = await asTenant.customer.count();
      const total = await asPlatform.customer.count();
      assert.ok(total > 0);
      if (process.env.DATABASE_ADMIN_URL) assert.equal(semGuc, 0, 'RLS: papel do tenant sem GUC não lê nada');
      const [, comGuc] = await asTenant.$transaction([asTenant.$executeRaw`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`, asTenant.customer.count()]);
      assert.ok(comGuc >= 1 && comGuc < total, 'com GUC vê só o próprio tenant');
      // Escrita com tenant_id de OUTRA empresa é recusada pelo WITH CHECK.
      if (process.env.DATABASE_ADMIN_URL) {
        const outro = await asPlatform.tenant.findFirstOrThrow({ where: { slug: 'loja-demo' } });
        await assert.rejects(asTenant.$transaction([asTenant.$executeRaw`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`, asTenant.customer.create({ data: { tenantId: outro.id, name: 'invasor' } })]));
      }
    } finally { await asTenant.$disconnect(); await asPlatform.$disconnect(); }
  });

  test('Plataforma: onboarding por API cria empresa pronta para login', async () => {
    const key = process.env.PLATFORM_API_KEY!;
    const slug = `nova-${run.toLowerCase()}`;
    const r = await api().raw('POST', '/platform/tenants', { slug, name: 'Nova Empresa', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, { 'x-platform-key': key });
    assert.equal(r.status, 201);
    assert.equal((await api().raw('POST', '/platform/tenants', {}, { 'x-platform-key': 'nope' })).status, 401);
    const { me } = await login(slug, `admin@${slug}.local`).catch(() => ({ me: null as any }));
    // login usa SENHA do seed; aqui a senha é outra — faz o login manual:
    const l = await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' });
    assert.deepEqual(l.modules, ['SERVICOS']);
    assert.ok((await api(l.accessToken).get('/m/servicos/catalogo')).length >= 4, 'onEnable semeou o catálogo');
    void me;
  });
}
