// demos/nucleo.demo.ts — roteiros das funções do NÚCLEO (servem a qualquer comércio), gravados na
// empresa de Varejo. Os dados extras daqui (perfis, equipe, grade, 2º depósito, compras, contas,
// endereço) nascem pela API antes de qualquer gravação, uma vez por empresa.
import { API, empresa, expect, test, type Empresa } from './_gravador';
import { semearVarejo } from './seeds';

type Req = Parameters<typeof empresa>[0];
const SENHA_EQUIPE = 'Equipe-bella-2026';
const prontas = new Map<string, Promise<void>>();
test.describe.configure({ timeout: 600_000 }); // a espera por folga na API pode passar dos 3 min do padrão

/** Empresa de Varejo + os extras do núcleo. Os extras rodam uma vez por empresa mesmo quando outro
 *  roteiro criou a empresa antes (o mapa de empresas é por processo e o primeiro `semear` vence). */
async function loja(request: Req): Promise<Empresa> {
  await folego(request);
  const e = await empresa(request, 'VAREJO', async (x) => { await semearVarejo(x); await extras(x); });
  await extras(e);
  await folego(request, 150);
  return e;
}
/** A API limita 600 req/min por IP e os roteiros de todos os comércios gravam em paralelo contra a
 *  mesma API: antes de semear ou abrir a tela, espera a janela ter folga (senão a tela fica em
 *  "Carregando…" por um 429 no meio do vídeo). */
async function folego(request: Req, minimo = 250) {
  for (let i = 0; i < 40; i++) {
    const r = await request.get(`${API}/health/ready`);
    const resta = Number(r.headers()['ratelimit-remaining'] ?? 600);
    if (r.ok() && resta >= minimo) return;
    await new Promise((ok) => setTimeout(ok, Math.min(60, Math.max(3, Number(r.headers()['ratelimit-reset'] ?? 5))) * 1000));
  }
  throw new Error('API sem folga no limite de requisições por 40 tentativas.');
}
function extras(e: Empresa): Promise<void> {
  if (!prontas.has(e.slug)) prontas.set(e.slug, semearNucleo(e));
  return prontas.get(e.slug)!;
}

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

