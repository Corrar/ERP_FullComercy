// test/unidades.test.ts — funções puras dos módulos e do core.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarPlaca } from '../src/modules/servicos/services/veiculos.service';
import { somarCiclo } from '../src/modules/academia/services/assinaturas.service';
import { abertoAgora } from '../src/modules/food/services/cardapio.service';
import { D, round2, sum } from '../src/shared/money';
import { AppError } from '../src/shared/errors';
import { KEYS_REQUIRED_BY_ROUTES, assertAllRequiredKeysAreDeclared } from '../src/core/rbac/rbac.middleware';
import { allPermissions } from '../src/core/rbac/permissions';
import { emailDaEmpresa } from '../src/infra/mail-templates';
import { toCsv } from '../src/shared/csv';

test('placa: antiga, Mercosul, sujeira e inválidas', () => {
  assert.equal(normalizarPlaca('abc-1234'), 'ABC1234');
  assert.equal(normalizarPlaca('ABC 1D23'), 'ABC1D23');
  assert.equal(normalizarPlaca('abc1d2'), null);
  assert.equal(normalizarPlaca('1234ABC'), null);
});

test('ciclo de cobrança soma o período certo', () => {
  const base = new Date('2026-01-31T12:00:00Z');
  assert.equal(somarCiclo(base, 'WEEKLY').toISOString().slice(0, 10), '2026-02-07');
  assert.equal(somarCiclo(base, 'QUARTERLY').toISOString().slice(0, 10), '2026-04-30'); // 31/jan + 3 = 30/abr, não 1º/mai
  assert.equal(somarCiclo(base, 'MONTHLY').toISOString().slice(0, 10), '2026-02-28');
  assert.equal(somarCiclo(new Date('2026-03-15T12:00:00Z'), 'MONTHLY').toISOString().slice(0, 10), '2026-04-15');
  assert.equal(somarCiclo(base, 'ANNUAL').getFullYear(), 2027);
});

test('janela de funcionamento do cardápio', () => {
  const seg11h = new Date('2026-10-19T11:30:00'); // segunda
  assert.equal(abertoAgora([], seg11h), true);
  assert.equal(abertoAgora([{ days: [1, 2, 3], from: '11:00', to: '15:00' }], seg11h), true);
  assert.equal(abertoAgora([{ days: [6, 0], from: '11:00', to: '15:00' }], seg11h), false);
  assert.equal(abertoAgora([{ from: '18:00', to: '23:00' }], seg11h), false);
});

test('dinheiro: sem float, arredondamento comercial', () => {
  assert.equal(round2(D('0.1').plus('0.2')).toString(), '0.3');
  assert.equal(round2(D('2.675')).toString(), '2.68');
  assert.equal(sum([D(1), D('2.5'), D('0.005')]).toString(), '3.505');
});

test('AppError mapeia código → status HTTP', () => {
  assert.equal(new AppError('MODULE_AMBIGUOUS', 'x').status, 422);
  assert.equal(new AppError('MODULE_INACTIVE', 'x').status, 403);
  assert.equal(AppError.notFound('Y').status, 404);
});

test('toda chave cobrada por rota existe no catálogo (depois de montar o app)', async () => {
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
  process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';
  const { buildApp } = await import('../src/app');
  buildApp();
  assert.doesNotThrow(() => assertAllRequiredKeysAreDeclared());
  const catalogo = new Set(allPermissions().map((p) => p.key));
  for (const k of KEYS_REQUIRED_BY_ROUTES) assert.ok(catalogo.has(k), `chave órfã: ${k}`);
  // E o inverso: chave no catálogo que rota nenhuma cobra é gate só de navegação — pode existir, mas fica listada.
  const soNavegacao = [...catalogo].filter((k) => !KEYS_REQUIRED_BY_ROUTES.has(k));
  assert.ok(soNavegacao.length <= 2, `chaves sem rota: ${soNavegacao.join(', ')}`);
});

test('busca de cliente: telefone/documento só com número de verdade (≥ 4 dígitos)', async () => {
  const { digitsQuery } = await import('../src/core/customers/customers.service');
  assert.equal(digitsQuery('(11) 98888-7777'), '11988887777');
  assert.equal(digitsQuery('529.982.247-25'), '52998224725');
  assert.equal(digitsQuery('9888'), '9888');
  // Contra-prova: texto com dígitos soltos não vira busca de telefone (casaria qualquer um).
  assert.equal(digitsQuery('Segredo MVJ2K3A1'), undefined);
  assert.equal(digitsQuery('Mesa 12'), undefined);
  assert.equal(digitsQuery('123'), undefined);
});

test('e-mail da empresa: escapa conteúdo, cor e logo inválidos caem no padrão, texto leva o link', () => {
  const r = emailDaEmpresa({ marca: { nome: 'Loja "A" & <B>', cor: 'red;background:url(x)', logoUrl: 'javascript:alert(1)' }, titulo: 'Olá, <script>', paragrafos: ['1 < 2'], botao: { texto: 'Entrar', url: 'https://app.local/x?a=1&b=2' } });
  assert.ok(r.html.includes('Loja &quot;A&quot; &amp; &lt;B&gt;')); assert.ok(!r.html.includes('<script>'));
  assert.ok(r.html.includes('background:#2563eb') && !r.html.includes('url(x)'), 'cor fora de #RRGGBB vira a padrão');
  assert.ok(!r.html.includes('javascript:'), 'logo só https');
  assert.ok(r.html.includes('href="https://app.local/x?a=1&amp;b=2"'));
  assert.ok(r.text.includes('Entrar: https://app.local/x?a=1&b=2') && r.text.startsWith('Olá, <script>'));
});

test('CSV: fórmula vira texto (injeção), número negativo segue número, aspas e ; escapados', () => {
  const linhas = toCsv([{ nome: '=HYPERLINK("http://x","clique")', saldo: -5, obs: '@SUM(A1)', ok: 'Ana; "Bia"' }]).replace('﻿', '').split('\r\n');
  assert.equal(linhas[1], `"'=HYPERLINK(""http://x"",""clique"")";-5;'@SUM(A1);"Ana; ""Bia"""`);
});
