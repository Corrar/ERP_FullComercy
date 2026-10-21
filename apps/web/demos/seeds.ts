// demos/seeds.ts — dados de exemplo das empresas de gravação, pela API (o mesmo caminho do cliente).
// Nomes e preços de comércio de verdade: a tela gravada é a vitrine da função.
import type { Empresa } from './_gravador';

export const LOJA = [
  { name: 'Camiseta Básica Algodão', sku: 'CAM-BAS', barcode: '7891000100011', salePrice: 59.9, costPrice: 22, estoque: 38 },
  { name: 'Calça Jeans Slim', sku: 'CAL-SLM', barcode: '7891000100028', salePrice: 189.9, costPrice: 78, estoque: 14 },
  { name: 'Tênis Casual Branco', sku: 'TEN-CAS', barcode: '7891000100035', salePrice: 249.9, costPrice: 110, estoque: 9 },
  { name: 'Boné Aba Curva', sku: 'BON-ABA', barcode: '7891000100042', salePrice: 69.9, costPrice: 25, estoque: 22 },
  { name: 'Jaqueta Corta-vento', sku: 'JAQ-CVT', barcode: '7891000100059', salePrice: 229.9, costPrice: 95, estoque: 6 },
  { name: 'Meia Cano Médio (3 pares)', sku: 'MEI-3PR', barcode: '7891000100066', salePrice: 39.9, costPrice: 12, estoque: 50 },
  { name: 'Bermuda Moletom', sku: 'BER-MOL', barcode: '7891000100073', salePrice: 99.9, costPrice: 38, estoque: 3 },
];
export const CLIENTES = [
  { name: 'Juliana Martins', phone: '11 98123-4410', email: 'juliana.martins@email.com' },
  { name: 'Rafael Oliveira', phone: '11 97456-2231' },
  { name: 'Fernanda Lima', phone: '21 99811-0907', email: 'fe.lima@email.com' },
  { name: 'Carlos Eduardo Souza', phone: '31 98877-1290' },
  { name: 'Patrícia Gomes', phone: '11 96655-3018' },
];

export interface Varejo { produtos: Record<string, any>; clientes: any[]; vendedores: any[]; caixa: any }

/** Loja de roupas: catálogo com estoque, clientes, vendedoras, caixa aberto e um dia de vendas. */
export async function semearVarejo(e: Empresa): Promise<Varejo> {
  const produtos: Record<string, any> = {};
  for (const p of LOJA) {
    const prod = await e.api('POST', '/products', { name: p.name, sku: p.sku, barcode: p.barcode, salePrice: p.salePrice, costPrice: p.costPrice, trackStock: true });
    await e.api('POST', '/stock/movements', { variantId: prod.variants[0].id, kind: 'RECEIVE', quantity: p.estoque, note: 'estoque inicial' });
    produtos[p.sku] = prod;
  }
  const clientes = [];
  for (const c of CLIENTES) clientes.push(await e.api('POST', '/customers', c));
  const vendedores = [
    await e.api('POST', '/m/varejo/vendedores', { name: 'Ana Paula', defaultCommissionRate: 5 }),
    await e.api('POST', '/m/varejo/vendedores', { name: 'Bruno Lima', defaultCommissionRate: 4 }),
  ];
  const caixa = await e.api('POST', '/m/varejo/caixa/abrir', { terminal: 'CAIXA-1', openingAmount: 200 });
  const vendas: [string, number, string, number][] = [
    ['CAM-BAS', 2, 'PIX', 0], ['CAL-SLM', 1, 'CREDIT', 1], ['TEN-CAS', 1, 'DEBIT', 0], ['BON-ABA', 2, 'CASH', 1],
    ['MEI-3PR', 3, 'PIX', 0], ['JAQ-CVT', 1, 'CREDIT', 1], ['CAM-BAS', 3, 'CREDIT', 0], ['BER-MOL', 1, 'PIX', 1],
  ];
  for (const [i, [sku, q, method, v]] of vendas.entries()) {
    const p = LOJA.find((x) => x.sku === sku)!;
    await e.api('POST', '/orders', {
      channel: 'POS', customerId: clientes[i % clientes.length].id,
      items: [{ code: sku, quantity: q }], payments: [{ method, amount: Number((p.salePrice * q).toFixed(2)) }],
      moduleData: { posSessionId: caixa.id, salespersonId: vendedores[v].id },
    });
  }
  return { produtos, clientes, vendedores, caixa };
}
