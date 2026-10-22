// test/e2e/mercadopago.test.ts — "Cobrança online … com baixa automática no pedido", provado contra
// um Mercado Pago FALSO (servidor local no lugar de api.mercadopago.com):
//   • conectar confere o token LÁ (token recusado não grava) e guarda selado; nada disso vai à tela;
//   • "Cobrar por Pix" sem dizer provedor usa a conta conectada; o Pix vem do Mercado Pago;
//   • o aviso só baixa depois de RELER o pagamento na API deles: assinatura errada, pagamento ainda
//     pendente ou aviso de outra cobrança não mexem em nada; aprovado → pedido pago, uma vez só;
//   • cardápio online: "pagar agora" usa o meio da empresa; loja sem meio nenhum recusa ANTES de
//     criar o pedido (antes ficava um pedido órfão).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { E2E, start, stop, api, run } from './_harness';

const TOKEN = `APP_USR-${'1'.repeat(16)}-${run.toLowerCase()}-abcdef`;
const SEGREDO = `segredo-aviso-${run}`;

interface PagamentoFalso { id: number; status: string; status_detail: string; external_reference: string; transaction_amount: number; payer: any; idempotencia: string; date_approved?: string }
const pagamentos = new Map<number, PagamentoFalso>();
/** Respostas trocadas de propósito (id → id que a API "devolve"), para o aviso de outra cobrança. */
const trocado = new Map<number, number>();
let falso: Server;
let proximo = Number(String(Date.now()).slice(-10)); // não repete entre rodadas no mesmo banco

function servidorFalso() {
  return createServer((req, res) => {
    let corpo = ''; req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const responder = (status: number, b: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { message: 'invalid access token' });
      if (req.method === 'GET' && req.url === '/users/me') return responder(200, { id: 777, nickname: `LOJA${run}`, email: `financeiro@loja-${run.toLowerCase()}.com.br` });
      if (req.method === 'POST' && req.url === '/v1/payments') {
        const b = JSON.parse(corpo);
        const id = proximo++;
        pagamentos.set(id, { id, status: 'pending', status_detail: 'pending_waiting_transfer', external_reference: b.external_reference, transaction_amount: b.transaction_amount, payer: b.payer, idempotencia: String(req.headers['x-idempotency-key']) });
        return responder(201, { id, status: 'pending', date_of_expiration: b.date_of_expiration, point_of_interaction: { transaction_data: { qr_code: `00020101021226MP${id}5303986`, ticket_url: `https://mp.local/${id}` } } });
      }
      const m = req.method === 'GET' && req.url?.match(/^\/v1\/payments\/(\d+)$/);
      if (m) {
        const p = pagamentos.get(Number(m[1]));
        if (!p) return responder(404, { message: 'Payment not found' });
        return responder(200, { ...p, id: trocado.get(p.id) ?? p.id });
      }
      responder(404, { message: 'rota falsa inexistente' });
    });
  });
}

