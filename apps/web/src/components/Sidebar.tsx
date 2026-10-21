// src/components/Sidebar.tsx — a sidebar no desenho do Fluxo: troca de módulo no topo (quando a
// empresa tem mais de um), grupos em caixa-alta, item ativo preenchido com a cor do módulo,
// alternância claro/escuro e o usuário no rodapé. É PRESENTACIONAL: o Shell passa links de
// verdade; a prévia da loja passa botões que só trocam a tela simulada.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Avatar } from './ui';
import { MODULE_LOOK, NAV_ICON } from '@/app/module-look';
import type { NavGroup, NavItem } from '@/app/modules';
import type { ModuleKey } from '@/lib/session';
import type { Theme } from '@/app/theme';

export interface SidebarProps {
  title: string;
  kicker: string;
  modules: { key: ModuleKey; label: string }[];
  currentModule: ModuleKey | null;
  onPickModule?: (m: ModuleKey) => void;
  groups: NavGroup[];
  renderItem: (item: NavItem, inner: ReactNode) => ReactNode;
  collapsed: boolean;
  onCollapse: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  user: { name: string; sub: string; avatar?: string | null };
  onUser?: () => void;
  onLogout?: () => void;
}

export function Sidebar(p: SidebarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const canSwitch = p.modules.length > 1 && !!p.onPickModule;
  const icon = p.currentModule ? MODULE_LOOK[p.currentModule].icon : 'grid';

  return (
    <aside className="sidebar" aria-label="Menu principal">
      <div className="sb-head" ref={ref}>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button className={`sb-switch ${open ? 'open' : ''}`} onClick={() => canSwitch && setOpen((o) => !o)} aria-haspopup={canSwitch ? 'menu' : undefined} aria-expanded={canSwitch ? open : undefined} title={p.title}>
            <span className="sb-tile"><Icon name={icon} size={18} /></span>
            <span className="hide-c" style={{ flex: 1, minWidth: 0 }}>
              <span className="sb-kicker" style={{ display: 'block' }}>{p.kicker}</span>
              <span className="sb-title" style={{ display: 'block' }}>{p.title}</span>
            </span>
            {canSwitch && <Icon name="chevronRight" size={15} className="hide-c" style={{ color: 'var(--faint)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />}
          </button>
          <button className="sb-icon-btn hide-c collapse-btn" onClick={p.onCollapse} title="Recolher menu" aria-label="Recolher menu"><Icon name="chevronsLeft" size={16} /></button>
        </div>
        {open && canSwitch && (
          <div className="sb-drop" role="menu">
            <div className="sb-kicker" style={{ padding: '7px 10px 5px' }}>Trocar de módulo</div>
            {p.modules.map((m) => (
              <button key={m.key} role="menuitem" className={`opt ${m.key === p.currentModule ? 'on' : ''}`} onClick={() => { p.onPickModule!(m.key); setOpen(false); }}>
                <span className="sb-tile" style={{ ['--accent' as string]: MODULE_LOOK[m.key].accent }}><Icon name={MODULE_LOOK[m.key].icon} size={17} /></span>
                <span style={{ flex: 1, fontWeight: 650 }}>{m.label}</span>
                {m.key === p.currentModule && <Icon name="check" size={16} style={{ color: MODULE_LOOK[m.key].accent }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="sb-nav noscroll">
        {p.collapsed && <button className="sb-item" onClick={p.onCollapse} title="Expandir menu" aria-label="Expandir menu" style={{ marginBottom: 6 }}><Icon name="chevronsRight" size={18} /></button>}
        {p.groups.map((g) => (
          <div key={g.key}>
            <div className="sb-group">{g.label}</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {g.items.map((it) => p.renderItem(it, <><Icon name={NAV_ICON[it.to] ?? 'dot'} size={19} stroke={1.7} /><span className="lbl hide-c">{it.label}</span></>))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="seg hide-c" role="group" aria-label="Tema">
          <button className={p.theme === 'light' ? 'on' : ''} onClick={() => p.setTheme('light')}><Icon name="sun" size={15} /> Claro</button>
          <button className={p.theme === 'dark' ? 'on' : ''} onClick={() => p.setTheme('dark')}><Icon name="moon" size={15} /> Escuro</button>
        </div>
        <div className="me">
          <button className="who" onClick={p.onUser} title={p.user.name}>
            <Avatar name={p.user.name} src={p.user.avatar} />
            <span className="hide-c" style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user.name}</span>
              <span className="muted" style={{ display: 'block', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user.sub}</span>
            </span>
          </button>
          {p.onLogout && <button className="sb-icon-btn hide-c" onClick={p.onLogout} title="Sair" aria-label="Sair"><Icon name="logout" size={17} /></button>}
        </div>
      </div>
    </aside>
  );
}
