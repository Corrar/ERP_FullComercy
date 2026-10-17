import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router from './routes/servicos.routes';
import { osSalesStrategy } from './services/os-sales.strategy';

export const servicosModule: ModuleDefinition = {
  key: ModuleKey.SERVICOS,
  name: 'Automotivo / Serviços',
  description: 'Ordens de serviço, controle de placas e status de manutenção.',
  basePath: 'servicos',
  router,
  salesStrategy: osSalesStrategy,
  permissions: [
    { key: 'svc.os:view',           label: 'Ver OS e painel da oficina',   module: ModuleKey.SERVICOS },
    { key: 'svc.os:update',         label: 'Mover status da OS',           module: ModuleKey.SERVICOS },
    { key: 'svc.veiculos:manage',   label: 'Cadastrar veículos',           module: ModuleKey.SERVICOS },
    { key: 'svc.catalogo:manage',   label: 'Gerir catálogo de serviços',   module: ModuleKey.SERVICOS },
  ],
};
