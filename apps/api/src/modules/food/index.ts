import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router, { publicRouter } from './routes/food.routes';
import { foodSalesStrategy } from './services/food-sales.strategy';

export const foodModule: ModuleDefinition = {
  key: ModuleKey.FOOD,
  name: 'Food & Delivery',
  description: 'Mesas e comandas, cardápio online, fluxo de cozinha e entregadores.',
  basePath: 'food',
  router,
  publicRouter,
  salesStrategy: foodSalesStrategy,
  permissions: [
    { key: 'food.salao:operate',    label: 'Operar salão (mesas, comandas, pedidos)', module: ModuleKey.FOOD },
    { key: 'food.salao:manage',     label: 'Cadastrar mesas e áreas',                module: ModuleKey.FOOD },
    { key: 'food.salao:close',      label: 'Fechar conta',                           module: ModuleKey.FOOD },
    { key: 'food.cozinha:view',     label: 'Ver fila da cozinha (KDS)',              module: ModuleKey.FOOD },
    { key: 'food.cozinha:update',   label: 'Mover tickets da cozinha',               module: ModuleKey.FOOD },
    { key: 'food.delivery:operate', label: 'Despachar entregas',                     module: ModuleKey.FOOD },
    { key: 'food.delivery:manage',  label: 'Cadastrar entregadores e zonas',         module: ModuleKey.FOOD },
    { key: 'food.cardapio:manage',  label: 'Editar cardápio',                        module: ModuleKey.FOOD },
    { key: 'food.relatorios:view',  label: 'Ver relatórios do restaurante',          module: ModuleKey.FOOD },
  ],
  async onEnable(tenantId) {
    const { prisma } = await import('../../infra/prisma');
    await prisma.foodModifierGroup.createMany({ data: [{ tenantId, name: 'Ponto da carne', minSelect: 1, maxSelect: 1 }, { tenantId, name: 'Extras', minSelect: 0, maxSelect: 5 }], skipDuplicates: true });
    await prisma.foodTable.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ tenantId, number: i + 1, area: 'Salão', seats: 4 })), skipDuplicates: true });
  },
};
