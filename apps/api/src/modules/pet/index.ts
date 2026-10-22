import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router from './routes/pet.routes';
import { petSalesStrategy } from './services/pet-sales.strategy';

export const petModule: ModuleDefinition = {
  key: ModuleKey.PET,
  name: 'Pet shop e veterinária',
  description: 'Ficha do pet e do tutor, banho e tosa com agenda, vacinas e retornos, prontuário e venda no balcão.',
  basePath: 'pet',
  router,
  salesStrategy: petSalesStrategy,
  permissions: [
    { key: 'pet.pets:view',       label: 'Ver pets e tutores',              module: ModuleKey.PET },
    { key: 'pet.pets:manage',     label: 'Cadastrar pets',                  module: ModuleKey.PET },
    { key: 'pet.banho:operate',   label: 'Agendar e tocar banho e tosa',    module: ModuleKey.PET },
    { key: 'pet.vet:view',        label: 'Ver prontuário, vacinas e lembretes', module: ModuleKey.PET },
    { key: 'pet.vet:manage',      label: 'Registrar atendimento e vacina',  module: ModuleKey.PET },
    { key: 'pet.relatorios:view', label: 'Ver relatórios do pet shop',      module: ModuleKey.PET },
  ],
};
