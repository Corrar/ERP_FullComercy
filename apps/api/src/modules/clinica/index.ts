import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import { clinicaLgpd } from './services/lgpd';
import router from './routes/clinica.routes';
import { clinicaSalesStrategy } from './services/clinica-sales.strategy';

export const clinicaModule: ModuleDefinition = {
  key: ModuleKey.CLINICA,
  name: 'Clínica e consultório',
  description: 'Agenda por profissional, ficha do paciente, particular e convênio, prontuário e recibo.',
  basePath: 'clinica',
  router,
  salesStrategy: clinicaSalesStrategy,
  lgpd: clinicaLgpd,
  permissions: [
    { key: 'cli.agenda:operate',      label: 'Agendar, receber e cobrar consultas', module: ModuleKey.CLINICA },
    { key: 'cli.cadastro:manage',     label: 'Cadastrar profissionais',             module: ModuleKey.CLINICA },
    { key: 'cli.prontuario:view',     label: 'Ler prontuário',                      module: ModuleKey.CLINICA },
    { key: 'cli.prontuario:manage',   label: 'Escrever no prontuário',              module: ModuleKey.CLINICA },
    { key: 'cli.convenios:manage',    label: 'Gerir convênios e repasses',          module: ModuleKey.CLINICA },
    { key: 'cli.relatorios:view',     label: 'Ver relatórios da clínica',           module: ModuleKey.CLINICA },
  ],
};
