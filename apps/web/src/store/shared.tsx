// src/store/shared.tsx — peças da LOJA DE MÓDULOS usadas em mais de uma tela: o topo da loja,
// a lista de funções com interruptor e preço, o resumo com o total do servidor e o formulário
// de pagamento (que a tela de Assinatura do ERP também usa para trocar o meio).
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Avatar, Switch } from '@/components/ui';
import { BRAND } from '@/app/brand';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { useTheme } from '@/app/theme';
import { useAccount } from '@/lib/account';
import { useCart } from '@/lib/cart';
import { brl } from '@/lib/format';
import { useCatalog, BRAND_LABEL, cardBrand, maskCard, maskExp, METHOD_LABEL, onlyDigits, type BillingMethod, type CardInput, type Catalog, type Feature, type Quote } from '@/lib/billing';
import type { ModuleKey } from '@/lib/session';

export const MODULE_SLUG: Record<ModuleKey, string> = { VAREJO: 'varejo', FOOD: 'food', ACADEMIA: 'academia', SERVICOS: 'servicos' };
export const slugToModule = (s?: string): ModuleKey | null => (Object.entries(MODULE_SLUG).find(([, v]) => v === s)?.[0] as ModuleKey) ?? null;

/** Ícone de cada função na lista do configurador. */
const FEATURE_ICON: Record<string, string> = {
  'core.base': 'home', 'core.clientes': 'users', 'core.produtos': 'box', 'core.pedidos': 'receipt', 'core.compras': 'truck', 'core.financeiro': 'dollar', 'core.cobranca': 'qr', 'core.integracoes': 'link',
  'varejo.pdv': 'monitor', 'varejo.grade': 'grid', 'varejo.etiquetas': 'tag', 'varejo.comissoes': 'users', 'varejo.devolucoes': 'undo', 'varejo.relatorios': 'chart',
  'food.salao': 'utensils', 'food.cozinha': 'flame', 'food.delivery': 'truck', 'food.relatorios': 'chart',
  'gym.matriculas': 'clipboard', 'gym.recepcao': 'userCheck', 'gym.catraca': 'idCard', 'gym.turmas': 'calendar',
  'svc.os': 'clipboard', 'svc.veiculos': 'car', 'svc.agenda': 'calendar', 'svc.relatorios': 'chart',
};

