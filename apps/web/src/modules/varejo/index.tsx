import type { FrontModule } from '@/app/modules';
import { Pdv } from './Pdv';
import { Caixa } from './Caixa';
import { Grade } from './Grade';
import { Etiquetas } from './Etiquetas';
import { Comissoes } from './Comissoes';
import { Relatorios } from './Relatorios';
import { Devolucoes } from './Devolucoes';

export const varejoModule: FrontModule = {
  key: 'VAREJO', label: 'Varejo',
  nav: [
    { to: '/varejo/pdv', label: 'PDV', perm: 'varejo.pdv:operate' },
    { to: '/varejo/caixa', label: 'Caixa', perm: 'varejo.pdv:operate' },
    { to: '/varejo/grade', label: 'Grade', perm: 'varejo.grade:manage' },
    { to: '/varejo/etiquetas', label: 'Etiquetas', perm: 'varejo.etiquetas:print' },
    { to: '/varejo/comissoes', label: 'Comissões', perm: 'varejo.comissoes:view' },
    { to: '/varejo/devolucoes', label: 'Trocas e devoluções', perm: 'varejo.devolucoes:manage' },
    { to: '/varejo/relatorios', label: 'Relatórios', perm: 'varejo.relatorios:view' },
  ],
  routes: [
    { path: '/varejo/pdv', element: <Pdv /> }, { path: '/varejo/caixa', element: <Caixa /> }, { path: '/varejo/grade', element: <Grade /> },
    { path: '/varejo/etiquetas', element: <Etiquetas /> }, { path: '/varejo/comissoes', element: <Comissoes /> }, { path: '/varejo/devolucoes', element: <Devolucoes /> }, { path: '/varejo/relatorios', element: <Relatorios /> },
  ],
};
