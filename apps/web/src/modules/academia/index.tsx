import type { FrontModule } from '@/app/modules';
import { Painel } from './Painel';
import { Recepcao } from './Recepcao';
import { Planos } from './Planos';
import { Matriculas } from './Matriculas';
import { Turmas } from './Turmas';
import { Acesso } from './Acesso';

export const academiaModule: FrontModule = {
  key: 'ACADEMIA', label: 'Academia',
  nav: [
    { to: '/academia', label: 'Painel', perm: 'gym.matriculas:view' },
    { to: '/academia/recepcao', label: 'Recepção', perm: 'gym.acesso:operate' },
    { to: '/academia/matriculas', label: 'Matrículas', perm: 'gym.matriculas:view' },
    { to: '/academia/planos', label: 'Planos', perm: 'gym.planos:view' },
    { to: '/academia/turmas', label: 'Turmas', perm: 'gym.turmas:view' },
    { to: '/academia/acesso', label: 'Catraca e credenciais', perm: 'gym.acesso:manage' },
  ],
  routes: [
    { path: '/academia', element: <Painel /> }, { path: '/academia/recepcao', element: <Recepcao /> }, { path: '/academia/matriculas', element: <Matriculas /> },
    { path: '/academia/planos', element: <Planos /> }, { path: '/academia/turmas', element: <Turmas /> }, { path: '/academia/acesso', element: <Acesso /> },
  ],
};
