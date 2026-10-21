// src/store/Checkout.tsx — o pagamento. Exige a conta logada (sem ela, o router manda ao login e
// volta). Dados da empresa + forma de pagamento; o cartão é tokenizado no navegador. Quem decide
// preço e teste grátis é o servidor: a confirmação mostra o que ELE devolveu.
import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorBox, Spinner, Steps } from '@/components/ui';
import { acct } from '@/lib/api';
import { accountSession, useAccount } from '@/lib/account';
import { cart, useCart } from '@/lib/cart';
import { session } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { maskDoc, METHOD_LABEL, onlyDigits, tokenizeCard, useCatalog, useQuote, type BillingMethod } from '@/lib/billing';
import { brl, d } from '@/lib/format';
import { BackLink, CopyBox, EMPTY_CARD, ModuleBadge, PaymentForm, StoreLayout, type StripeCardHandle } from './shared';
import { useTurnstile } from '@/lib/turnstile';

export function Checkout() {
  const c = useCart();
  const account = useAccount();
  const { data: catalog, error: cErr } = useCatalog();
  const { quote } = useQuote(c);
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [method, setMethod] = useState<BillingMethod>('CARD');
  const [card, setCard] = useState(EMPTY_CARD);
  const [done, setDone] = useState<any>(null);
  const stripeCard = useRef<StripeCardHandle | null>(null);
  // Checkout é a porta preferida de quem testa cartão roubado: Turnstile da Cloudflare na frente.
  const human = useTurnstile('checkout');
  const stripeKey = catalog?.provider === 'stripe' ? catalog.stripe?.publishableKey ?? null : null;

  /** Cartão → token para a API. Stripe: SetupIntent + confirmação no iframe (3-D Secure se o banco
   *  pedir) → `pm_…`. Simulador: validação e token montados aqui. */
  const cardToken = async () => {
    if (!stripeKey) return tokenizeCard(card, catalog!.provider);
    if (card.name.trim().length < 3) throw new Error('Informe o nome como está no cartão.');
    if (!stripeCard.current) throw new Error('O campo do cartão ainda está carregando. Aguarde um instante.');
    const setup = await acct.post<{ clientSecret: string }>('/account/billing/card-setup');
    return stripeCard.current.confirm(setup.clientSecret, card.name.trim());
  };
  const nav = useNavigate();

  const { run, busy, error } = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) throw new Error('Informe o nome da empresa.');
    if (![11, 14].includes(onlyDigits(doc).length)) throw new Error('Informe um CPF ou CNPJ completo.');
    if (!human.ready) throw new Error('Aguarde a verificação anti-robô terminar.');
    let r;
    try {
      const token = method === 'CARD' ? await cardToken() : undefined;
      r = await acct.post('/account/checkout', { company: { name: name.trim(), document: doc }, modules: c.modules, features: c.features, payment: { method, cardToken: token } }, human.headers());
    } finally { human.reset(); } // token do Turnstile é de uso único
    if (r.trial) accountSession.patch({ trialAvailable: false });
    setDone(r);
  });

  if (!account) return <Navigate to="/login?next=/checkout" replace />;
  if (done) return <Done r={done} onOpen={() => { session.set(done.session); cart.clear(); nav('/', { replace: true }); }} />;
  if (!c.modules.length) return <Navigate to="/comecar" replace />;
  const trial = account.account.trialAvailable && (catalog?.trialDays ?? 0) > 0;

  return (
    <StoreLayout module={c.modules[0]} step={<Steps current={3} />}>
      <BackLink to="/carrinho">Voltar ao carrinho</BackLink>
      <h1 style={{ marginTop: 0 }}>Pagamento</h1>
      <ErrorBox error={cErr} />
      <form className="cfg" onSubmit={(e) => void run(e)}>
        <div className="stack" style={{ gap: 18 }}>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Sua empresa</h2>
            <div className="grid two">
              <label className="field"><span>Nome da empresa</span><input className="input" name="company" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Loja da Maria" required /></label>
              <label className="field"><span>CPF ou CNPJ</span><input className="input mono" name="document" inputMode="numeric" value={maskDoc(doc)} onChange={(e) => setDoc(onlyDigits(e.target.value))} placeholder="000.000.000-00" required /></label>
            </div>
            <div className="muted small">A conta <b>{account.account.email}</b> será a administradora. Depois você convida a equipe.</div>
          </section>
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Forma de pagamento da assinatura</h2>
            {catalog && <PaymentForm methods={catalog.methods} method={method} setMethod={setMethod} card={card} setCard={setCard} stripeKey={stripeKey} onStripe={(h) => { stripeCard.current = h; }} />}
          </section>
        </div>
        <aside className="summary">
          <div className="card stack" style={{ gap: 14 }}>
            <div className="row between"><strong>Resumo</strong>{catalog && <ModuleBadge m={c.modules[0]} catalog={catalog} />}</div>
            <div className="line"><span>{quote?.items.length ?? '…'} funções</span><b className="mono">{quote ? brl(quote.total) : '—'}/mês</b></div>
            {trial ? <>
              <div className="line"><span>Pagar hoje</span><b className="mono">{brl(0)}</b></div>
              <div className="trial"><Icon name="gift" size={18} /><span>{catalog!.trialDays} dias grátis. A primeira cobrança ({METHOD_LABEL[method]}) é em {d(new Date(Date.now() + catalog!.trialDays * 86_400_000))}.</span></div>
            </> : <div className="line"><span>Pagar hoje</span><b className="mono">{quote ? brl(quote.total) : '—'}</b></div>}
            <ErrorBox error={error} />
            <div className="ts-slot" ref={human.slot} />
            <ErrorBox error={human.error} />
            <button className="btn primary lg block" disabled={busy || !quote || !catalog || !human.ready}>{busy ? <Spinner /> : <Icon name="check" />} {trial ? 'Começar teste grátis' : 'Assinar e pagar'}</button>
            <div className="muted small" style={{ textAlign: 'center' }}>Assinatura mensal. Altere funções ou cancele quando quiser, pelo próprio sistema.</div>
          </div>
        </aside>
      </form>
    </StoreLayout>
  );
}

