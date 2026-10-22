// src/store/Preview.tsx — "visualizar o ERP" antes de comprar. Mostra o MENU REAL que a empresa
// vai ter (mesmo `buildNav` do Shell, filtrado pelas chaves das funções do carrinho) e, para cada
// tela, o que ela faz e de qual função vem. Régua herdada do Fluxo: prévia não inventa número —
// os blocos são esqueletos e a faixa diz que é prévia.
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorBox, Steps } from '@/components/ui';
import { Sidebar } from '@/components/Sidebar';
import { buildNav, MODULES, type NavItem } from '@/app/modules';
import { accentStyle, NAV_ICON } from '@/app/module-look';
import { useTheme } from '@/app/theme';
import { useCart } from '@/lib/cart';
import { useAccount } from '@/lib/account';
import { useCatalog, useQuote, type Feature } from '@/lib/billing';
import { brl } from '@/lib/format';
import { MODULE_SLUG, StoreLayout } from './shared';

export function Preview() {
  const c = useCart();
  const { data: catalog, error } = useCatalog();
  const { quote } = useQuote(c);
  const account = useAccount();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState('/');

  const { groups, featureOf } = useMemo(() => {
    const byKey = new Map((catalog?.features ?? []).map((f) => [f.key, f]));
    const chosen = (quote?.items ?? []).map((i) => byKey.get(i.key)).filter(Boolean) as Feature[];
    const perms = new Set(chosen.flatMap((f) => f.permissions));
    const owner = new Map<string, Feature>();
    for (const f of chosen) for (const p of f.permissions) owner.set(p, f);
    const mods = new Set(quote?.modules ?? []);
    return {
      groups: buildNav((p) => perms.has(p), (m) => mods.has(m)),
      featureOf: (it: NavItem) => (it.perm ? owner.get(it.perm) : byKey.get('core.base')),
    };
  }, [catalog, quote]);

  if (!c.modules.length) return <Navigate to="/comecar" replace />;
  const m = c.modules[0];
  const items = groups.flatMap((g) => g.items);
  const cur = items.find((i) => i.to === page) ?? items[0];
  const feat = cur ? featureOf(cur) : undefined;
  const modName = MODULES.find((x) => x.key === m)?.label ?? '';

  return (
    <StoreLayout module={m} step={<Steps current={1} />}>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Prévia do seu ERP</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Este é o menu que você vai ter, com as funções que escolheu. Clique nos itens para ver cada tela.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => nav(`/comecar/${MODULE_SLUG[m]}`)}><Icon name="sliders" size={16} /> Ajustar funções</button>
          <button className="btn primary" onClick={() => nav('/carrinho')}><Icon name="cart" size={16} /> Carrinho · {quote ? brl(quote.total) : '…'}</button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="preview-frame">
        <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer' : ''}`} style={accentStyle(m)}>
          <div className="scrim" onClick={() => setDrawer(false)} />
          <Sidebar
            title={modName} kicker="Sua empresa" modules={[{ key: m, label: modName }]} currentModule={m} groups={groups}
            renderItem={(it, inner) => <button key={it.to} className={`sb-item ${cur?.to === it.to ? 'active' : ''}`} onClick={() => { setPage(it.to); setDrawer(false); }} title={collapsed ? it.label : undefined}>{inner}</button>}
            collapsed={collapsed} onCollapse={() => setCollapsed((v) => !v)} theme={theme} setTheme={setTheme}
            user={{ name: account?.account.name ?? 'Você', sub: 'Administrador', avatar: account?.account.avatarUrl }}
          />
          <div className="main">
            <header className="topbar">
              <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                <button className="btn icon hamb" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
                <div><div className="sb-kicker">Empresa</div><div style={{ fontWeight: 750 }}>Sua empresa</div></div>
              </div>
              <span className="badge accent"><Icon name="eye" size={13} /> Prévia</span>
            </header>
            <main className="content">
              {cur && (
                <div className="stack" style={{ gap: 18 }}>
                  <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                    <span className="sb-tile" style={{ width: 44, height: 44 }}><Icon name={NAV_ICON[cur.to] ?? 'dot'} size={22} /></span>
                    <div><h1 style={{ margin: 0 }}>{cur.label}</h1>{feat && <div className="muted small">Parte de <b>{feat.label}</b> · {brl(feat.price)}/mês</div>}</div>
                  </div>
                  {feat && <div className="banner info" style={{ margin: 0 }}><Icon name="info" size={18} /><span className="grow">{feat.description}</span></div>}
                  <div className="grid kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><div className="skel" style={{ height: 10, width: '55%' }} /><div className="skel" style={{ height: 26, width: '70%', marginTop: 14 }} /></div>)}</div>
                  <div className="card stack" style={{ gap: 12 }}>
                    <div className="skel" style={{ height: 12, width: '30%' }} />
                    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="row" style={{ gap: 12, flexWrap: 'nowrap' }}><div className="skel" style={{ height: 12, flex: 2 }} /><div className="skel" style={{ height: 12, flex: 1 }} /><div className="skel" style={{ height: 12, flex: 1 }} /></div>)}
                  </div>
                  <div className="note"><Icon name="info" size={14} /><span>Prévia ilustrativa: as telas mostram os seus dados quando você começar a usar.</span></div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
