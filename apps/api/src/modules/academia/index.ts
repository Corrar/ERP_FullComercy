import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router, { publicRouter } from './routes/academia.routes';
import { gymSalesStrategy } from './services/gym-sales.strategy';
import { gerarCobrancasVencidas } from './services/assinaturas.service';
import { gerarSessoes } from './services/turmas.service';
import { forEachTenantWithModule } from '../../core/tenancy/run-as-tenant';

export const academiaModule: ModuleDefinition = {
  key: ModuleKey.ACADEMIA,
  name: 'Academias',
  description: 'Planos e assinaturas recorrentes, frequência, turmas e integração de acesso (catraca).',
  basePath: 'academia',
  router,
  publicRouter,
  salesStrategy: gymSalesStrategy,
  permissions: [
    { key: 'gym.planos:view',        label: 'Ver planos',                         module: ModuleKey.ACADEMIA },
    { key: 'gym.planos:manage',      label: 'Criar/editar planos',                module: ModuleKey.ACADEMIA },
    { key: 'gym.matriculas:view',    label: 'Ver matrículas, frequência e painel', module: ModuleKey.ACADEMIA },
    { key: 'gym.matriculas:manage',  label: 'Cancelar/pausar/trocar matrículas',  module: ModuleKey.ACADEMIA },
    { key: 'gym.acesso:operate',     label: 'Registrar check-in na recepção',     module: ModuleKey.ACADEMIA },
    { key: 'gym.acesso:manage',      label: 'Gerir credenciais e dispositivos',   module: ModuleKey.ACADEMIA },
    { key: 'gym.turmas:view',        label: 'Ver agenda de turmas e reservar',    module: ModuleKey.ACADEMIA },
    { key: 'gym.turmas:manage',      label: 'Gerir turmas e fazer chamada',       module: ModuleKey.ACADEMIA },
  ],
  jobs: [
    // A recorrência: cobrança do período seguinte + marcação de inadimplência. Diário.
    { name: 'gym.cobranca-recorrente', everyMs: 6 * 3_600_000, run: () => gerarCobrancasVencidas() },
    // Materializa a agenda das turmas para as próximas 2 semanas.
    { name: 'gym.gerar-sessoes', everyMs: 12 * 3_600_000, run: () => forEachTenantWithModule('ACADEMIA', async () => { await gerarSessoes(14); }) },
  ],
};
