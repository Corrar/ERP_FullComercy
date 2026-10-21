// test/billing-catalog.test.ts — o catálogo da loja de módulos e as contas da assinatura, sem banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleKey } from '@prisma/client';
import { registerAllModules } from '../src/modules';
import { allPermissions } from '../src/core/rbac/permissions';
import { canUse, visiblePermissions } from '../src/core/rbac/rbac.service';
import { FEATURES, resolveSelection, permissionsForFeatures } from '../src/core/billing/catalog';
import { addMonths, normalizeDocument } from '../src/core/billing/periods';
import { AppError } from '../src/shared/errors';

registerAllModules();

test('toda permissão do catálogo está em exatamente uma função vendável (nada impossível de comprar)', () => {
  const owner = new Map<string, string[]>();
  for (const f of FEATURES) for (const p of f.permissions) owner.set(p, [...(owner.get(p) ?? []), f.key]);
  const all = allPermissions().map((p) => p.key);
  const orphan = all.filter((k) => !owner.has(k));
  assert.deepEqual(orphan, [], `permissões sem função: ${orphan.join(', ')}`);
  const twice = [...owner].filter(([, fs]) => fs.length > 1).map(([k]) => k);
  assert.deepEqual(twice, [], `permissões em duas funções: ${twice.join(', ')}`);
  // Contra-prova: o contrário também — função citando chave que não existe é erro de digitação.
  const ghost = [...owner.keys()].filter((k) => !all.includes(k));
  assert.deepEqual(ghost, []);
});

test('todo `requires` aponta para função existente e cada módulo tem exatamente uma função obrigatória', () => {
  const keys = new Set(FEATURES.map((f) => f.key));
  for (const f of FEATURES) for (const d of f.requires ?? []) assert.ok(keys.has(d), `${f.key} requer ${d}, que não existe`);
  for (const m of Object.values(ModuleKey)) assert.equal(FEATURES.filter((f) => f.module === m && f.required).length, 1, `módulo ${m}`);
});

test('mínimo do Varejo: base + PDV + o que o PDV exige, e o total é a soma calculada', () => {
  const r = resolveSelection({ modules: [ModuleKey.VAREJO], features: [] });
  assert.deepEqual(r.items.map((i) => i.key), ['core.base', 'core.clientes', 'core.produtos', 'core.pedidos', 'varejo.pdv']);
  assert.deepEqual(r.items.map((i) => i.reason), ['required', 'dependency', 'dependency', 'dependency', 'required']);
  // 39,90 + 9,90 + 14,90 + 9,90 + 39,90 = 114,50
  assert.equal(r.total.toFixed(2), '114.50');
  assert.deepEqual(r.modules, [ModuleKey.VAREJO]);
});

test('dependência é transitiva e marca quem pediu; selecionado que vira exigência fica travado', () => {
  const r = resolveSelection({ modules: [ModuleKey.FOOD], features: ['core.compras', 'core.produtos'] });
  const by = Object.fromEntries(r.items.map((i) => [i.key, i]));
  assert.equal(by['core.financeiro'].reason, 'dependency');
  assert.equal(by['core.financeiro'].requiredBy, 'core.compras');
  // core.produtos foi marcado pela pessoa, mas Salão e Compras exigem: não pode ser desmarcado.
  assert.equal(by['core.produtos'].reason, 'dependency');
  assert.equal(by['core.compras'].reason, 'selected');
});

test('função de outro módulo traz o módulo junto (com a obrigatória dele)', () => {
  const r = resolveSelection({ modules: [ModuleKey.VAREJO], features: ['food.cozinha'] });
  assert.deepEqual(r.modules.sort(), [ModuleKey.FOOD, ModuleKey.VAREJO]);
  assert.ok(r.items.some((i) => i.key === 'food.salao' && i.reason === 'required'));
});

test('sem módulo e função desconhecida são recusados com VALIDATION', () => {
  assert.throws(() => resolveSelection({ modules: [], features: ['core.financeiro'] }), (e) => e instanceof AppError && e.code === 'VALIDATION');
  assert.throws(() => resolveSelection({ modules: [ModuleKey.VAREJO], features: ['varejo.inventada'] }), (e) => e instanceof AppError && e.code === 'VALIDATION' && /inventada/.test(e.message));
});

test('plano corta até o admin; sem plano o admin é `*`', () => {
  const plan = permissionsForFeatures(['core.base', 'varejo.pdv']);
  const admin = { exists: true, isAdmin: true, keys: new Set<string>(), plan };
  assert.equal(canUse(admin, 'varejo.pdv:operate'), true);
  assert.equal(canUse(admin, 'varejo.etiquetas:print'), false);
  assert.ok(!visiblePermissions(admin).includes('*'));
  assert.ok(visiblePermissions(admin).includes('core.billing:manage'));
  const semPlano = { ...admin, plan: null };
  assert.equal(canUse(semPlano, 'varejo.etiquetas:print'), true);
  assert.deepEqual(visiblePermissions(semPlano), ['*']);
  // Operador com a chave no perfil mas fora do plano: não usa e não vê.
  const op = { exists: true, isAdmin: false, keys: new Set(['varejo.pdv:operate', 'varejo.etiquetas:print']), plan };
  assert.equal(canUse(op, 'varejo.etiquetas:print'), false);
  assert.deepEqual(visiblePermissions(op), ['varejo.pdv:operate']);
});

test('addMonths fixa no último dia do mês curto (31/jan → 28/fev; 31/jan/2028 → 29/fev)', () => {
  assert.equal(addMonths(new Date('2027-01-31T12:00:00Z'), 1).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(addMonths(new Date('2028-01-31T12:00:00Z'), 1).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(addMonths(new Date('2026-12-15T12:00:00Z'), 1).toISOString().slice(0, 10), '2027-01-15');
});

test('CPF e CNPJ: dígito verificador confere; repetidos e errados caem', () => {
  assert.equal(normalizeDocument('529.982.247-25'), '52998224725');
  assert.equal(normalizeDocument('11.222.333/0001-81'), '11222333000181');
  assert.equal(normalizeDocument('529.982.247-24'), null);
  assert.equal(normalizeDocument('111.111.111-11'), null);
  assert.equal(normalizeDocument('11.222.333/0001-80'), null);
});
