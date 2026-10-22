import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router from './routes/beleza.routes';
import { belezaSalesStrategy } from './services/beleza-sales.strategy';

export const belezaModule: ModuleDefinition = {
  key: ModuleKey.BELEZA,
  name: 'Beleza e estética',
  description: 'Agenda por profissional, comanda do atendimento, comissão do profissional e pacotes de sessões.',
  basePath: 'beleza',
  router,
  salesStrategy: belezaSalesStrategy,
  permissions: [
    { key: 'bel.agenda:operate',    label: 'Agendar e atender',                 module: ModuleKey.BELEZA },
    { key: 'bel.cadastro:manage',   label: 'Cadastrar profissionais e serviços', module: ModuleKey.BELEZA },
    { key: 'bel.pacotes:manage',    label: 'Criar pacotes de sessões',          module: ModuleKey.BELEZA },
    { key: 'bel.comissoes:view',    label: 'Ver comissões dos profissionais',   module: ModuleKey.BELEZA },
    { key: 'bel.comissoes:manage',  label: 'Pagar comissões',                   module: ModuleKey.BELEZA },
    { key: 'bel.relatorios:view',   label: 'Ver relatórios do salão',           module: ModuleKey.BELEZA },
  ],
  async onEnable(tenantId) {
    const { prisma } = await import('../../infra/prisma');
    await prisma.belService.createMany({ data: [
      { tenantId, name: 'Corte feminino', durationMin: 60, price: 90, commissionRate: null },
      { tenantId, name: 'Corte masculino', durationMin: 30, price: 50, commissionRate: null },
      { tenantId, name: 'Escova', durationMin: 45, price: 60, commissionRate: null },
      { tenantId, name: 'Manicure', durationMin: 40, price: 35, commissionRate: null },
    ], skipDuplicates: true });
  },
};
