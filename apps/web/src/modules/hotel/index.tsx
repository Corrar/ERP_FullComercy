import type { FrontModule } from '@/app/modules';
import { Painel } from './Painel';
import { Reservas } from './Reservas';
import { Quartos } from './Quartos';
import { Relatorios } from './Relatorios';

export const hotelModule: FrontModule = {
  key: 'HOTEL', label: 'Hotelaria',
  nav: [
    { to: '/hotel/painel', label: 'Recepção', perm: 'hot.reservas:operate' },
    { to: '/hotel/reservas', label: 'Reservas', perm: 'hot.reservas:operate' },
    { to: '/hotel/quartos', label: 'Quartos', perm: 'hot.reservas:operate' },
    { to: '/hotel/relatorios', label: 'Ocupação', perm: 'hot.relatorios:view' },
  ],
  routes: [{ path: '/hotel/painel', element: <Painel /> }, { path: '/hotel/reservas', element: <Reservas /> }, { path: '/hotel/quartos', element: <Quartos /> }, { path: '/hotel/relatorios', element: <Relatorios /> }],
};