async function semearNucleo(e: Empresa) {
  const { api } = e;

  // ── Perfis e equipe ────────────────────────────────────────────────────────────────────
  const { roles } = await api<{ roles: any[] }>('GET', '/roles');
  const role = (k: string) => roles.find((r) => r.key === k)!;
  await api('PUT', `/roles/${role('gerente').id}/permissions`, { permissions: ['core.customers:view', 'core.customers:manage', 'core.products:view', 'core.products:manage', 'core.stock:view', 'core.stock:move', 'core.orders:view', 'core.orders:create', 'core.orders:cancel', 'core.purchases:view', 'core.purchases:manage', 'core.suppliers:manage', 'core.finance:view', 'core.users:view'] });
  await api('PUT', `/roles/${role('caixa').id}/permissions`, { permissions: ['core.customers:view', 'core.customers:manage', 'core.products:view', 'core.stock:view', 'core.orders:view', 'core.orders:create'] });
  await api('PUT', `/roles/${role('financeiro').id}/permissions`, { permissions: ['core.finance:view', 'core.finance:manage', 'core.orders:view', 'core.purchases:view', 'core.customers:view'] });
  await api('PUT', `/roles/${role('operador').id}/permissions`, { permissions: ['core.products:view', 'core.stock:view', 'core.stock:move', 'core.purchases:view'] });
  const equipe: [string, string, string][] = [['Ana Paula Ribeiro', 'ana.paula', 'caixa'], ['Bruno Lima', 'bruno.lima', 'gerente'], ['Cláudia Ferreira', 'claudia', 'financeiro'], ['Diego Santos', 'diego', 'operador']];
  for (const [name, u, k] of equipe) {
    const email = `${u}@${e.slug}.local`;
    // Sem login da equipe aqui: o limite de login (20 a cada 15 min por IP) é dividido com os outros roteiros.
    await api('POST', '/users', { name, email, password: SENHA_EQUIPE, roleIds: [role(k).id] });
  }

  // ── Endereços dos clientes ─────────────────────────────────────────────────────────────
  const clientes = await api<any[]>('GET', '/customers');
  const cli = (n: string) => clientes.find((c) => c.name === n)!;
  await api('POST', `/customers/${cli('Juliana Martins').id}/addresses`, { label: 'Casa', street: 'Rua Harmonia', number: '412', complement: 'apto 52', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', zipCode: '05435-000', isDefault: true });
  await api('PUT', `/customers/${cli('Juliana Martins').id}`, { document: '318.442.906-17', notes: 'Prefere avisos por WhatsApp. Veste M.' });

  // ── Grade e segundo depósito ───────────────────────────────────────────────────────────
  const whs = await api<any[]>('GET', '/stock/warehouses');
  const principal = whs.find((w) => w.isDefault)!;
  const shopping = await api('POST', '/stock/warehouses', { code: 'SHOPPING', name: 'Loja Shopping Center Norte' });
  const polo = await api('POST', '/products', { name: 'Camisa Polo Piquet', sku: 'POL-PIQ', salePrice: 129.9, costPrice: 48, trackStock: true, hasVariants: true, description: 'Polo em malha piquet 100% algodão, gola e punho em ribana.' });
  const grade: [string, string, string, number, number][] = [
    ['POL-PIQ-P-AZ', 'P / Azul-marinho', '7891000100110', 14, 4], ['POL-PIQ-M-AZ', 'M / Azul-marinho', '7891000100127', 22, 6],
    ['POL-PIQ-G-AZ', 'G / Azul-marinho', '7891000100134', 9, 3], ['POL-PIQ-GG-AZ', 'GG / Azul-marinho', '7891000100141', 4, 0],
  ];
  for (const [sku, name, barcode, qtd, leva] of grade) {
    const v = await api('POST', `/products/${polo.id}/variants`, { sku, name, barcode });
    await api('POST', '/stock/movements', { variantId: v.id, kind: 'RECEIVE', quantity: qtd, note: 'estoque inicial' });
    if (leva) await api('POST', '/stock/transfers', { variantId: v.id, fromWarehouseId: principal.id, toWarehouseId: shopping.id, quantity: leva, note: 'abastecer a loja do shopping' });
    if (sku === 'POL-PIQ-GG-AZ') await api('PUT', `/products/${polo.id}/variants/${v.id}/min-level`, { warehouseId: principal.id, minLevel: 6 });
  }
  // Outros itens com mínimo e um pouco de estoque no shopping.
  const produtos = await api<any[]>('GET', '/products');
  const variante = (sku: string) => produtos.flatMap((p) => p.variants).find((v: any) => v.sku === sku)!;
  for (const [sku, min] of [['BER-MOL', 5], ['JAQ-CVT', 6], ['TEN-CAS', 4], ['CAM-BAS', 10]] as const) {
    await api('PUT', `/products/${produtos.find((p) => p.variants.some((v: any) => v.sku === sku)).id}/variants/${variante(sku).id}/min-level`, { warehouseId: principal.id, minLevel: min });
  }
  for (const [sku, q] of [['CAM-BAS', 8], ['BON-ABA', 6], ['CAL-SLM', 3]] as const) {
    await api('POST', '/stock/transfers', { variantId: variante(sku).id, fromWarehouseId: principal.id, toWarehouseId: shopping.id, quantity: q, note: 'abastecer a loja do shopping' });
  }

  // ── Fornecedores e compras ─────────────────────────────────────────────────────────────
  const textil = await api('POST', '/suppliers', { name: 'Têxtil Nordeste Ltda', document: '12.345.678/0001-90', phone: '81 3344-2100', email: 'vendas@textilnordeste.com.br' });
  const franca = await api('POST', '/suppliers', { name: 'Calçados Franca Distribuidora', document: '23.456.789/0001-01', phone: '16 3722-8800', email: 'pedidos@calcadosfranca.com.br' });
  await api('POST', '/suppliers', { name: 'Acessórios Bom Retiro', document: '34.567.890/0001-12', phone: '11 3331-4567', email: 'contato@acessoriosbr.com.br' });
  const po1 = await api('POST', '/purchases', { supplierId: textil.id, freight: 35, expectedAt: daqui(-6), items: [{ variantId: variante('CAM-BAS').id, quantity: 30, unitCost: 21.5 }, { variantId: variante('MEI-3PR').id, quantity: 40, unitCost: 11.8 }] });
  await api('POST', `/purchases/${po1.id}/ordered`);
  await api('POST', `/purchases/${po1.id}/receive`, { invoiceNumber: '48213', dueDate: daqui(24) });
  const po2 = await api('POST', '/purchases', { supplierId: franca.id, freight: 60, expectedAt: daqui(2), items: [{ variantId: variante('TEN-CAS').id, quantity: 12, unitCost: 104 }] });
  await api('POST', `/purchases/${po2.id}/ordered`);
  const po3 = await api('POST', '/purchases', { supplierId: textil.id, freight: 40, expectedAt: daqui(1), notes: 'Reposição da coleção de primavera.', items: [{ variantId: variante('POL-PIQ-GG-AZ').id, quantity: 12, unitCost: 46.5 }, { variantId: variante('POL-PIQ-G-AZ').id, quantity: 10, unitCost: 46.5 }, { variantId: variante('BER-MOL').id, quantity: 15, unitCost: 36 }] });
  await api('POST', `/purchases/${po3.id}/ordered`);
  await api('POST', '/purchases', { supplierId: textil.id, expectedAt: daqui(9), items: [{ variantId: variante('JAQ-CVT').id, quantity: 8, unitCost: 92 }] });

  // ── Contas a pagar e a receber ─────────────────────────────────────────────────────────
  for (const [description, amount, dias] of [['Aluguel da loja — outubro', 3200, 3], ['Energia elétrica — Enel', 486.3, 6], ['Internet fibra 500 Mb', 129.9, 9], ['Contador — honorários', 650, 12], ['Folha de pagamento — vendedoras', 4380, 14]] as const) {
    await api('POST', '/finance/entries', { kind: 'PAYABLE', description, amount, dueDate: daqui(dias) });
  }
  const crediario: [string, number, number][] = [['Fernanda Lima', 189.9, 4], ['Carlos Eduardo Souza', 229.9, 8], ['Patrícia Gomes', 149.8, 15]];
  for (const [nome, amount, dias] of crediario) {
    await api('POST', '/finance/entries', { kind: 'RECEIVABLE', description: `Crediário — ${nome.split(' ')[0]} (parcela 2/3)`, amount, dueDate: daqui(dias), customerId: cli(nome).id });
  }
  const pago = await api('POST', '/finance/entries', { kind: 'PAYABLE', description: 'Sacolas personalizadas', amount: 380, dueDate: daqui(-2) });
  await api('POST', `/finance/entries/${pago.id}/settle`, { amount: 380, method: 'PIX' });
}

// ─────────────────────────────────────────────────────────────────────────────────────────

test('core.base', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.base', e, '/');
  const p = g.page;
  await expect(p.getByRole('heading', { name: 'Hoje' })).toBeVisible();
  await expect(p.locator('.kpi', { hasText: 'Vendas concluídas' })).toContainText('8');
  await expect(p.getByText('Itens mais vendidos')).toBeVisible();
  await g.inicio();
  await g.pausa(1300);
  g.capa();
  await g.clicar(p.locator('a.sb-item[href="/usuarios"]'));
  await expect(p.getByRole('cell', { name: 'Cláudia Ferreira' })).toBeVisible();
  await g.pausa(1200);
  await g.clicar(p.locator('a.sb-item[href="/perfis"]'));
  await expect(p.getByRole('heading', { name: 'Perfis e permissões' })).toBeVisible();
  await g.pausa(700);
  await g.clicar(p.locator('.card', { hasText: 'Caixa' }).getByRole('button', { name: 'Editar' }));
  await expect(p.getByRole('dialog', { name: /Permissões de Caixa/ })).toBeVisible();
  await expect(p.getByRole('dialog').getByRole('checkbox', { name: /Criar pedidos\/vendas/ })).toBeChecked();
  await g.pausa(1500);
});

test('core.clientes', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.clientes', e, '/clientes');
  const p = g.page;
  await expect(p.getByRole('cell', { name: 'Juliana Martins' })).toBeVisible();
  await g.inicio();
  await g.pausa(900);
  await g.digitar(p.getByPlaceholder('nome, telefone, documento'), 'Juli');
  await expect(p.locator('tbody tr')).toHaveCount(1);
  await g.pausa(500);
  await g.clicar(p.getByRole('cell', { name: 'Juliana Martins' }));
  await expect(p.locator('.kpi', { hasText: 'Total gasto' })).toContainText('R$');
  await expect(p.getByText('Rua Harmonia')).toBeVisible();
  await g.pausa(800);
  g.capa();
  await g.passar(p.getByText('Rua Harmonia'));
  await g.pausa(1600);
});