const P = () => ({ 'x-platform-key': process.env.PLATFORM_API_KEY! });
async function empresa(prefixo: string, modulo: string) {
  const slug = `${prefixo}-${run.toLowerCase()}`;
  await api().post('/platform/tenants', { slug, name: `${prefixo} ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: [modulo] }, P());
  const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
  return { slug, A };
}
/** O aviso como o Mercado Pago manda: só o id, assinado com o segredo da empresa. */
function aviso(dataId: number, segredo = SEGREDO) {
  const ts = String(Math.floor(Date.now() / 1000)); const requestId = `req-${dataId}-${ts}`;
  const v1 = createHmac('sha256', segredo).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return api().raw('POST', '/public/payments/mercadopago/webhook', { action: 'payment.updated', type: 'payment', data: { id: String(dataId) } }, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId });
}

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => {
    falso = servidorFalso();
    await new Promise<void>((r) => falso.listen(0, '127.0.0.1', () => r()));
    process.env.MERCADOPAGO_API_URL = `http://127.0.0.1:${(falso.address() as { port: number }).port}`;
    await start();
  });
  after(async () => { await stop(); falso.close(); });

  test('Mercado Pago: conectar, cobrar o pedido por Pix e a baixa chegar sozinha pelo aviso', async () => {
    const { A } = await empresa('mpago', 'SERVICOS');
    // Token que o Mercado Pago recusa não grava nada.
    const ruim = await A.raw('PUT', '/payments/config/mercadopago', { accessToken: `APP_USR-${'9'.repeat(30)}` });
    assert.equal(ruim.status, 400); assert.match(ruim.body.error, /recusou o Access Token/);
    assert.equal((await A.get('/payments/config/mercadopago')).conectado, false);
    assert.equal((await A.raw('PUT', '/payments/config/mercadopago', { accessToken: 'qualquer-coisa' })).status, 400, 'formato de token');

    const con = await A.put('/payments/config/mercadopago', { accessToken: TOKEN, webhookSecret: SEGREDO });
    assert.deepEqual([con.conectado, con.conta.apelido, con.conta.teste], [true, `LOJA${run}`, false]);
    const cfg = await A.get('/payments/config/mercadopago');
    assert.deepEqual([cfg.conectado, cfg.assinaturaDoAviso, cfg.emUso], [true, true, 'mercadopago']);
    // O token não volta por nenhum caminho da tela; no banco, só selado.
    for (const r of [cfg, await A.get('/tenant/settings'), await A.get('/auth/me')]) assert.ok(!JSON.stringify(r).includes(TOKEN) && !JSON.stringify(r).includes('accessToken'), 'credencial vazou');
    const { prisma } = await import('../../src/infra/prisma');
    const { seal } = await import('../../src/shared/crypto');
    const guardado = await prisma.tenant.findFirstOrThrow({ where: { slug: `mpago-${run.toLowerCase()}` }, select: { settings: true } });
    const mp = (guardado.settings as any).payments.mercadopago;
    assert.ok(!JSON.stringify(mp).includes(TOKEN) || seal('x').startsWith('plain:'), 'token em claro com chave de cifra configurada');
    // Pela rota livre de settings não se mexe nas credenciais.
    await A.put('/tenant/settings', { extra: { payments: { mercadopago: { accessToken: 'plain:forjado' } } } });
    assert.equal((await A.get('/payments/config/mercadopago')).conectado, true);
    assert.equal((await prisma.tenant.findFirstOrThrow({ where: { slug: `mpago-${run.toLowerCase()}` }, select: { settings: true } }) as any).settings.payments.mercadopago.accessToken, mp.accessToken);

    // Cobrar por Pix sem dizer o provedor: vai pela conta conectada.
    const cli = await A.post('/customers', { name: `Cliente MP ${run}`, email: `cliente-${run.toLowerCase()}@exemplo.com`, document: '52998224725' });
    const pedido = await A.post('/orders', { customerId: cli.id, items: [{ kind: 'SERVICE', description: `Alinhamento ${run}`, quantity: 1, unitPrice: 120 }], moduleData: { plate: `MPG${String(Date.now()).slice(-4)}` } });
    const it = await A.post('/payments/intents', { method: 'PIX', orderId: pedido.id });
    assert.equal(it.provider, 'mercadopago'); assert.match(it.qrCode, /^00020101021226MP/); assert.ok(it.qrSvg?.startsWith('<svg'));
    const noMp = pagamentos.get(Number(it.externalId))!;
    assert.deepEqual([noMp.transaction_amount, noMp.external_reference, noMp.idempotencia, noMp.payer.email, noMp.payer.identification?.number], [120, it.id, it.id, `cliente-${run.toLowerCase()}@exemplo.com`, '52998224725']);

    // Avisos que NÃO baixam: sem assinatura, assinatura com outro segredo, pagamento ainda pendente.
    assert.equal((await api().raw('POST', '/public/payments/mercadopago/webhook', { data: { id: it.externalId } })).status, 401);
    assert.equal((await aviso(noMp.id, 'segredo-de-outro')).status, 401);
    assert.equal((await aviso(noMp.id)).body.status, 'PENDING');
    const semBaixa = async () => assert.equal((await A.get(`/orders/${pedido.id}`)).payments.length, 0, 'nenhum pagamento entrou');
    await semBaixa();
    // Aviso de pagamento que, relido, é OUTRO: recusa.
    trocado.set(noMp.id, noMp.id + 1);
    noMp.status = 'approved'; noMp.date_approved = new Date().toISOString();
    assert.equal((await aviso(noMp.id)).status, 401);
    await semBaixa();
    trocado.delete(noMp.id);

    // Pago no banco do cliente → o aviso chega → o pedido é baixado. Repetir o aviso não paga de novo.
    assert.equal((await aviso(noMp.id)).body.status, 'PAID');
    assert.equal((await aviso(noMp.id)).body.status, 'PAID');
    const pago = await A.get(`/orders/${pedido.id}`);
    assert.deepEqual(pago.payments.map((x: any) => [x.method, Number(x.amount), x.reference]), [['PIX', 120, `mercadopago:${noMp.id}`]]);
    assert.equal((await A.get(`/payments/intents/${it.id}`)).status, 'PAID');

    // Desconectar: sem chave Pix, não há mais como cobrar Pix online.
    assert.equal((await A.del('/payments/config/mercadopago')).conectado, false);
    const outro = await A.post('/orders', { customerId: cli.id, items: [{ kind: 'SERVICE', description: 'Balanceamento', quantity: 1, unitPrice: 60 }], moduleData: { plate: `MPH${String(Date.now()).slice(-4)}` } });
    const sem = await A.raw('POST', '/payments/intents', { method: 'PIX', orderId: outro.id });
    assert.equal(sem.status, 400); assert.match(sem.body.error, /conecte o Mercado Pago/);
  });

  test('Cardápio online: "pagar agora" pelo meio da empresa; loja sem meio recusa sem criar pedido', async () => {
    const { slug, A } = await empresa('mpfood', 'FOOD');
    const menu = await A.post('/m/food/menus', { name: 'Online', slug: `online-${run.toLowerCase()}` });
    const cat = await A.post(`/m/food/menus/${menu.id}/categorias`, { name: 'Lanches' });
    const item = await A.post(`/m/food/menus/${menu.id}/itens`, { categoryId: cat.id, displayName: 'X-Salada', price: 25 });
    await A.patch(`/m/food/menus/${menu.id}`, { isPublished: true });
    const pedir = (pagarOnline: unknown) => api().raw('POST', `/public/food/pedidos/${slug}`, { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Ana', telefone: '11988887777' }, itens: [{ menuItemId: item.id, quantity: 2 }], pagamentoNaEntrega: 'PIX', pagarOnline });

    assert.equal((await api().get(`/public/food/cardapio/${slug}/${menu.slug}`)).pagamentoOnline, false);
    const pedidos = async () => (await A.get('/orders')).total as number;
    const antes = await pedidos();
    assert.equal(typeof antes, 'number');
    const recusado = await pedir({ method: 'PIX' });
    assert.equal(recusado.status, 400);
    assert.equal(await pedidos(), antes, 'recusou sem deixar pedido órfão');
    assert.equal((await pedir({ provider: 'manual', method: 'PIX' })).status, 400, 'provedor que a loja não configurou');

    await A.put('/payments/config/mercadopago', { accessToken: TOKEN });
    assert.equal((await api().get(`/public/food/cardapio/${slug}/${menu.slug}`)).pagamentoOnline, true);
    const ok = await pedir({ method: 'PIX' });
    assert.equal(ok.status, 201); assert.equal(await pedidos(), antes + 1); assert.equal(ok.body.total, '50'); assert.match(ok.body.pagamento.qrCode, /^00020101021226MP/);
    const it = (await A.get(`/payments/intents?orderId=${ok.body.id}`))[0];
    assert.equal(it.provider, 'mercadopago');
    // Sem segredo de aviso cadastrado, vale a releitura na API: aprovado lá → pedido pago.
    const noMp = pagamentos.get(Number(it.externalId))!;
    noMp.status = 'approved'; noMp.date_approved = new Date().toISOString();
    const r = await api().raw('POST', '/public/payments/mercadopago/webhook', { data: { id: noMp.id } });
    assert.equal(r.body.status, 'PAID');
    assert.equal((await api().get(`/public/food/pedidos/${slug}/${ok.body.number}?telefone=11988887777`)).status, 'COMPLETED');
  });
}
