// src/store/Landing.tsx — a porta de entrada do app: "qual é o seu comércio?". Os cartões seguem
// o seletor de módulos do Fluxo (ícone em gradiente na cor do módulo, anel ao selecionar).
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorBox, Steps } from '@/components/ui';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { BRAND } from '@/app/brand';
import { cart, useCart } from '@/lib/cart';
import { useAccount } from '@/lib/account';
import { useCatalog } from '@/lib/billing';
import { brl } from '@/lib/format';
import { D } from './money';
import { MODULE_SLUG, StoreLayout } from './shared';
import type { ModuleKey } from '@/lib/session';

export function Landing() {
  const { data: catalog, error } = useCatalog();
  const c = useCart();
  const account = useAccount();
  const nav = useNavigate();
  const sel = c.modules[0] ?? null;
  const go = (m: ModuleKey) => { cart.chooseModule(m); nav(`/comecar/${MODULE_SLUG[m]}`); };

  return (
    <StoreLayout module={sel} step={<Steps current={0} />}>
      <div className="hero">
        <div className="kicker">{account ? `Olá, ${account.account.name.split(' ')[0]} 👋` : BRAND.tagline}</div>
        <h1>Qual é o seu comércio?</h1>
        <p>Escolha o módulo do seu negócio. No próximo passo você liga só as funções que vai usar — e vê o valor na hora.</p>
      </div>
      <ErrorBox error={error} />
      {!catalog ? <div className="mod-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 210, borderRadius: 20 }} />)}</div> : (
        <div className="mod-grid">
          {catalog.modules.map((m) => {
            // "a partir de": o mínimo do módulo (base + obrigatória + dependências), somado do catálogo.
            const req = catalog.features.find((f) => f.module === m.key && f.required)!;
            const keys = new Set(['core.base', req.key, ...(req.requires ?? [])]);
            const from = catalog.features.filter((f) => keys.has(f.key)).reduce((a, f) => a + D(f.price), 0);
            return (
              <button key={m.key} className={`mod-card ${sel === m.key ? 'on' : ''}`} style={accentStyle(m.key)} onClick={() => go(m.key)} data-module={m.key}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="mod-icon"><Icon name={MODULE_LOOK[m.key].icon} size={26} stroke={2} /></span>
                  <span className="radio">{sel === m.key && <Icon name="check" size={14} stroke={3} />}</span>
                </div>
                <div><div className="t">{m.name}</div><div className="s">{m.tagline}</div></div>
                <div className="muted small">{m.forWho}</div>
                <div className="from">a partir de <b className="mono">{brl(from / 100)}</b>/mês</div>
              </button>
            );
          })}
        </div>
      )}
      {catalog && catalog.trialDays > 0 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 28, gap: 18, color: 'var(--muted)', fontWeight: 600, fontSize: 13.5 }}>
          <span className="row" style={{ gap: 6 }}><Icon name="gift" size={16} /> {catalog.trialDays} dias grátis na primeira compra</span>
          <span className="row" style={{ gap: 6 }}><Icon name="sliders" size={16} /> Você escolhe cada função</span>
          <span className="row" style={{ gap: 6 }}><Icon name="undo" size={16} /> Cancele quando quiser</span>
        </div>
      )}
    </StoreLayout>
  );
}