function Done({ r, onOpen }: { r: any; onOpen: () => void }) {
  const inv = r.firstInvoice;
  const failed = inv?.status === 'FAILED';
  return (
    <StoreLayout module={r.session.modules[0]}>
      <div className="card stack" style={{ maxWidth: 620, margin: '20px auto', padding: 28, gap: 18, textAlign: 'center' }}>
        <span className="mod-icon" style={{ margin: '0 auto', background: failed ? 'var(--warn)' : undefined }}><Icon name={failed ? 'alert' : 'check'} size={28} stroke={2.4} /></span>
        <div>
          <h1 style={{ margin: 0 }}>{failed ? 'Empresa criada — pagamento pendente' : 'Seu ERP está pronto!'}</h1>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {r.trial ? <>Teste grátis até <b>{d(r.trialEndsAt)}</b>. Depois, {brl(r.amount)}/mês.</>
              : failed ? <>O pagamento foi recusado ({inv.failureReason}). Troque a forma de pagamento em <b>Assinatura</b>.</>
              : inv?.status === 'PAID' ? <>Primeira mensalidade de {brl(r.amount)} paga.</>
              : <>Mensalidade de {brl(r.amount)} gerada.</>}
          </p>
        </div>
        {r.paymentInfo?.pixAuthorizationQr && r.paymentInfo.pixStatus === 'PENDING' && (
          <div style={{ textAlign: 'left' }}><CopyBox label="Autorize o Pix Automático no app do seu banco (Pix copia e cola)" value={r.paymentInfo.pixAuthorizationQr} /></div>
        )}
        {inv?.boletoLine && inv.status === 'OPEN' && (
          <div style={{ textAlign: 'left' }} className="stack">
            <CopyBox label={`Boleto — vence em ${d(inv.dueAt)}`} value={inv.boletoLine} />
            {inv.boletoUrl && <a className="btn soft" href={inv.boletoUrl} target="_blank" rel="noreferrer"><Icon name="barcode" size={16} /> Abrir boleto (PDF)</a>}
          </div>
        )}
        {inv?.pixCode && inv.status === 'OPEN' && !inv.boletoLine && <div style={{ textAlign: 'left' }}><CopyBox label="Pague a primeira mensalidade por Pix" value={inv.pixCode} /></div>}
        <button className="btn primary lg block" onClick={onOpen}>Abrir meu ERP <Icon name="arrowRight" /></button>
      </div>
    </StoreLayout>
  );
}
