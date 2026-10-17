// test/sales-strategy.test.ts — a DECISÃO de módulo, sem banco. Roda com `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleKey, OrderChannel } from '@prisma/client';
import { salesStrategies } from '../src/core/orders/sales-strategy';
import { coreSalesStrategy } from '../src/core/orders/core-sales.strategy';
import { runWithContext } from '../src/core/tenancy/tenant-context';
import { registerAllModules } from '../src/modules';
import { AppError } from '../src/shared/errors';

salesStrategies.registerCore(coreSalesStrategy);
registerAllModules();

const ctxFor = (mods: ModuleKey[], settings: Record<string, unknown> = {}) => ({
  tenantId: 't', tenantSlug: 't', tenantSettings: settings, modules: new Map(mods.map((m) => [m, {}] as const)), userId: 'u', db: null as never,
});
const resolve = (mods: ModuleKey[], draft: { moduleKey?: ModuleKey; channel?: OrderChannel }, settings?: Record<string, unknown>) =>
  runWithContext(ctxFor(mods, settings), () => salesStrategies.resolve(draft));

test('sem módulo de venda → estratégia do core', () => {
  assert.equal(resolve([], {}).moduleKey, null);
});
test('um módulo ativo → ele, sem precisar dizer nada', () => {
  assert.equal(resolve([ModuleKey.VAREJO], {}).moduleKey, 'VAREJO');
  assert.equal(resolve([ModuleKey.FOOD], {}).moduleKey, 'FOOD');
  assert.equal(resolve([ModuleKey.SERVICOS], {}).moduleKey, 'SERVICOS');
  assert.equal(resolve([ModuleKey.ACADEMIA], {}).moduleKey, 'ACADEMIA');
});
test('módulo explícito inativo → MODULE_INACTIVE', () => {
  assert.throws(() => resolve([ModuleKey.VAREJO], { moduleKey: ModuleKey.FOOD }), (e: unknown) => e instanceof AppError && e.code === 'MODULE_INACTIVE');
});
test('vários ativos: canal desempata', () => {
  assert.equal(resolve([ModuleKey.VAREJO, ModuleKey.FOOD], { channel: OrderChannel.TABLE }).moduleKey, 'FOOD');
  assert.equal(resolve([ModuleKey.VAREJO, ModuleKey.SERVICOS], { channel: OrderChannel.WORKSHOP }).moduleKey, 'SERVICOS');
});
test('vários ativos, canal ambíguo: módulo padrão da empresa', () => {
  assert.equal(resolve([ModuleKey.VAREJO, ModuleKey.FOOD], { channel: OrderChannel.COUNTER }, { defaultSalesModule: 'FOOD' }).moduleKey, 'FOOD');
});
test('vários ativos, nada desempata → MODULE_AMBIGUOUS com candidatas', () => {
  assert.throws(() => resolve([ModuleKey.VAREJO, ModuleKey.FOOD], { channel: OrderChannel.COUNTER }), (e: unknown) => {
    assert.ok(e instanceof AppError); assert.equal(e.code, 'MODULE_AMBIGUOUS');
    assert.deepEqual((e.details as { candidates: string[] }).candidates.sort(), ['FOOD', 'VAREJO']);
    return true;
  });
});
test('pedido gravado resolve pelo moduleKey dele mesmo com módulo desligado depois', () => {
  assert.equal(salesStrategies.forOrder(ModuleKey.FOOD).moduleKey, 'FOOD');
  assert.equal(salesStrategies.forOrder(null).moduleKey, null);
});
test('políticas de cada estratégia são as projetadas', () => {
  const d = { items: [] };
  assert.equal(salesStrategies.forOrder(ModuleKey.VAREJO).stockPolicy(d), 'CONSUME');
  assert.equal(salesStrategies.forOrder(ModuleKey.SERVICOS).stockPolicy(d), 'RESERVE');
  assert.equal(salesStrategies.forOrder(ModuleKey.SERVICOS).completeOnFullPayment(d), false);
  assert.equal(salesStrategies.forOrder(ModuleKey.VAREJO).completeOnFullPayment(d), true);
  assert.equal(salesStrategies.forOrder(ModuleKey.FOOD).completeOnFullPayment({ items: [], moduleData: { tabId: 'x' } }), false);
  assert.equal(salesStrategies.forOrder(ModuleKey.FOOD).completeOnFullPayment({ items: [], moduleData: {} }), true);
});
