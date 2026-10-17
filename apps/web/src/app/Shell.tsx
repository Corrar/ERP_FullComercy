import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '@/lib/session';
import { ADMIN_NAV, CORE_NAV, MODULES, type NavItem } from './modules';
import { Bell } from '@/core/notifications/Bell';

export function Shell() {
  const { s, can, hasModule, logout } = useSession();
  const nav = useNavigate();
  const item = (n: NavItem) => (!n.perm || can(n.perm)) && <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">FullComercy<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{s?.tenant.name}</div></div>
        <div className="group">Núcleo</div>
        {CORE_NAV.map(item)}
        {MODULES.filter((m) => hasModule(m.key)).map((m) => (
          <div key={m.key}><div className="group">{m.label}</div>{m.nav.map(item)}</div>
        ))}
        <div className="group">Administração</div>
        {ADMIN_NAV.map(item)}
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="muted">{s?.user.name}</div>
          <div className="row">
            <Bell />
            <button className="btn" onClick={() => nav('/conta')}>Minha conta</button>
            <button className="btn" onClick={() => void logout()}>Sair</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
