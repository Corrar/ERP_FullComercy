import type { FrontModule } from '@/app/modules';
import { FichaPet, Pets } from './Pets';
import { BanhoTosa } from './BanhoTosa';
import { Balcao } from './Balcao';
import { Veterinaria } from './Veterinaria';
import { Relatorios } from './Relatorios';

export const petModule: FrontModule = {
  key: 'PET', label: 'Pet shop',
  nav: [
    { to: '/pet/pets', label: 'Pets e tutores', perm: 'pet.pets:view' },
    { to: '/pet/banho-tosa', label: 'Banho e tosa', perm: 'pet.banho:operate' },
    { to: '/pet/balcao', label: 'Balcão', perm: 'core.orders:create' },
    { to: '/pet/veterinaria', label: 'Veterinária', perm: 'pet.vet:view' },
    { to: '/pet/relatorios', label: 'Relatórios', perm: 'pet.relatorios:view' },
  ],
  routes: [
    { path: '/pet/pets', element: <Pets /> }, { path: '/pet/pets/:id', element: <FichaPet /> }, { path: '/pet/banho-tosa', element: <BanhoTosa /> },
    { path: '/pet/balcao', element: <Balcao /> }, { path: '/pet/veterinaria', element: <Veterinaria /> }, { path: '/pet/relatorios', element: <Relatorios /> },
  ],
};
