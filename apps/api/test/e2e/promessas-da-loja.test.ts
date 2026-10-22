// test/e2e/promessas-da-loja.test.ts — o que a descrição de cada função promete na loja, provado:
//   • Relatórios da loja: "por forma de pagamento e ticket médio";
//   • Salão do restaurante: "divisão e fechamento de conta";
//   • Relatórios do restaurante: "tempo de cozinha" e "por garçom".
// Cada teste usa empresa própria (criada pela plataforma) para os números não se misturarem.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';

const P = () => ({ 'x-platform-key': process.env.PLATFORM_API_KEY! });
async function empresa(prefixo: string, modulo: string) {
  const slug = `${prefixo}-${run.toLowerCase()}`;
  await api().post('/platform/tenants', { slug, name: `${prefixo} ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: [modulo] }, P());
  const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
  return { slug, A };
}
const periodo = `from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${new Date(Date.now() + 86_400_000).toISOString()}`;

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Relatórios da loja: resumo com ticket médio e vendas por forma de pagamento (pagamento misto conta em cada meio)', async () => {
    const { A } = await empresa('relvar', 'VAREJO');
    const p = await A.post('/products', { name: `Camiseta ${run}`, sku: `CAM-${run}`, salePrice: 30, trackStock: false });
    const caixa = await A.post('/m/varejo/caixa/abrir', { terminal: `CX-${run}`, openingAmount: 50 });
    const vender = (payments: { method: string; amount: number }[]) => A.post('/orders', { channel: 'POS', items: [{ code: p.variants[0].sku, quantity: 1 }], payments, moduleData: { posSessionId: caixa.id } });
    assert.equal((await vender([{ method: 'PIX', amount: 30 }])).status, 'COMPLETED');
    assert.equal((await vender([{ method: 'CASH', amount: 20 }, { method: 'DEBIT', amount: 10 }])).status, 'COMPLETED');

    const r = await A.get(`/m/varejo/relatorios/resumo?${periodo}`);
    assert.deepEqual([r.vendas, Number(r.total), Number(r.ticketMedio), r.pecasPorVenda], [2, 60, 30, '1.0']);
    const pg = await A.get(`/m/varejo/relatorios/pagamentos?${periodo}`);
    assert.deepEqual(pg.map((x: any) => [x.meio, x.vendas, Number(x.total)]).sort(), [['CASH', 1, 20], ['DEBIT', 1, 10], ['PIX', 1, 30]]);
    const csv = await A.raw('GET', `/m/varejo/relatorios/pagamentos?${periodo}&format=csv`);
    assert.match(csv.text, /meio;vendas;total;ticket_medio/);
  });

  test('Restaurante: conta dividida por pessoa (taxa na 1ª parte), relatório por garçom e tempo de cozinha', async () => {
    const { slug, A } = await empresa('relfood', 'FOOD');
    const lanche = await A.post('/products', { name: `Burger ${run}`, sku: `BG-${run}`, salePrice: 30, trackStock: false });
    const menu = await A.post('/m/food/menus', { name: `Menu ${run}`, slug: `menu-${run.toLowerCase()}` });
    const cat = await A.post(`/m/food/menus/${menu.id}/categorias`, { name: 'Lanches' });
    await A.post(`/m/food/menus/${menu.id}/itens`, { categoryId: cat.id, variantId: lanche.variants[0].id, displayName: 'Burger', price: 30, station: 'CHAPA' });

    // O garçom (perfil pronto do Food) lança a rodada.
    const { roles } = await A.get('/roles');
    const garcom = roles.find((r: any) => r.key === 'garcom');
    await A.post('/users', { name: `Garçom Zé ${run}`, email: `ze@${slug}.local`, password: 'Senha-do-garcom-1', roleIds: [garcom.id] });
    const W = api((await api().post('/auth/login', { tenant: slug, email: `ze@${slug}.local`, password: 'Senha-do-garcom-1' })).accessToken);
    // O módulo nasce com as mesas do salão: usa uma delas.
    const mesa = (await A.get('/m/food/mesas')).find((m: any) => m.status === 'FREE');
    assert.ok(mesa, 'mesas semeadas ao ligar o módulo');
    const comanda = await W.post('/m/food/comandas', { code: `M7-${run}`, tableId: mesa.id, guests: 3 });
    const rodada = await W.post('/orders', { channel: 'TABLE', items: [{ variantId: lanche.variants[0].id, quantity: 3 }], moduleData: { tabId: comanda.id, tableId: mesa.id, menuId: menu.id } });
    assert.equal(rodada.total, '90');

    // Cozinha: fila → preparo → pronto; os relógios do ticket ficam em 5 min de fila e 8 de preparo.
    const [ticket] = (await A.get('/m/food/cozinha/fila?station=CHAPA')).filter((t: any) => t.foodOrder.order.number === rodada.number);
    await A.post(`/m/food/cozinha/tickets/${ticket.id}/mover`, { to: 'PREPARING' });
    await A.post(`/m/food/cozinha/tickets/${ticket.id}/mover`, { to: 'READY' });
    const { prisma } = await import('../../src/infra/prisma');
    const t0 = Date.now() - 15 * 60_000;
    await prisma.foodKitchenTicket.update({ where: { id: ticket.id }, data: { createdAt: new Date(t0), startedAt: new Date(t0 + 5 * 60_000), readyAt: new Date(t0 + 13 * 60_000) } });

    // Conta: 90 + 10% = 99, dividida por 3 = 33 cada. A taxa entra já na primeira parte.
    const conta = await A.get(`/m/food/comandas/${comanda.id}/conta`);
    assert.deepEqual([conta.subtotal, conta.taxaServico, conta.total], ['90', '9', '99']);
    const c1 = await A.post(`/m/food/comandas/${comanda.id}/partes`, { payments: [{ method: 'PIX', amount: 33 }] });
    assert.deepEqual([c1.tab.status, c1.taxaMaterializada, c1.pago, c1.restante], ['OPEN', true, '33', '66']);
    assert.equal((await A.raw('POST', `/m/food/comandas/${comanda.id}/partes`, { payments: [{ method: 'PIX', amount: 70 }] })).status, 400, 'parte maior que o que falta');
    const c2 = await A.post(`/m/food/comandas/${comanda.id}/partes`, { payments: [{ method: 'CASH', amount: 33 }] });
    assert.equal(c2.restante, '33');
    assert.equal((await A.raw('POST', `/m/food/comandas/${comanda.id}/fechar`, { payments: [], cobrarTaxa: false })).status, 400, 'taxa já dividida: não some no fechamento');
    assert.equal((await W.raw('POST', `/m/food/comandas/${comanda.id}/partes`, { payments: [{ method: 'PIX', amount: 1 }] })).status, 403, 'garçom não recebe (é do caixa)');
    const fechada = await A.post(`/m/food/comandas/${comanda.id}/fechar`, { payments: [{ method: 'DEBIT', amount: 33 }] });
    assert.deepEqual([fechada.tab.status, fechada.pago, fechada.restante], ['CLOSED', '99', '0']);
    const pagos = fechada.pedidos.flatMap((o: any) => o.payments.map((x: any) => [x.method, Number(x.amount)]));
    assert.deepEqual(['CASH', 'DEBIT', 'PIX'].map((m) => pagos.filter((x: any) => x[0] === m).reduce((s: number, x: any) => s + x[1], 0)), [33, 33, 33]);
    assert.equal((await A.get(`/orders/${rodada.id}`)).status, 'COMPLETED');

    // Por garçom: a rodada do Zé, sem a taxa de serviço (lançada no fechamento).
    const g = await A.get(`/m/food/relatorios/garcons?${periodo}`);
    assert.deepEqual(g.map((x: any) => [x.garcom, x.rodadas, Number(x.itens), Number(x.total)]), [[`Garçom Zé ${run}`, 1, 3, 90]]);
    // Tempo de cozinha da estação.
    const [k] = await A.get(`/m/food/relatorios/cozinha?${periodo}`);
    assert.equal(k.estacao, 'CHAPA'); assert.equal(k.tickets, 1);
    assert.deepEqual([k.espera_min, k.preparo_min, k.total_min].map(Math.round), [5, 8, 13]);
    assert.equal(k.acima_20min, 0);
  });
}
