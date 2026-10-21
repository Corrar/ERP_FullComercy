// demos/varejo.demo.ts — roteiros das funções do Varejo (um vídeo por chave do catálogo).
import { API, empresa, expect, test, type Api, type Empresa } from './_gravador';
import { semearVarejo } from './seeds';

const loja = (request: Parameters<typeof empresa>[0]) => empresa(request, 'VAREJO', async (e) => { await semearVarejo(e); });
/** `e.api` fica presa ao `request` do teste que criou a empresa (descartado ao fim dele): os
 *  testes seguintes preparam dados com o `request` deles, com o mesmo token. */
const apiDe = (request: Parameters<typeof empresa>[0], e: Empresa): Api => async (method, path, data) => {
  const r = await request.fetch(`${API}${path}`, { method, headers: e.h, data });
  if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as never;
};

test('varejo.pdv', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('varejo.pdv', e, '/varejo/pdv');
  const bipe = g.page.getByPlaceholder(/Bipe o código/);
  await expect(bipe).toBeVisible();
  await g.inicio();
  await g.pausa(700);
  await g.digitar(bipe, '7891000100011'); await bipe.press('Enter');
  await expect(g.page.getByText('Camiseta Básica Algodão')).toBeVisible();
  await g.pausa(500);
  await g.digitar(bipe, '7891000100042'); await bipe.press('Enter');
  await expect(g.page.getByText('Boné Aba Curva')).toBeVisible();
  await g.pausa(700);
  g.capa();
  await g.clicar(g.page.locator('.card:has-text("Pagamento") button:has-text("+")'));
  await g.pausa(600);
  await g.clicar(g.page.getByRole('button', { name: /Finalizar venda/ }));
  await expect(g.page.locator('.toast')).toHaveText(/Venda #\d+ concluída/);
  await g.pausa(1400);
});

test('varejo.grade', async ({ request, gravar }) => {
  const e = await loja(request); const api = apiDe(request, e);
  // Produto "com grade" ainda sem variantes + os eixos da loja (tamanho e cor) já cadastrados.
  await api('POST', '/products', { name: 'Camisa Polo Piquet', sku: 'POLO', salePrice: 119.9, costPrice: 46, hasVariants: true });
  for (const [nome, valores] of [['Tamanho', ['P', 'M', 'G', 'GG']], ['Cor', ['Preto', 'Branco', 'Azul-marinho']]] as const) {
    // A empresa de Varejo pode já nascer com os eixos: só cria o que falta.
    const eixo = (await api<any[]>('GET', '/m/varejo/grade/eixos')).find((x) => x.name === nome) ?? await api('POST', '/m/varejo/grade/eixos', { name: nome });
    for (const value of valores) if (!eixo.values?.some((v: any) => v.value === value)) await api('POST', `/m/varejo/grade/eixos/${eixo.id}/valores`, { value });
  }
  const g = await gravar('varejo.grade', e, '/varejo/grade');
  const p = g.page;
  const produto = p.locator('select[name="productId"]');
  await expect(produto.locator('option', { hasText: 'Camisa Polo Piquet' })).toHaveCount(1);
  await expect(p.getByText('Tamanho (separe por vírgula)')).toBeVisible();
  await g.inicio();
  await g.pausa(500);
  await g.passar(produto); await produto.selectOption({ label: 'Camisa Polo Piquet' });
  await g.pausa(300);
  await g.digitar(p.locator('input[name="skuBase"]'), 'POLO');
  await g.digitar(p.getByPlaceholder('P, M, G, GG'), 'P, M, G');
  await g.digitar(p.getByPlaceholder('Preto, Branco, Azul-marinho'), 'Preto, Branco');
  await g.clicar(p.getByRole('button', { name: 'Gerar' }));
  const matriz = p.locator('.card:has-text("Matriz de estoque") tbody tr');
  await expect(matriz).toHaveCount(6);
  await expect(p.getByText('POLO-G-BRANCO')).toBeVisible();
  await g.passar(matriz.last());
  await g.pausa(400);
  g.capa();
  await g.pausa(1200);
});