export function StoreLayout({ module, children, step }: { module?: ModuleKey | null; children: ReactNode; step?: ReactNode }) {
  const account = useAccount();
  const c = useCart();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const { data: catalog } = useCatalog();
  // Fora de produção a cobrança é simulada: a loja diz isso em toda tela (ninguém digita cartão
  // achando que vai ser cobrado de verdade, nem acredita que pagou).
  const demo = catalog && catalog.stage !== 'production' && catalog.provider === 'mock';
  return (
    <div className="store" style={accentStyle(module)}>
      {demo && <div className="demo-strip" role="note"><Icon name="info" size={15} /> Ambiente de demonstração: pagamentos simulados, nada é cobrado. Cartão de teste 4242 4242 4242 4242.</div>}
      <header className="store-top">
        <Link to="/comecar" className="brand" aria-label={`${BRAND.name} — início`}><span className="brand-mark"><Icon name="grid" size={18} stroke={2.2} /></span><span className="hide-sm">{BRAND.name}</span></Link>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn icon ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema" title="Tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="btn icon ghost" onClick={() => nav('/carrinho')} aria-label="Carrinho" title="Carrinho" style={{ position: 'relative' }}>
            <Icon name="cart" />{c.modules.length > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
          </button>
          {account
            ? <button className="btn ghost" onClick={() => nav('/minha-conta')} style={{ paddingLeft: 6 }}><Avatar name={account.account.name} src={account.account.avatarUrl} /><span className="hide-sm">{account.account.name.split(' ')[0]}</span></button>
            : <Link className="btn" to="/login">Entrar</Link>}
        </div>
      </header>
      <div className="store-body">{step}{children}</div>
    </div>
  );
}

export function ModuleBadge({ m, catalog }: { m: ModuleKey; catalog: Catalog }) {
  const off = catalog.modules.find((x) => x.key === m);
  return <span className="badge accent" style={accentStyle(m)}><Icon name={MODULE_LOOK[m].icon} size={13} /> {off?.name ?? m}</span>;
}

/**
 * As funções de um módulo + as do núcleo, com interruptor. Ligado/travado vem do ORÇAMENTO do
 * servidor (motivo `required`/`dependency`), não de regra repetida aqui.
 */
export function FeatureList({ catalog, modules, quote, selected, onToggle }: { catalog: Catalog; modules: ModuleKey[]; quote: Quote | null; selected: string[]; onToggle: (key: string) => void }) {
  const byKey = new Map(catalog.features.map((f) => [f.key, f]));
  const items = new Map((quote?.items ?? []).map((i) => [i.key, i]));
  const row = (f: Feature) => {
    const it = items.get(f.key);
    const on = !!it || selected.includes(f.key);
    const locked = !!it && it.reason !== 'selected';
    const why = it?.reason === 'required' ? (f.module ? 'Essencial do módulo' : 'Incluído em todo ERP') : it?.reason === 'dependency' ? `Exigido por ${byKey.get(it.requiredBy ?? '')?.label ?? 'outra função'}` : null;
    return (
      <div key={f.key} className={`feat ${on ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={() => !locked && onToggle(f.key)} data-feature={f.key}>
        <span className="ico"><Icon name={FEATURE_ICON[f.key] ?? 'dot'} size={19} /></span>
        <div className="body">
          <div className="name">{f.label}{why && <span className="badge"><Icon name="lock" size={11} /> {why}</span>}</div>
          <div className="desc">{f.description}</div>
        </div>
        <div className="price">{brl(f.price)}<small>/mês</small></div>
        <Switch on={on} disabled={locked} onChange={() => onToggle(f.key)} label={`${on ? 'Remover' : 'Adicionar'} ${f.label}`} />
      </div>
    );
  };
  return (
    <div className="stack" style={{ gap: 22 }}>
      {modules.map((m) => {
        const off = catalog.modules.find((x) => x.key === m)!;
        return (
          <section key={m} className="stack" style={accentStyle(m)}>
            <div><h2 style={{ margin: 0 }}>Funções de {off.name}</h2><div className="muted small">O que é exclusivo do seu tipo de comércio.</div></div>
            {catalog.features.filter((f) => f.module === m).map(row)}
          </section>
        );
      })}
      <section className="stack">
        <div><h2 style={{ margin: 0 }}>Núcleo do sistema</h2><div className="muted small">Serve a qualquer comércio. Ligue só o que vai usar.</div></div>
        {catalog.features.filter((f) => !f.module).map(row)}
      </section>
    </div>
  );
}

/** Resumo com o total que o SERVIDOR calculou. `actions` são os botões do contexto. */
export function Summary({ catalog, quote, trialAvailable, actions, title = 'Seu ERP' }: { catalog: Catalog; quote: Quote | null; trialAvailable: boolean; actions?: ReactNode; title?: string }) {
  return (
    <aside className="summary bar-on-mobile">
      <div className="card stack" style={{ gap: 14 }}>
        <div className="row between"><strong>{title}</strong>{quote && <span className="muted small">{quote.items.length} funções</span>}</div>
        <div className="row" style={{ gap: 6 }}>{quote?.modules.map((m) => <ModuleBadge key={m} m={m} catalog={catalog} />)}</div>
        <div>
          <div className="total mono" data-testid="total">{quote ? brl(quote.total) : '—'} <small>/mês</small></div>
        </div>
        {trialAvailable && catalog.trialDays > 0 && <div className="trial"><Icon name="gift" size={18} /><span>{catalog.trialDays} dias grátis na primeira compra. A cobrança só começa depois.</span></div>}
        <div style={{ maxHeight: 260, overflow: 'auto' }} className="scroll">
          {quote?.items.map((i) => <div key={i.key} className="line"><span>{i.label}</span><span className="mono">{brl(i.price)}</span></div>)}
        </div>
        {actions && <div className="stack" style={{ gap: 10 }}>{actions}</div>}
      </div>
    </aside>
  );
}

export function MobileBar({ quote, children }: { quote: Quote | null; children: ReactNode }) {
  return <div className="mobile-bar"><div className="tot"><span className="muted small">Total por mês</span><b className="mono">{quote ? brl(quote.total) : '—'}</b></div>{children}</div>;
}

// ── Pagamento ─────────────────────────────────────────────────────────────────────────────
export const EMPTY_CARD: CardInput = { number: '', name: '', exp: '', cvc: '' };
const METHOD_INFO: Record<BillingMethod, { icon: string; sub: string }> = {
  CARD: { icon: 'card', sub: 'Débito automático todo mês' },
  BOLETO: { icon: 'barcode', sub: 'Um boleto por mês, vence em 3 dias' },
  PIX_AUTO: { icon: 'qr', sub: 'Autorize uma vez no app do banco' },
};

export function PaymentForm({ methods, method, setMethod, card, setCard }: { methods: BillingMethod[]; method: BillingMethod; setMethod: (m: BillingMethod) => void; card: CardInput; setCard: (c: CardInput) => void }) {
  const [flip, setFlip] = useState(false);
  const brand = cardBrand(card.number);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="pay-opts" role="radiogroup" aria-label="Forma de pagamento">
        {methods.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={`pay-opt ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>
            <span className="row" style={{ width: '100%', justifyContent: 'space-between' }}><Icon name={METHOD_INFO[m].icon} size={22} /><span className={`radio ${method === m ? 'on' : ''}`}>{method === m && <Icon name="check" size={13} stroke={3} />}</span></span>
            {METHOD_LABEL[m]}<small>{METHOD_INFO[m].sub}</small>
          </button>
        ))}
      </div>
      {method === 'CARD' && (
        <div className="grid two" style={{ alignItems: 'start' }}>
          <div className="card-preview" aria-hidden="true">
            <div className="row between"><span style={{ fontWeight: 800 }}>{BRAND_LABEL[brand]}</span><Icon name="card" size={22} /></div>
            <div className="num">{flip ? '•••• •••• •••• ••••' : (maskCard(card.number) || '0000 0000 0000 0000')}</div>
            <div className="row between small"><span style={{ textTransform: 'uppercase', fontWeight: 600, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name || 'Nome no cartão'}</span><span>{card.exp || 'MM/AA'}</span></div>
          </div>
          <div className="stack">
            <label className="field"><span>Número do cartão</span><input className="input mono" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={maskCard(card.number)} onChange={(e) => setCard({ ...card, number: onlyDigits(e.target.value) })} /></label>
            <label className="field"><span>Nome no cartão</span><input className="input" autoComplete="cc-name" placeholder="Como está impresso" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field"><span>Validade</span><input className="input mono" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={card.exp} onChange={(e) => setCard({ ...card, exp: maskExp(e.target.value) })} /></label>
              <label className="field"><span>CVV</span><input className="input mono" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onFocus={() => setFlip(true)} onBlur={() => setFlip(false)} onChange={(e) => setCard({ ...card, cvc: onlyDigits(e.target.value).slice(0, 4) })} /></label>
            </div>
            <div className="note"><Icon name="shield" size={14} /><span>O número do cartão é enviado direto ao gateway de pagamento; o sistema guarda só a bandeira e o final.</span></div>
          </div>
        </div>
      )}
      {method === 'BOLETO' && <div className="banner info" style={{ margin: 0 }}><Icon name="barcode" size={18} /><span className="grow">Todo mês um boleto é emitido com vencimento em 3 dias. Você recebe a linha digitável e o PDF aqui no sistema.</span></div>}
      {method === 'PIX_AUTO' && <div className="banner info" style={{ margin: 0 }}><Icon name="qr" size={18} /><span className="grow">Depois de confirmar, você recebe um código para autorizar o Pix Automático no app do seu banco. A mensalidade passa a ser debitada sozinha, no valor do seu plano.</span></div>}
    </div>
  );
}

export function CopyBox({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between"><span className="small" style={{ fontWeight: 700 }}>{label}</span><button type="button" className="btn soft" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}><Icon name={ok ? 'check' : 'copy'} size={15} /> {ok ? 'Copiado' : 'Copiar'}</button></div>
      <div className="code-box">{value}</div>
    </div>
  );
}
