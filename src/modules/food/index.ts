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
  ],
};
