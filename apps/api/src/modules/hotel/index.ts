import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router from './routes/hotel.routes';
import { hotelSalesStrategy } from './services/hotel-sales.strategy';

export const hotelModule: ModuleDefinition = {
  key: ModuleKey.HOTEL,
  name: 'Hotelaria e pousada',
  description: 'Quartos, reservas sem sobreposição, check-in e check-out, diárias e consumo na conta do hóspede.',
  basePath: 'hotel',
  router,
  salesStrategy: hotelSalesStrategy,
  permissions: [
    { key: 'hot.reservas:operate',   label: 'Reservar, fazer check-in e check-out', module: ModuleKey.HOTEL },
    { key: 'hot.quartos:manage',     label: 'Cadastrar quartos e diárias',          module: ModuleKey.HOTEL },
    { key: 'hot.governanca:operate', label: 'Marcar limpeza e manutenção',          module: ModuleKey.HOTEL },
    { key: 'hot.relatorios:view',    label: 'Ver ocupação e diária média',          module: ModuleKey.HOTEL },
  ],
};
