import type { FrontModule } from '@/app/modules';
import { Salao } from './Salao';
import { Kds } from './Kds';
import { Entregas } from './Entregas';
import { Cardapio } from './Cardapio';
import { Relatorios } from './Relatorios';

export const foodModule: FrontModule = {
  key: 'FOOD', label: 'Food & Delivery',
  nav: [
    { to: '/food/salao', label: 'Salão', perm: 'food.salao:operate' },
    { to: '/food/cozinha', label: 'Cozinha (KDS)', perm: 'food.cozinha:view' },
    { to: '/food/entregas', label: 'Entregas', perm: 'food.delivery:operate' },
    { to: '/food/cardapio', label: 'Cardápio', perm: 'food.cardapio:manage' },
    { to: '/food/relatorios', label: 'Relatórios', perm: 'food.relatorios:view' },
  ],
  routes: [{ path: '/food/salao', element: <Salao /> }, { path: '/food/cozinha', element: <Kds /> }, { path: '/food/entregas', element: <Entregas /> }, { path: '/food/cardapio', element: <Cardapio /> }, { path: '/food/relatorios', element: <Relatorios /> }],
};
