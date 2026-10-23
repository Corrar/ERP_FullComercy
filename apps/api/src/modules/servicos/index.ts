import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import { servicosLgpd } from './services/lgpd';
import router from './routes/servicos.routes';
import { osSalesStrategy } from './services/os-sales.strategy';

export const servicosModule: ModuleDefinition = {
  key: ModuleKey.SERVICOS,
  name: 'Automotivo / Serviços',
  description: 'Ordens de serviço, orçamento e aprovação, checklist, agenda, controle de placas e status de manutenção.',
  basePath: 'servicos',
  router,
  salesStrategy: osSalesStrategy,
  lgpd: servicosLgpd,
  permissions: [
    { key: 'svc.os:view',           label: 'Ver OS e painel da oficina',   module: ModuleKey.SERVICOS },
    { key: 'svc.os:update',         label: 'Mover status da OS',           module: ModuleKey.SERVICOS },
    { key: 'svc.veiculos:manage',   label: 'Cadastrar veículos',           module: ModuleKey.SERVICOS },
    { key: 'svc.catalogo:manage',   label: 'Gerir catálogo de serviços',   module: ModuleKey.SERVICOS },
    { key: 'svc.agenda:operate',    label: 'Agendar e atender agenda',     module: ModuleKey.SERVICOS },
    { key: 'svc.relatorios:view',   label: 'Ver relatórios da oficina',    module: ModuleKey.SERVICOS },
  ],
  async onEnable(tenantId) {
    const { prisma } = await import('../../infra/prisma');
    await prisma.svcServiceCatalogItem.createMany({ data: [
      { tenantId, name: 'Troca de óleo e filtro', defaultPrice: 80, estimatedMinutes: 40 },
      { tenantId, name: 'Alinhamento e balanceamento', defaultPrice: 150, estimatedMinutes: 60 },
      { tenantId, name: 'Revisão de freios', defaultPrice: 120, estimatedMinutes: 90 },
      { tenantId, name: 'Diagnóstico eletrônico', defaultPrice: 100, estimatedMinutes: 30 },
    ], skipDuplicates: true });
  },
};