test('varejo.etiquetas', async ({ request, gravar }) => {
  const e = await loja(request); const api = apiDe(request, e);
  await api('POST', '/m/varejo/etiquetas/modelos', { name: 'Gôndola', widthMm: 50, heightMm: 30, isDefault: true });
  const g = await gravar('varejo.etiquetas', e, '/varejo/etiquetas');
  const p = g.page;
  const item = p.locator('select[name="variantId"]');
  await expect(item.locator('option', { hasText: 'Camiseta Básica Algodão' })).toHaveCount(1);
  await expect(p.locator('select[name="templateId"] option', { hasText: 'Gôndola' })).toHaveCount(1);
  await g.inicio();
  await g.pausa(500);
  await g.passar(item); await item.selectOption({ label: 'Camiseta Básica Algodão (CAM-BAS)' });
  await g.pausa(300);
  const qtd = p.locator('input[name="quantity"]');
  await g.clicar(qtd); await qtd.press('Control+a'); await qtd.pressSequentially('24', { delay: 70 });
  await g.pausa(250);
  await g.clicar(p.getByRole('button', { name: 'Gerar lote' }));
  await expect(p.getByText('Camiseta Básica Algodão × 24')).toBeVisible();
  await g.passar(p.getByText('Camiseta Básica Algodão × 24'));
  await g.pausa(400);
  g.capa();
  const baixou = p.waitForEvent('download');
  await g.clicar(p.getByRole('button', { name: 'PDF (A4)' }));
  const d = await baixou;
  expect(d.suggestedFilename()).toBe('etiquetas.pdf');
  await g.pausa(1000);
});

test('varejo.comissoes', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('varejo.comissoes', e, '/varejo/comissoes');
  const p = g.page;
  const linhas = p.locator('.card', { has: p.getByRole('button', { name: 'Aprovar pendentes' }) }).locator('tbody tr');
  await expect(linhas).toHaveCount(8);
  await expect(p.locator('.badge', { hasText: 'Pendente' })).toHaveCount(8);
  await g.inicio();
  await g.pausa(800);
  await g.passar(linhas.last());
  await g.pausa(400);
  await g.clicar(p.getByRole('button', { name: 'Aprovar pendentes' }));
  await expect(p.locator('.badge', { hasText: 'Pendente' })).toHaveCount(0);
  await expect(p.locator('.badge', { hasText: 'Aprovado' })).toHaveCount(8);
  await g.pausa(800);
  await g.clicar(p.locator('tr:has-text("Ana Paula")').getByRole('button', { name: 'Pagar aprovadas' }));
  await expect(p.locator('.badge', { hasText: 'Pago' })).toHaveCount(4);
  await g.passar(linhas.last());
  await g.pausa(400);
  g.capa();
  await g.pausa(1200);
});

test('varejo.relatorios', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('varejo.relatorios', e, '/varejo/relatorios');
  const p = g.page;
  await expect(p.locator('tbody tr', { hasText: 'Ana Paula' })).toBeVisible();
  await g.inicio();
  await g.pausa(800);
  await g.passar(p.locator('tbody tr', { hasText: 'Ana Paula' }));
  await g.pausa(900);
  await g.clicar(p.getByRole('tab', { name: 'Curva ABC' }));
  const camiseta = p.locator('tbody tr', { hasText: 'Camiseta Básica Algodão' });
  await expect(camiseta).toBeVisible();
  await expect(camiseta.locator('td').nth(3)).toHaveText(/^\d+$/);
  await expect(p.locator('tbody td', { hasText: /^A$/ }).first()).toBeVisible();
  await g.pausa(500);
  await g.passar(p.locator('tbody tr', { hasText: 'Bermuda Moletom' }).locator('td').nth(1));
  await g.pausa(400);
  g.capa();
  await g.pausa(1400);
});
