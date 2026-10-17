import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router, { publicRouter } from './routes/academia.routes';
import { gymSalesStrategy } from './services/gym-sales.strategy';

export const academiaModule: ModuleDefinition = {
  key: ModuleKey.ACADEMIA,
  name: 'Academias',
  description: 'Planos e assinaturas recorrentes, frequência e integração de acesso (catraca).',
  basePath: 'academia',
  router,
  publicRouter,
  salesStrategy: gymSalesStrategy,
  permissions: [
    { key: 'gym.planos:view',        label: 'Ver planos',                         module: ModuleKey.ACADEMIA },
    { key: 'gym.planos:manage',      label: 'Criar/editar planos',                module: ModuleKey.ACADEMIA },
    { key: 'gym.matriculas:view',    label: 'Ver matrículas e frequência',        module: ModuleKey.ACADEMIA },
    { key: 'gym.matriculas:manage',  label: 'Cancelar/pausar matrículas',         module: ModuleKey.ACADEMIA },
    { key: 'gym.acesso:operate',     label: 'Registrar check-in na recepção',     module: ModuleKey.ACADEMIA },
    { key: 'gym.acesso:manage',      label: 'Gerir credenciais e dispositivos',   module: ModuleKey.ACADEMIA },
  ],
};
