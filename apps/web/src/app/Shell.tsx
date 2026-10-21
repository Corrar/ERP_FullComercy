// src/app/Shell.tsx — a casca do ERP logado, no desenho do Fluxo: sidebar com troca de módulo,
// tema claro/escuro, gaveta no celular e aviso de assinatura (teste grátis, atraso, suspensão).
// O menu sai de `buildNav` (o mesmo da prévia da loja) com `can()`/`hasModule()` da sessão:
// o front só ESCONDE; quem nega é a API.
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession, type ModuleKey } from '@/lib/session';
import { buildNav, MODULES } from './modules';
import { accentStyle } from './module-look';
import { useTheme } from './theme';
import { BRAND } from './brand';
import { Bell } from '@/core/notifications/Bell';
import { Sidebar } from '@/components/Sidebar';
import { Icon } from '@/components/icons';
import { useGet } from '@/lib/use-api';
import { useAccount } from '@/lib/account';
import { brl, d } from '@/lib/format';
import { daysLeft, METHOD_LABEL, type BillingMethod } from '@/lib/billing';

const MOD_KEY = 'fc.module';

export function Shell() {
  const { s, can, hasModule, logout } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { theme, setTheme } = useTheme();
  const account = useAccount();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('fc.sidebar') === 'c');
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { try { localStorage.setItem('fc.sidebar', collapsed ? 'c' : ''); } catch { /* privado */ } }, [collapsed]);
  useEffect(() => setDrawer(false), [loc.pathname]);

  // Módulo em uso (como no Fluxo): com dois módulos ativos, o menu mostra um de cada vez.
  const mine = MODULES.filter((m) => hasModule(m.key));
  const [cur, setCur] = useState<ModuleKey | null>(() => (localStorage.getItem(MOD_KEY) as ModuleKey | null));
  const current = mine.find((m) => m.key === cur)?.key ?? mine[0]?.key ?? null;
  const pick = (m: ModuleKey) => { setCur(m); try { localStorage.setItem(MOD_KEY, m); } catch { /* privado */ } const first = MODULES.find((x) => x.key === m)?.nav.find((n) => !n.perm || can(n.perm)); if (first) nav(first.to); };
  const groups = useMemo(() => buildNav(can, (m) => m === current), [can, current]);

  const sub = useGet<any>(can('core.billing:manage') ? '/billing/subscription' : null);
  const banner = subscriptionBanner(sub.data);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer' : ''}`} style={accentStyle(current)}>
      <div className="scrim" onClick={() => setDrawer(false)} />
      <Sidebar
        title={current ? mine.find((m) => m.key === current)!.label : BRAND.name}
        kicker={s?.tenant.name ?? 'Módulo'}
        modules={mine.map((m) => ({ key: m.key, label: m.label }))}
        currentModule={current}
        onPickModule={pick}
        groups={groups}
        renderItem={(it, inner) => <NavLink key={it.to} to={it.to} end={it.to === '/' || it.to === '/academia' || it.to === '/servicos'} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`} title={collapsed ? it.label : undefined}>{inner}</NavLink>}
        collapsed={collapsed}
        onCollapse={() => setCollapsed((c) => !c)}
        theme={theme}
        setTheme={setTheme}
        user={{ name: s?.user.name ?? '—', sub: s?.user.email ?? 'Conta' }}
        onUser={() => nav('/conta')}
        onLogout={() => void logout()}
      />
      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
            <button className="btn icon hamb" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
            <div style={{ minWidth: 0 }}>
              <div className="sb-kicker">Empresa</div>
              <div style={{ fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s?.tenant.name}</div>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Bell />
            {account && <Link className="btn hide-sm" to="/minha-conta" title="Minhas empresas e nova compra"><Icon name="building" size={16} /> Minhas empresas</Link>}
          </div>
        </header>
        <main className="content">
          {banner && <div className={`banner ${banner.tone}`}><Icon name={banner.icon} size={18} /><span className="grow">{banner.text}</span>{loc.pathname !== '/assinatura' && <Link className="btn" to="/assinatura">{banner.cta}</Link>}</div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function subscriptionBanner(sub: any): { tone: 'info' | 'warn' | 'danger'; icon: string; text: string; cta: string } | null {
  if (!sub) return null;
  if (sub.tenant?.status === 'SUSPENDED' || sub.tenant?.status === 'CANCELLED') {
    return { tone: 'danger', icon: 'lock', text: sub.status === 'CANCELED' ? 'A assinatura foi encerrada. Reative para voltar a usar o sistema.' : 'Empresa suspensa por falta de pagamento. Regularize para liberar o sistema.', cta: 'Regularizar' };
  }
  if (sub.status === 'PAST_DUE') return { tone: 'danger', icon: 'alert', text: 'Há uma mensalidade em atraso. Atualize o pagamento para evitar a suspensão.', cta: 'Ver fatura' };
  if (sub.status === 'TRIALING') {
    const n = daysLeft(sub.trialEndsAt);
    return { tone: 'info', icon: 'gift', text: `Teste grátis: ${n === 0 ? 'termina hoje' : `falta${n > 1 ? 'm' : ''} ${n} dia${n > 1 ? 's' : ''}`}. Depois, ${brl(sub.amount)}/mês no ${METHOD_LABEL[sub.method as BillingMethod]} a partir de ${d(sub.trialEndsAt)}.`, cta: 'Ver assinatura' };
  }
  if (sub.cancelAtPeriodEnd) return { tone: 'warn', icon: 'info', text: `Cancelamento agendado: o acesso vai até ${d(sub.currentPeriodEnd)}.`, cta: 'Desfazer' };
  return null;
}
