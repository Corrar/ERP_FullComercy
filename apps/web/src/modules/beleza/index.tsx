import type { FrontModule } from '@/app/modules';
import { Agenda } from './Agenda';
import { Comandas } from './Comandas';
import { Cadastros } from './Cadastros';
import { Pacotes } from './Pacotes';
import { Comissoes } from './Comissoes';
import { Relatorios } from './Relatorios';

export const belezaModule: FrontModule = {
  key: 'BELEZA', label: 'Beleza e estética',
  nav: [
    { to: '/beleza/agenda', label: 'Agenda', perm: 'bel.agenda:operate' },
    { to: '/beleza/comandas', label: 'Comandas', perm: 'bel.agenda:operate' },
    { to: '/beleza/cadastros', label: 'Profissionais e serviços', perm: 'bel.agenda:operate' },
    { to: '/beleza/pacotes', label: 'Pacotes', perm: 'bel.pacotes:manage' },
    { to: '/beleza/comissoes', label: 'Comissões', perm: 'bel.comissoes:view' },
    { to: '/beleza/relatorios', label: 'Relatórios', perm: 'bel.relatorios:view' },
  ],
  routes: [
    { path: '/beleza/agenda', element: <Agenda /> }, { path: '/beleza/comandas', element: <Comandas /> }, { path: '/beleza/cadastros', element: <Cadastros /> },
    { path: '/beleza/pacotes', element: <Pacotes /> }, { path: '/beleza/comissoes', element: <Comissoes /> }, { path: '/beleza/relatorios', element: <Relatorios /> },
  ],
};
