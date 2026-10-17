import type { FrontModule } from '@/app/modules';
import { PainelOS } from './PainelOS';
import { OsDetalhe } from './OsDetalhe';
import { NovaOS } from './NovaOS';
import { Veiculos } from './Veiculos';
import { Agenda } from './Agenda';

export const servicosModule: FrontModule = {
  key: 'SERVICOS', label: 'Serviços / Oficina',
  nav: [
    { to: '/servicos', label: 'Painel de OS', perm: 'svc.os:view' },
    { to: '/servicos/nova', label: 'Abrir OS', perm: 'core.orders:create' },
    { to: '/servicos/agenda', label: 'Agenda', perm: 'svc.agenda:operate' },
    { to: '/servicos/veiculos', label: 'Veículos', perm: 'svc.os:view' },
  ],
  routes: [{ path: '/servicos', element: <PainelOS /> }, { path: '/servicos/nova', element: <NovaOS /> }, { path: '/servicos/os/:id', element: <OsDetalhe /> }, { path: '/servicos/agenda', element: <Agenda /> }, { path: '/servicos/veiculos', element: <Veiculos /> }],
};
