import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { Shell } from './Shell';
import { MODULES } from './modules';
import { Login, Forgot, Reset } from '@/core/auth/pages';
import { Dashboard } from '@/core/dashboard/Dashboard';
import { Orders, OrderDetail } from '@/core/orders/pages';
import { Customers } from '@/core/customers/Customers';
import { Products } from '@/core/products/Products';
import { Stock } from '@/core/stock/Stock';
import { Purchases } from '@/core/purchases/Purchases';
import { Finance } from '@/core/finance/Finance';
import { Users } from '@/core/users/Users';
import { Roles } from '@/core/users/Roles';
import { Integrations } from '@/core/integrations/Integrations';
import { Company } from '@/core/company/Company';
import { Account } from '@/core/auth/Account';

function RequireAuth() {
  const { s } = useSession(); const loc = useLocation();
  return s ? <Outlet /> : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}
/** Rota de módulo: 404 amigável se a empresa não tem o módulo (o back já devolveria 403). */
function RequireModule({ k }: { k: 'VAREJO' | 'FOOD' | 'ACADEMIA' | 'SERVICOS' }) {
  const { hasModule } = useSession();
  return hasModule(k) ? <Outlet /> : <div className="card">Este módulo não está ativo para a sua empresa. Ative em <a href="/empresa">Empresa e módulos</a>.</div>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/esqueci-senha', element: <Forgot /> },
  { path: '/redefinir-senha', element: <Reset /> },
  { path: '/definir-senha', element: <Reset invite /> },
  {
    element: <RequireAuth />,
    children: [{
      element: <Shell />,
      children: [
        { path: '/', element: <Dashboard /> },
        { path: '/pedidos', element: <Orders /> },
        { path: '/pedidos/:id', element: <OrderDetail /> },
        { path: '/clientes', element: <Customers /> },
        { path: '/produtos', element: <Products /> },
        { path: '/estoque', element: <Stock /> },
        { path: '/compras', element: <Purchases /> },
        { path: '/financeiro', element: <Finance /> },
        { path: '/usuarios', element: <Users /> },
        { path: '/perfis', element: <Roles /> },
        { path: '/integracoes', element: <Integrations /> },
        { path: '/empresa', element: <Company /> },
        { path: '/conta', element: <Account /> },
        ...MODULES.map((m) => ({ element: <RequireModule k={m.key} />, children: m.routes })),
        { path: '*', element: <div className="card">Página não encontrada.</div> },
      ],
    }],
  },
]);