test('core.produtos', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.produtos', e, '/produtos');
  const p = g.page;
  await expect(p.getByRole('cell', { name: 'Camisa Polo Piquet' })).toBeVisible();
  await g.inicio();
  await g.pausa(800);
  await g.clicar(p.getByRole('cell', { name: 'Camisa Polo Piquet' }));
  const linhaG = p.locator('tr', { hasText: 'POL-PIQ-G-AZ' });
  await expect(linhaG).toContainText('SHOPPING: 3');
  await g.pausa(1100);
  g.capa();
  await g.clicar(linhaG.getByRole('button', { name: 'Mínimo' }));
  const dlg = p.getByRole('dialog', { name: /Estoque mínimo/ });
  await g.digitar(dlg.locator('input[name="minLevel"]'), '8');
  await g.clicar(dlg.getByRole('button', { name: 'Salvar' }));
  await expect(linhaG).toContainText('(mín 8)');
  await g.pausa(700);
  await g.clicar(p.locator('a.sb-item[href="/estoque"]'));
  await g.clicar(p.getByRole('tab', { name: 'Abaixo do mínimo' }));
  await expect(p.getByRole('cell', { name: 'POL-PIQ-G-AZ' })).toBeVisible();
  await g.pausa(1400);
});

test('core.pedidos', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.pedidos', e, '/pedidos');
  const p = g.page;
  const linha = p.locator('tbody tr', { hasText: 'Fernanda Lima' }).first();
  await expect(linha).toBeVisible();
  await g.inicio();
  await g.pausa(1000);
  g.capa();
  await g.clicar(linha);
  await expect(p.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
  await g.pausa(900);
  await g.clicar(p.getByRole('button', { name: 'Cancelar' }));
  const dlg = p.getByRole('dialog', { name: 'Cancelar pedido' });
  await g.digitar(dlg.locator('input[name="reason"]'), 'Cliente desistiu da compra');
  await g.clicar(dlg.getByRole('button', { name: 'Cancelar pedido' }));
  await expect(p.getByRole('heading', { name: /Pedido #\d+/ }).locator('.badge')).toHaveText(/cancel/i);
  await g.pausa(1400);
});

test('core.compras', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.compras', e, '/compras');
  const p = g.page;
  const linha = p.locator('tbody tr', { hasText: 'Têxtil Nordeste' }).filter({ hasText: /Enviad|Pedid|Ordered/i }).first();
  await expect(linha).toBeVisible();
  await g.inicio();
  await g.pausa(1000);
  g.capa();
  await g.clicar(linha.locator('td').first());
  await expect(p.getByRole('heading', { name: /Compra #\d+/ })).toBeVisible();
  await g.pausa(800);
  await g.clicar(p.getByRole('button', { name: 'Receber' }));
  const dlg = p.getByRole('dialog', { name: 'Receber mercadoria' });
  await g.digitar(dlg.locator('input[name="invoiceNumber"]'), '51877');
  await g.clicar(dlg.getByRole('button', { name: 'Confirmar recebimento' }));
  await expect(p.getByText(/NF 51877/)).toBeVisible();
  await expect(p.getByRole('heading', { name: /Compra #\d+/ }).locator('.badge')).toHaveText('Recebido');
  await g.pausa(1000);
  // O recebimento vira conta a pagar no financeiro (título com o nº da NF).
  await g.clicar(p.locator('a.sb-item[href="/financeiro"]'));
  await g.clicar(p.getByRole('tab', { name: 'A pagar' }));
  const titulo = p.locator('tbody tr', { hasText: 'NF 51877' });
  await expect(titulo).toContainText('PURCHASE');
  await g.passar(titulo);
  await g.pausa(1300);
});

test('core.financeiro', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.financeiro', e, '/financeiro');
  const p = g.page;
  await expect(p.getByRole('cell', { name: /Crediário — Fernanda/ })).toBeVisible();
  await g.inicio();
  await g.pausa(1000);
  await g.clicar(p.getByRole('tab', { name: 'A pagar' }));
  const aluguel = p.locator('tbody tr', { hasText: 'Aluguel da loja' });
  await expect(aluguel).toBeVisible();
  await g.pausa(800);
  g.capa();
  await g.clicar(aluguel.getByRole('button', { name: 'Baixar' }));
  const dlg = p.getByRole('dialog', { name: /Baixar: Aluguel/ });
  await g.clicar(dlg.getByRole('button', { name: 'Baixar' }));
  await expect(aluguel.getByRole('button', { name: 'Baixar' })).toHaveCount(0);
  await g.pausa(1500);
});

test('core.integracoes', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('core.integracoes', e, '/integracoes');
  const p = g.page;
  await expect(p.getByRole('button', { name: 'Novo webhook' })).toBeVisible();
  await g.inicio();
  await g.pausa(500);
  await g.clicar(p.getByRole('button', { name: 'Novo webhook' }));
  const dlg = p.getByRole('dialog', { name: 'Novo webhook' });
  await g.digitar(dlg.locator('input[name="url"]'), 'https://hooks.minhaloja.com.br/erp');
  for (const ev of ['order.created', 'order.paid', 'stock.low']) await g.clicar(dlg.getByRole('checkbox', { name: ev, exact: true }));
  await g.clicar(dlg.getByRole('button', { name: 'Salvar' }));
  await expect(p.getByText(/Segredo do HMAC/)).toBeVisible();
  await expect(p.getByRole('cell', { name: 'https://hooks.minhaloja.com.br/erp' })).toBeVisible();
  await g.pausa(900);
  g.capa();
  await g.clicar(p.getByRole('tab', { name: 'Eventos' }));
  await expect(p.getByRole('cell', { name: 'order.created' }).first()).toBeVisible();
  await g.pausa(1400);
});
