// test/e2e/acompanhamento.test.ts — tempo real do acompanhamento público (cliente sem login).
// O token de acompanhamento só abre a sala daquele pedido: não vale como login da API, o token de
// login não abre sala de acompanhamento, e o tenant inteiro não vaza para quem acompanha.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { io as conectar, type Socket } from 'socket.io-client';
import { E2E, SENHA, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  let http: Server; let base = '';
  before(async () => {
    const { buildApp } = await import('../../src/app');
    const { initRealtime } = await import('../../src/infra/realtime');
    http = createServer(buildApp()); initRealtime(http, () => true);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  });
  after(async () => {
    const { prisma } = await import('../../src/infra/prisma');
    await new Promise<void>((r) => http.close(() => r()));
    await prisma.$disconnect();
  });

  const abrir = (auth: Record<string, string>) => new Promise<Socket>((ok, falha) => {
    const s = conectar(base, { path: '/socket.io', auth, transports: ['websocket'], reconnection: false });
    s.once('connect', () => ok(s)); s.once('connect_error', (e) => { s.close(); falha(e); });
  });
  const esperar = (s: Socket, ev: string, ms = 3000) => new Promise<any>((ok, falha) => {
    const t = setTimeout(() => falha(new Error(`sem ${ev}`)), ms); s.once(ev, (p) => { clearTimeout(t); ok(p); });
  });

  test('acompanhamento: sala só do pedido, token separado do login, aviso ao mudar na cozinha', async () => {
    // A API sobe na porta deste arquivo (com o Socket.IO), não na do harness: cliente próprio.
    const req = async (m: string, p: string, b?: unknown, t?: string) => {
      const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) });
      const txt = await r.text(); let body: any = txt; try { body = JSON.parse(txt); } catch { /* texto */ }
      return { status: r.status, body };
    };
    const token = (await req('POST', '/auth/login', { tenant: 'burger-demo', email: 'admin@burger-demo.local', password: SENHA })).body.accessToken as string;
    const prod = (await req('POST', '/products', { name: `Track ${run}`, sku: `TRK-${run}`, salePrice: 20, trackStock: false }, token)).body;
    const menu = (await req('POST', '/m/food/menus', { name: `Track ${run}`, slug: `track-${run.toLowerCase()}` }, token)).body;
    const cat = (await req('POST', `/m/food/menus/${menu.id}/categorias`, { name: 'Lanches' }, token)).body;
    const item = (await req('POST', `/m/food/menus/${menu.id}/itens`, { categoryId: cat.id, variantId: prod.variants[0].id, displayName: 'Track da casa', price: 22, station: 'CHAPA' }, token)).body;
    await req('PATCH', `/m/food/menus/${menu.id}`, { isPublished: true }, token);
    const tel = `11 9${run.slice(0, 4)}7777`;
    const pedido = (await req('POST', '/public/food/pedidos/burger-demo', { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Cliente Track', telefone: tel }, itens: [{ menuItemId: item.id, quantity: 1 }], pagamentoNaEntrega: 'PIX' })).body;
    const acomp = await req('GET', `/public/food/pedidos/burger-demo/${pedido.number}?telefone=${encodeURIComponent(tel)}`);
    assert.equal(acomp.status, 200); const track = acomp.body.trackToken as string; assert.ok(track);

    // Token de acompanhamento NÃO é login; e login não abre sala de acompanhamento.
    assert.equal((await req('GET', '/orders', undefined, track)).status, 401);
    await assert.rejects(abrir({ token: track }), /token inválido/);
    await assert.rejects(abrir({ track: token }), /token inválido/);

    const cliente = await abrir({ track });
    const equipe = await abrir({ token });
    try {
      // Pedido de OUTRO cliente na mesma loja: a equipe vê, quem acompanha não.
      let vazou = false; cliente.on('order.created', () => { vazou = true; }); cliente.on('track.update', (p) => { if (p.orderId !== pedido.id) vazou = true; });
      const outro = esperar(equipe, 'order.created');
      await req('POST', '/public/food/pedidos/burger-demo', { menuSlug: menu.slug, serviceType: 'TAKEOUT', cliente: { nome: 'Outro', telefone: `11 9${run.slice(0, 4)}8888` }, itens: [{ menuItemId: item.id, quantity: 1 }], pagamentoNaEntrega: 'PIX' });
      await outro;

      // A cozinha começa o pedido dele: chega o aviso, só com o id.
      const fila = (await req('GET', '/m/food/cozinha/fila?station=CHAPA', undefined, token)).body;
      const ticket = fila.find((t: any) => t.foodOrder.order.number === pedido.number);
      const aviso = esperar(cliente, 'track.update');
      await req('POST', `/m/food/cozinha/tickets/${ticket.id}/mover`, { to: 'PREPARING' }, token);
      assert.deepEqual(await aviso, { orderId: pedido.id });
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(vazou, false, 'evento do tenant chegou para o cliente');
    } finally { cliente.close(); equipe.close(); }
  });
}
