// demos/seed-food.ts — dados de exemplo da "Hamburgueria Brasa" (FOOD), pela API (o mesmo caminho
// do cliente). Um dia de casa movimentada: cardápio publicado, salão com mesas ocupadas, cozinha
// com fila por estação, entregas em curso e pedidos JÁ CONCLUÍDOS hoje (os relatórios contam
// pedidos COMPLETED por completed_at).
import type { APIRequestContext } from '@playwright/test';
import { API, type Api, type Empresa } from './_gravador';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A API local tem rate limit global (600 req/min por IP) e outras gravações dividem a cota. A
 * semeadura faz ~250 chamadas: em 429, espera a janela andar e repete (só leitura/escrita
 * idempotente no sentido de "não chegou a executar" — 429 é recusado antes da rota).
 */
function paciente(api: Api): Api {
  return async (method, path, data) => {
    for (let i = 0; ; i++) {
      try { return await api(method, path, data); } catch (err) {
        if (i < 30 && /→ 429 /.test(String(err))) { await dormir(4000); continue; }
        throw err;
      }
    }
  };
}

/** Antes de criar a empresa (o gravador não repete em 429): espera a cota do minuto respirar. */
export async function folego(request: APIRequestContext, minimo = 350) {
  // O login tem cota própria (20 por 15 min, dividida com as outras gravações): se esgotou, a
  // resposta 429 diz quando a janela vira. Uma sonda recusada (corpo vazio) gasta no máximo 1.
  for (let i = 0; i < 20; i++) {
    const r = await request.post(`${API}/auth/login`, { data: {} });
    if (r.status() !== 429) break;
    await dormir((Number(r.headers()['ratelimit-reset'] ?? 30) + 1) * 1000);
  }
  for (let i = 0; i < 40; i++) {
    const r = await request.get(`${API}/health/ready`);
    const resta = Number(r.headers()['ratelimit-remaining'] ?? 600);
    if (r.status() !== 429 && resta >= minimo) return;
    await dormir(3000);
  }
}

type Est = 'CHAPA' | 'FRITADEIRA' | 'BAR' | 'COZINHA';
interface ItemCardapio { sku: string; nome: string; preco: number; est: Est; desc?: string }

export const CARDAPIO: { cat: string; itens: ItemCardapio[] }[] = [
  { cat: 'Burgers', itens: [
    { sku: 'BRG-CLA', nome: 'Brasa Clássico', preco: 32.9, est: 'CHAPA', desc: 'Blend 160 g, queijo prato, alface, tomate e molho da casa' },
    { sku: 'BRG-CBA', nome: 'Cheddar Bacon', preco: 38.9, est: 'CHAPA', desc: 'Blend 160 g, cheddar inglês e bacon crocante' },
    { sku: 'BRG-SMA', nome: 'Smash Duplo', preco: 36.9, est: 'CHAPA', desc: 'Dois smash de 90 g, american cheese e cebola na chapa' },
    { sku: 'BRG-COS', nome: 'Brasa Costela', preco: 42.9, est: 'CHAPA', desc: 'Costela desfiada, queijo coalho e barbecue' },
    { sku: 'BRG-VEG', nome: 'Veggie da Horta', preco: 34.9, est: 'CHAPA', desc: 'Grão-de-bico, rúcula e maionese de ervas' },
  ] },
  { cat: 'Porções', itens: [
    { sku: 'POR-BAT', nome: 'Batata Rústica', preco: 22.9, est: 'FRITADEIRA' },
    { sku: 'POR-ONI', nome: 'Onion Rings', preco: 24.9, est: 'FRITADEIRA' },
    { sku: 'POR-MAN', nome: 'Mandioca Frita', preco: 21.9, est: 'FRITADEIRA' },
  ] },
  { cat: 'Bebidas', itens: [
    { sku: 'BEB-CHO', nome: 'Chopp Pilsen 300 ml', preco: 12.9, est: 'BAR' },
    { sku: 'BEB-REF', nome: 'Refrigerante Lata', preco: 7.9, est: 'BAR' },
    { sku: 'BEB-SUC', nome: 'Suco de Laranja', preco: 11.9, est: 'BAR' },
    { sku: 'BEB-MIL', nome: 'Milkshake Ovomaltine', preco: 21.9, est: 'BAR' },
  ] },
  { cat: 'Sobremesas', itens: [
    { sku: 'SOB-BRW', nome: 'Brownie com Sorvete', preco: 19.9, est: 'COZINHA' },
  ] },
];

