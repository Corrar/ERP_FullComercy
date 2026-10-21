// src/store/shared.tsx — peças da LOJA DE MÓDULOS usadas em mais de uma tela: o topo da loja,
// a lista de funções com interruptor e preço, o resumo com o total do servidor e o formulário
// de pagamento (que a tela de Assinatura do ERP também usa para trocar o meio).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Avatar, Modal, Switch } from '@/components/ui';
import { BRAND } from '@/app/brand';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { useTheme } from '@/app/theme';
import { useAccount } from '@/lib/account';
import { useCart } from '@/lib/cart';
import { brl } from '@/lib/format';
import { useCatalog, BRAND_LABEL, cardBrand, maskCard, maskExp, METHOD_LABEL, onlyDigits, type BillingMethod, type CardInput, type Catalog, type Feature, type Quote } from '@/lib/billing';
import type { ModuleKey } from '@/lib/session';
import { cardStyle, getStripe, stripeErrorMessage } from '@/lib/stripe';
import DEMOS_JSON from './demos.json';

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

/** "← Voltar" das etapas da loja. Vai a um destino FIXO, não ao histórico: quem chega ao pagamento
 *  vindo do login voltaria para o login. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  const nav = useNavigate();
  return <button type="button" className="linkish row" style={{ gap: 4, marginBottom: 8 }} onClick={() => nav(to)}><Icon name="arrowLeft" size={15} /> {children}</button>;
}

export function StoreLayout({ module, children, step }: { module?: ModuleKey | null; children: ReactNode; step?: ReactNode }) {
  const account = useAccount();
  const c = useCart();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const { data: catalog } = useCatalog();
  // Fora de produção nada é cobrado de verdade: a loja diz isso em toda tela (ninguém digita cartão
  // achando que vai ser cobrado, nem acredita que pagou). Com Stripe, a conta está em modo de teste.
  const demo = catalog && catalog.stage !== 'production'
    ? (catalog.provider === 'stripe'
      ? 'Ambiente de demonstração: Stripe em modo de teste, nada é cobrado. Cartão 4242 4242 4242 4242, validade futura e qualquer CVV.'
      : 'Ambiente de demonstração: pagamentos simulados, nada é cobrado. Cartão de teste 4242 4242 4242 4242.')
    : null;
  return (
    <div className="store" style={accentStyle(module)}>
      {demo && <div className="demo-strip" role="note"><Icon name="info" size={15} /> {demo}</div>}
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
/** Funções com vídeo de demonstração (gerado por `npm run demos`; `v` muda a cada regravação). */
const DEMOS = DEMOS_JSON as Record<string, { duracao: number; v?: string }>;
const demoSrc = (key: string, ext: 'mp4' | 'webm' | 'jpg') => `/demos/${key}.${ext}${DEMOS[key]?.v ? `?v=${DEMOS[key].v}` : ''}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** H.264 primeiro (Safari/iPhone); VP9 para navegador sem H.264. O <video> pega o primeiro que conhece. */
const DemoSources = ({ k }: { k: string }) => <><source src={demoSrc(k, 'mp4')} type="video/mp4" /><source src={demoSrc(k, 'webm')} type="video/webm" /></>;
/** Prévia no hover só com mouse de verdade e sem pedido de menos movimento. */
const previewOnHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;

interface FeatState { on: boolean; locked: boolean; why: string | null }

/** A "tela" da função no card: capa; no hover toca o vídeo (só baixa aí); clique abre o player. */
function FeatureMedia({ f, onOpen }: { f: Feature; onOpen: () => void }) {
  const demo = DEMOS[f.key];
  const vid = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const [armed, setArmed] = useState(false); // o <video> (e o download) só nasce no primeiro hover
  // Toca/para DEPOIS do render: no próprio mouseenter o <video> ainda não existe.
  useEffect(() => {
    const v = vid.current; if (!v) return;
    if (hover) void v.play().catch(() => {}); else { v.pause(); v.currentTime = 0; }
  }, [hover, armed]);
  if (!demo) {
    return <div className="feat-media empty" aria-hidden><Icon name={FEATURE_ICON[f.key] ?? 'dot'} size={34} stroke={1.6} /></div>;
  }
  const enter = () => { if (!previewOnHover()) return; setArmed(true); setHover(true); };
  const leave = () => setHover(false);
  return (
    <button type="button" className={`feat-media ${hover ? 'playing' : ''}`} onClick={(e) => { e.stopPropagation(); onOpen(); }} onMouseEnter={enter} onMouseLeave={leave} aria-label={`Ver demonstração: ${f.label}`}>
      <img src={demoSrc(f.key, 'jpg')} alt="" loading="lazy" decoding="async" />
      {armed && <video ref={vid} muted loop playsInline preload="auto" aria-hidden><DemoSources k={f.key} /></video>}
      <span className="feat-play"><Icon name="play" size={13} className="fill" /> Ver demonstração · {mmss(demo.duracao)}</span>
    </button>
  );
}

/** Player grande: o vídeo da função + o que ela faz + adicionar/remover dali mesmo. */
function DemoModal({ f, st, onClose, onToggle }: { f: Feature; st: FeatState; onClose: () => void; onToggle: () => void }) {
  return (
    <Modal title={f.label} open onClose={onClose} wide>
      {/* O modal vai para o <body> (portal) e perde a cor do módulo: reaplica aqui. */}
      <div style={f.module ? accentStyle(f.module as ModuleKey) : undefined}>
      <div className="demo-player">
        <video poster={demoSrc(f.key, 'jpg')} autoPlay muted loop playsInline controls><DemoSources k={f.key} /></video>
      </div>
      <p className="muted" style={{ margin: '14px 0 16px' }}>{f.description}</p>
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="feat-price">{brl(f.price)}<small>/mês</small></div>
        {st.locked
          ? <span className="badge"><Icon name="lock" size={12} /> {st.why}</span>
          : <button className={`btn ${st.on ? '' : 'primary'}`} onClick={() => { onToggle(); onClose(); }}><Icon name={st.on ? 'minus' : 'plus'} /> {st.on ? 'Remover do meu ERP' : 'Adicionar ao meu ERP'}</button>}
      </div>
      </div>
    </Modal>
  );
}

function FeatureCard({ f, st, onToggle, onOpen }: { f: Feature; st: FeatState; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className={`feat ${st.on ? 'on' : ''} ${st.locked ? 'locked' : ''}`} onClick={() => !st.locked && onToggle()} data-feature={f.key}>
      <FeatureMedia f={f} onOpen={onOpen} />
      {st.on && <span className="feat-check" aria-hidden><Icon name="check" size={14} stroke={2.6} /></span>}
      <div className="feat-body">
        <div className="name"><span className="ico"><Icon name={FEATURE_ICON[f.key] ?? 'dot'} size={15} /></span>{f.label}</div>
        {st.why && <span className="badge feat-why"><Icon name="lock" size={11} /> {st.why}</span>}
        <div className="desc">{f.description}</div>
        <div className="feat-foot">
          <div className="feat-price">{brl(f.price)}<small>/mês</small></div>
          <Switch on={st.on} disabled={st.locked} onChange={() => onToggle()} label={`${st.on ? 'Remover' : 'Adicionar'} ${f.label}`} />
        </div>
      </div>
    </div>
  );
}

export function FeatureList({ catalog, modules, quote, selected, onToggle }: { catalog: Catalog; modules: ModuleKey[]; quote: Quote | null; selected: string[]; onToggle: (key: string) => void }) {
  const byKey = new Map(catalog.features.map((f) => [f.key, f]));
  const items = new Map((quote?.items ?? []).map((i) => [i.key, i]));
  const [open, setOpen] = useState<string | null>(null);
  const state = (f: Feature): FeatState => {
    const it = items.get(f.key);
    const locked = !!it && it.reason !== 'selected';
    const why = it?.reason === 'required' ? (f.module ? 'Essencial do módulo' : 'Incluído em todo ERP') : it?.reason === 'dependency' ? `Exigido por ${byKey.get(it.requiredBy ?? '')?.label ?? 'outra função'}` : null;
    return { on: !!it || selected.includes(f.key), locked, why };
  };
  const card = (f: Feature) => <FeatureCard key={f.key} f={f} st={state(f)} onToggle={() => onToggle(f.key)} onOpen={() => setOpen(f.key)} />;
  const aberto = open ? byKey.get(open) : undefined;
  return (
    <div className="stack" style={{ gap: 28 }}>
      {modules.map((m) => {
        const off = catalog.modules.find((x) => x.key === m)!;
        return (
          <section key={m} className="stack" style={{ ...accentStyle(m), gap: 14 }}>
            <div><h2 style={{ margin: 0 }}>Funções de {off.name}</h2><div className="muted small">O que é exclusivo do seu tipo de comércio. Passe o mouse ou toque na tela para ver funcionando.</div></div>
            <div className="feat-grid">{catalog.features.filter((f) => f.module === m).map(card)}</div>
          </section>
        );
      })}
      <section className="stack" style={{ gap: 14 }}>
        <div><h2 style={{ margin: 0 }}>Núcleo do sistema</h2><div className="muted small">Serve a qualquer comércio. Ligue só o que vai usar.</div></div>
        <div className="feat-grid">{catalog.features.filter((f) => !f.module).map(card)}</div>
      </section>
      {aberto && <DemoModal f={aberto} st={state(aberto)} onClose={() => setOpen(null)} onToggle={() => onToggle(aberto.key)} />}
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

/** O que o formulário entrega a quem envia: confirma o cartão no Stripe e devolve o `pm_…`. */
export interface StripeCardHandle { confirm(clientSecret: string, name: string): Promise<string> }

/** Campo do cartão do Stripe (iframe de js.stripe.com). Avisa o pai quando está pronto. */
function StripeCard({ publishableKey, onReady }: { publishableKey: string; onReady: (h: StripeCardHandle | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let card: any; let alive = true;
    getStripe(publishableKey).then((stripe) => {
      if (!alive || !ref.current) return;
      card = stripe.elements({ locale: 'pt-BR' }).create('card', { hidePostalCode: true, style: cardStyle() });
      card.mount(ref.current);
      card.on('ready', () => setLoading(false));
      card.on('change', (e: { error?: { message?: string } }) => setErr(e.error?.message ?? null));
      onReady({
        async confirm(clientSecret, name) {
          const r = await stripe.confirmCardSetup(clientSecret, { payment_method: { card, billing_details: { name } } });
          if (r.error) throw new Error(stripeErrorMessage(r.error));
          const pm = r.setupIntent.payment_method;
          return typeof pm === 'string' ? pm : pm.id;
        },
      });
    }, (e: Error) => { setErr(e.message); setLoading(false); });
    return () => { alive = false; card?.destroy(); onReady(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishableKey]);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {/* O Stripe troca TODO o conteúdo do elemento onde monta: ele fica sem filhos do React (um
          filho ali some por baixo do React e derruba a tela ao desmontar). O aviso vai ao lado. */}
      <div className="stripe-wrap">
        <div className="input stripe-field" ref={ref} aria-label="Dados do cartão" data-testid="stripe-card" />
        {loading && <span className="stripe-loading faint small">Carregando campo seguro do cartão…</span>}
      </div>
      {err && <div className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>{err}</div>}
    </div>
  );
}

export function PaymentForm({ methods, method, setMethod, card, setCard, stripeKey, onStripe }: { methods: BillingMethod[]; method: BillingMethod; setMethod: (m: BillingMethod) => void; card: CardInput; setCard: (c: CardInput) => void; stripeKey?: string | null; onStripe?: (h: StripeCardHandle | null) => void }) {
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
      {method === 'CARD' && stripeKey && (
        <div className="stack">
          <label className="field"><span>Nome no cartão</span><input className="input" autoComplete="cc-name" placeholder="Como está impresso" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></label>
          <label className="field"><span>Cartão</span></label>
          <StripeCard publishableKey={stripeKey} onReady={(h) => onStripe?.(h)} />
          <div className="note"><Icon name="shield" size={14} /><span>Pagamento processado pelo Stripe. O número do cartão vai direto para o Stripe (nem o sistema nem a API o veem); o banco pode pedir uma confirmação.</span></div>
          <div className="note"><Icon name="info" size={14} /><span>Ao confirmar, você autoriza a cobrança mensal do valor do seu plano neste cartão até cancelar a assinatura, que pode ser feito a qualquer momento no menu Assinatura.</span></div>
        </div>
      )}
      {method === 'CARD' && !stripeKey && (
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
