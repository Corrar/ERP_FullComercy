import type { FrontModule } from '@/app/modules';
import { Agenda } from './Agenda';
import { FichaPaciente, Pacientes } from './Pacientes';
import { Cadastros } from './Cadastros';
import { Convenios } from './Convenios';
import { Recibo } from './Recibo';
import { Relatorios } from './Relatorios';

export const clinicaModule: FrontModule = {
  key: 'CLINICA', label: 'Clínica',
  nav: [
    { to: '/clinica/agenda', label: 'Agenda', perm: 'cli.agenda:operate' },
    { to: '/clinica/pacientes', label: 'Pacientes', perm: 'cli.agenda:operate' },
    { to: '/clinica/cadastros', label: 'Profissionais', perm: 'cli.agenda:operate' },
    { to: '/clinica/convenios', label: 'Convênios', perm: 'cli.convenios:manage' },
    { to: '/clinica/relatorios', label: 'Relatórios', perm: 'cli.relatorios:view' },
  ],
  routes: [
    { path: '/clinica/agenda', element: <Agenda /> }, { path: '/clinica/pacientes', element: <Pacientes /> }, { path: '/clinica/pacientes/:id', element: <FichaPaciente /> },
    { path: '/clinica/cadastros', element: <Cadastros /> }, { path: '/clinica/convenios', element: <Convenios /> }, { path: '/clinica/recibo/:orderId', element: <Recibo /> }, { path: '/clinica/relatorios', element: <Relatorios /> },
  ],
};