const CLIENTES = [
  { name: 'Lucas Ferreira', phone: '11 98345-1120' },
  { name: 'Beatriz Almeida', phone: '11 97712-4408' },
  { name: 'Thiago Rocha', phone: '11 99101-3356' },
  { name: 'Camila Duarte', phone: '11 96620-7781' },
  { name: 'Gustavo Nunes', phone: '11 98877-0214' },
  { name: 'Larissa Prado', phone: '11 97433-9902' },
];
const ENDERECOS = [
  { street: 'Rua Harmonia', number: '412', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', zipCode: '05435-000' },
  { street: 'Rua Cardeal Arcoverde', number: '1280', district: 'Pinheiros', city: 'São Paulo', state: 'SP', zipCode: '05407-002' },
  { street: 'Av. Pompeia', number: '955', district: 'Pompeia', city: 'São Paulo', state: 'SP', zipCode: '05023-000' },
  { street: 'Rua Girassol', number: '77', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', zipCode: '05433-000' },
  { street: 'Rua dos Pinheiros', number: '1530', district: 'Pinheiros', city: 'São Paulo', state: 'SP', zipCode: '05422-012' },
  { street: 'Rua Turiassu', number: '390', district: 'Perdizes', city: 'São Paulo', state: 'SP', zipCode: '05005-000' },
];

export interface Food { menu: any; itens: Record<string, any>; mesas: any[]; entregadores: any[]; zonas: any[] }

/** Linha de pedido: [sku, qtd, adicionais?, obs?]. */
type Linha = [string, number, { name: string; price: number }[]?, string?];

export async function semearFood(e: Empresa): Promise<Food> {
  const api = paciente(e.api);
  // ── Cardápio publicado, com adicionais ──
  const menu = await api('POST', '/m/food/menus', { name: 'Cardápio Brasa', slug: 'cardapio-brasa' });
  const itens: Record<string, any> = {};
  for (const [pos, c] of CARDAPIO.entries()) {
    const cat = await api('POST', `/m/food/menus/${menu.id}/categorias`, { name: c.cat, position: pos });
    for (const [ip, i] of c.itens.entries()) {
      const prod = await api('POST', '/products', { name: i.nome, sku: i.sku, salePrice: i.preco, trackStock: false });
      const mi = await api('POST', `/m/food/menus/${menu.id}/itens`, { categoryId: cat.id, variantId: prod.variants[0].id, displayName: i.nome, description: i.desc, price: i.preco, station: i.est, position: ip });
      itens[i.sku] = { ...mi, variantId: prod.variants[0].id };
    }
  }
  const adicionais = await api('POST', '/m/food/adicionais', { name: 'Turbine seu burger', minSelect: 0, maxSelect: 4, modifiers: [{ name: 'Bacon extra', price: 6 }, { name: 'Cheddar extra', price: 5 }, { name: 'Ovo', price: 3 }, { name: 'Blend extra 160 g', price: 12 }] });
  for (const i of CARDAPIO[0].itens) await api('POST', `/m/food/menus/${menu.id}/itens/${itens[i.sku].id}/adicionais`, { groupId: adicionais.id });
  await api('PATCH', `/m/food/menus/${menu.id}`, { isPublished: true });

  // ── Salão: 10 mesas nascem com o módulo; a varanda ganha mais duas ──
  await api('POST', '/m/food/mesas', { number: 11, area: 'Varanda', seats: 4 });
  await api('POST', '/m/food/mesas', { number: 12, area: 'Varanda', seats: 6 });
  const mesas: any[] = await api('GET', '/m/food/mesas');
  const mesa = (n: number) => mesas.find((m) => m.number === n);

  // ── Delivery: zonas por CEP e entregadores ──
  const zonas = [
    await api('POST', '/m/food/zonas', { name: 'Vila Madalena', fee: 6.9, etaMin: 30, rule: { zipPrefixes: ['05433', '05435'] } }),
    await api('POST', '/m/food/zonas', { name: 'Pinheiros', fee: 8.9, etaMin: 35, rule: { zipPrefixes: ['05407', '05422'] } }),
    await api('POST', '/m/food/zonas', { name: 'Pompeia e Perdizes', fee: 10.9, etaMin: 45, rule: { zipPrefixes: ['05023', '05005'] } }),
  ];
  const zonaDo = (cep: string) => zonas.find((z) => z.rule.zipPrefixes.some((p: string) => cep.replace(/\D/g, '').startsWith(p)));
  const entregadores = [
    await api('POST', '/m/food/entregadores', { name: 'Diego Martins', phone: '11 98012-3344', vehicle: 'Moto', plate: 'FHK-2E19' }),
    await api('POST', '/m/food/entregadores', { name: 'Renato Silva', phone: '11 97566-1209', vehicle: 'Moto', plate: 'GBR-7A31' }),
    await api('POST', '/m/food/entregadores', { name: 'Aline Souza', phone: '11 99234-8870', vehicle: 'Bike elétrica' }),
  ];
  const clientes: any[] = [];
  for (const c of CLIENTES) clientes.push(await api('POST', '/customers', c));

  const linhas = (ls: Linha[]) => ls.map(([sku, quantity, modifiers, obs]) => ({ variantId: itens[sku].variantId, quantity, metadata: { ...(modifiers ? { modifiers } : {}), ...(obs ? { obs } : {}) } }));
  const tickets = async (numero: number) => ((await api<any[]>('GET', '/m/food/cozinha/fila')).filter((t) => t.foodOrder.order.number === numero));
  /** A cozinha trabalha o pedido: estações `ate` READY (ou SERVED) — o resto fica como está. */
  const cozinha = async (numero: number, ate: 'PREPARING' | 'READY' | 'SERVED', estacoes?: Est[]) => {
    for (const t of await tickets(numero)) {
      if (estacoes && !estacoes.includes(t.station)) continue;
      const passos = ['PREPARING', 'READY', 'SERVED'];
      for (const to of passos.slice(passos.indexOf(t.status) + 1, passos.indexOf(ate) + 1)) await api('POST', `/m/food/cozinha/tickets/${t.id}/mover`, { to });
    }
  };
  const comanda = async (n: number, guests: number) => api('POST', '/m/food/comandas', { code: String(100 + n), tableId: mesa(n).id, guests });
  const rodada = (tab: any, n: number, ls: Linha[]) => api('POST', '/orders', { channel: 'TABLE', items: linhas(ls), moduleData: { tabId: tab.id, tableId: mesa(n).id, menuId: menu.id } });
  const fechar = async (tab: any, metodos: string[]) => {
    const conta = await api('GET', `/m/food/comandas/${tab.id}/conta`);
    const total = Number(conta.total); const parte = Math.floor((total / metodos.length) * 100) / 100;
    await api('POST', `/m/food/comandas/${tab.id}/fechar`, { payments: metodos.map((method, i) => ({ method, amount: i === metodos.length - 1 ? Number((total - parte * (metodos.length - 1)).toFixed(2)) : parte })) });
  };
  let cli = 0;
  const delivery = async (ls: Linha[], pago?: string) => {
    const k = cli++ % clientes.length; const end = ENDERECOS[k]; const zona = zonaDo(end.zipCode);
    const o = await api('POST', '/orders', {
      channel: 'DELIVERY', customerId: clientes[k].id,
      items: [...linhas(ls), { kind: 'FEE', description: `Taxa de entrega · ${zona.name}`, quantity: 1, unitPrice: Number(zona.fee) }],
      moduleData: { menuId: menu.id, zoneId: zona.id, address: end },
    });
    if (pago) await api('POST', `/orders/${o.id}/payments`, { payments: [{ method: pago, amount: Number(o.total) }] });
    return o;
  };
  const balcao = async (ls: Linha[], method: string) => {
    const o = await api('POST', '/orders', { channel: 'COUNTER', items: linhas(ls), moduleData: { menuId: menu.id } });
    await api('POST', `/orders/${o.id}/payments`, { payments: [{ method, amount: Number(o.total) }] });
    return o;
  };

  // ── O que JÁ aconteceu hoje (concluído: entra nos relatórios) ──
  // Almoço no salão: três mesas que comeram, pagaram (uma dividida em duas) e foram embora.
  for (const [n, guests, ls, pg] of [
    [1, 2, [['BRG-CLA', 1], ['BRG-CBA', 1, [{ name: 'Bacon extra', price: 6 }]], ['POR-BAT', 1], ['BEB-CHO', 2]], ['CREDIT']],
    [3, 4, [['BRG-SMA', 2], ['BRG-COS', 1], ['BRG-CLA', 1], ['POR-ONI', 1], ['POR-BAT', 1], ['BEB-REF', 4]], ['PIX', 'DEBIT']],
    [6, 2, [['BRG-VEG', 1], ['BRG-CBA', 1], ['POR-MAN', 1], ['BEB-SUC', 1], ['BEB-MIL', 1], ['SOB-BRW', 1]], ['CREDIT']],
  ] as [number, number, Linha[], string[]][]) {
    const tab = await comanda(n, guests);
    const o = await rodada(tab, n, ls);
    await cozinha(o.number, 'SERVED');
    await fechar(tab, pg);
  }
  // Balcão (retirada).
  for (const [ls, m] of [
    [[['BRG-SMA', 1], ['POR-BAT', 1], ['BEB-REF', 1]], 'PIX'],
    [[['BRG-CBA', 2], ['BEB-MIL', 2]], 'CREDIT'],
    [[['BRG-CLA', 1], ['BEB-SUC', 1]], 'CASH'],
  ] as [Linha[], string][]) {
    const o = await balcao(ls, m);
    await cozinha(o.number, 'SERVED');
  }
  // Delivery entregue (pago no app): saiu com o entregador e chegou.
  for (const [ls, pg, c] of [
    [[['BRG-COS', 2], ['POR-MAN', 1], ['BEB-REF', 2]], 'PIX', 0],
    [[['BRG-CBA', 1, [{ name: 'Cheddar extra', price: 5 }]], ['POR-ONI', 1]], 'CREDIT', 1],
    [[['BRG-SMA', 2], ['BEB-SUC', 2]], 'PIX', 0],
    [[['BRG-CLA', 1], ['BRG-VEG', 1], ['POR-BAT', 1]], 'CREDIT', 2],
    [[['BRG-CBA', 2], ['POR-BAT', 1], ['BEB-MIL', 1]], 'PIX', 1],
  ] as [Linha[], string, number][]) {
    const o = await delivery(ls, pg);
    await cozinha(o.number, 'SERVED');
    const d = (await api<any[]>('GET', '/m/food/entregas')).find((x) => x.foodOrder.order.number === o.number);
    await api('POST', `/m/food/entregas/${d.id}/atribuir`, { courierId: entregadores[c].id });
    await api('POST', `/m/food/entregas/${d.id}/mover`, { to: 'PICKED_UP' });
    await api('POST', `/m/food/entregas/${d.id}/mover`, { to: 'DELIVERED' });
  }

  // ── O que está ACONTECENDO agora (salão ocupado, cozinha com fila, entregas em curso) ──
  const t4 = await comanda(4, 3); // a mesa do vídeo do salão: já comeu, vai pedir mais uma rodada
  const o4 = await rodada(t4, 4, [['BRG-CLA', 2], ['BRG-COS', 1], ['POR-BAT', 1], ['BEB-CHO', 3]]);
  await cozinha(o4.number, 'SERVED');
  const t2 = await comanda(2, 2);
  const o2 = await rodada(t2, 2, [['BRG-CBA', 2, [{ name: 'Bacon extra', price: 6 }]], ['POR-ONI', 1], ['BEB-CHO', 2]]);
  await cozinha(o2.number, 'SERVED', ['BAR']); // o chopp já foi; os burgers estão na chapa
  await cozinha(o2.number, 'PREPARING', ['CHAPA', 'FRITADEIRA']);
  const t11 = await comanda(11, 4);
  const o11 = await rodada(t11, 11, [['BRG-SMA', 2, [{ name: 'Cheddar extra', price: 5 }]], ['BRG-CLA', 1, undefined, 'ao ponto para mal'], ['BRG-VEG', 1, undefined, 'sem cebola'], ['POR-BAT', 1], ['BEB-REF', 3], ['BEB-SUC', 1]]);
  await cozinha(o11.number, 'SERVED', ['BAR']);
  await cozinha(o11.number, 'PREPARING', ['CHAPA']);
  const t8 = await comanda(8, 2);
  await rodada(t8, 8, [['BEB-CHO', 2], ['POR-MAN', 1]]); // acabou de sentar: chopp e petisco na fila

  // Entregas em curso: uma na rua, uma com entregador indo buscar, duas esperando despacho.
  const naRua = await delivery([['BRG-CBA', 1], ['BEB-REF', 1]], 'PIX');
  await cozinha(naRua.number, 'SERVED');
  const atribuida = await delivery([['BRG-SMA', 1, [{ name: 'Ovo', price: 3 }]], ['POR-BAT', 1]]);
  await cozinha(atribuida.number, 'SERVED');
  for (const [o, c, saiu] of [[naRua, 1, true], [atribuida, 2, false]] as [any, number, boolean][]) {
    const d = (await api<any[]>('GET', '/m/food/entregas')).find((x) => x.foodOrder.order.number === o.number);
    await api('POST', `/m/food/entregas/${d.id}/atribuir`, { courierId: entregadores[c].id });
    if (saiu) await api('POST', `/m/food/entregas/${d.id}/mover`, { to: 'PICKED_UP' });
  }
  const p1 = await delivery([['BRG-COS', 1], ['POR-MAN', 1], ['BEB-SUC', 1]]);
  await cozinha(p1.number, 'READY');
  await delivery([['BRG-VEG', 1, undefined, 'maionese à parte'], ['BEB-MIL', 1]], 'CREDIT');
  return { menu, itens, mesas: await api('GET', '/m/food/mesas'), entregadores, zonas };
}
