import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession, type ModuleKey } from '@/lib/session';
import { Shell } from './Shell';
import { MODULES } from './modules';
import { Login, Forgot, Reset, AccountForgot, AccountReset } from '@/core/auth/pages';
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
import { Audit } from '@/core/audit/Audit';
import { Account } from '@/core/auth/Account';
import { Storefront, OrderTracking } from '@/public/Storefront';
import { CustomerDetail } from '@/core/customers/CustomerDetail';
import { Subscription } from '@/core/billing/Subscription';
import { Landing } from '@/store/Landing';
import { Configurator } from '@/store/Configurator';
import { Preview } from '@/store/Preview';
import { Cart } from '@/store/Cart';
import { Checkout } from '@/store/Checkout';
import { MyAccount } from '@/store/MyAccount';
import { accountSession } from '@/lib/account';
import { ProductDetail } from '@/core/products/ProductDetail';
import { PurchaseDetail } from '@/core/purchases/PurchaseDetail';

/** Sem sessão de empresa: quem tem conta vai para "minhas empresas"; quem não tem cai na LOJA
 *  (o app abre na escolha do comércio, como pedido). Deep link para uma tela do ERP → login. */
function RequireAuth() {
  const { s } = useSession(); const loc = useLocation();
  if (s) return <Outlet />;
  if (loc.pathname === '/') return <Navigate to={accountSession.get() ? '/minha-conta' : '/comecar'} replace />;
  return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}
/** Rota de módulo: 404 amigável se a empresa não tem o módulo (o back já devolveria 403). */
function RequireModule({ k }: { k: ModuleKey }) {
  const { hasModule } = useSession();
  return hasModule(k) ? <Outlet /> : <div className="card">Este módulo não está ativo para a sua empresa. Adicione em <a href="/assinatura">Assinatura</a> ou ative em <a href="/empresa">Empresa e módulos</a>.</div>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/esqueci-senha', element: <Forgot /> },
  { path: '/redefinir-senha', element: <Reset /> },
  { path: '/definir-senha', element: <Reset invite /> },
  { path: '/conta/esqueci-senha', element: <AccountForgot /> },
  { path: '/conta/redefinir-senha', element: <AccountReset /> },
  // Loja de módulos (pública até o pagamento; checkout e minhas empresas pedem a conta).
  { path: '/comecar', element: <Landing /> },
  { path: '/comecar/:modulo', element: <Configurator /> },
  { path: '/previa', element: <Preview /> },
  { path: '/carrinho', element: <Cart /> },
  { path: '/checkout', element: <Checkout /> },
  { path: '/minha-conta', element: <MyAccount /> },
  // Público (cliente final): vitrine do cardápio e acompanhamento do pedido.
  { path: '/cardapio/:tenant/:menu', element: <Storefront /> },
  { path: '/pedido/:tenant/:numero', element: <OrderTracking /> },
  {
    element: <RequireAuth />,
    children: [{
      element: <Shell />,
      children: [
        { path: '/', element: <Dashboard /> },
        { path: '/pedidos', element: <Orders /> },
        { path: '/pedidos/:id', element: <OrderDetail /> },
        { path: '/clientes', element: <Customers /> },
        { path: '/clientes/:id', element: <CustomerDetail /> },
        { path: '/produtos', element: <Products /> },
        { path: '/produtos/:id', element: <ProductDetail /> },
        { path: '/estoque', element: <Stock /> },
        { path: '/compras', element: <Purchases /> },
        { path: '/compras/:id', element: <PurchaseDetail /> },
        { path: '/financeiro', element: <Finance /> },
        { path: '/usuarios', element: <Users /> },
        { path: '/perfis', element: <Roles /> },
        { path: '/integracoes', element: <Integrations /> },
        { path: '/empresa', element: <Company /> },
        { path: '/auditoria', element: <Audit /> },
        { path: '/conta', element: <Account /> },
        { path: '/assinatura', element: <Subscription /> },
        ...MODULES.map((m) => ({ element: <RequireModule k={m.key} />, children: m.routes })),
        { path: '*', element: <div className="card">Página não encontrada.</div> },
      ],
    }],
  },
]);
