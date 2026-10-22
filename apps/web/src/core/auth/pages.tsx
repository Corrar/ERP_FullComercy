// src/core/auth/pages.tsx — entrar, criar conta, esqueci/redefinir senha. Desenho do login do
// Fluxo: painel de marca à esquerda, formulário com campos em pílula numa costura curva.
//
// Duas portas, ditas na tela:
//   • CONTA (padrão): quem compra o ERP. E-mail + senha ou Google. É o que a loja exige para
//     finalizar a compra, e o que abre as empresas da conta.
//   • FUNCIONÁRIO: quem foi convidado para uma empresa entra com o identificador da empresa,
//     e-mail e senha (o login de sempre, `POST /auth/login`).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { acct, api, post, pub } from '@/lib/api';
import { useTurnstile } from '@/lib/turnstile';
import { accountSession } from '@/lib/account';
import { cart } from '@/lib/cart';
import { session } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { useCatalog } from '@/lib/billing';
import { mockGoogleCredential, renderGoogleButton } from '@/lib/google';
import { ErrorBox, Modal, Spinner } from '@/components/ui';
import { GoogleG, Icon } from '@/components/icons';
import { BRAND } from '@/app/brand';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-brand">
        <Link to="/comecar" className="brand" style={{ color: '#fff' }}><span className="brand-mark" style={{ background: 'rgba(255,255,255,.16)', boxShadow: 'none' }}><Icon name="grid" size={18} stroke={2.2} /></span>{BRAND.name}</Link>
        <h1>O ERP do<br />seu comércio,<br /><span>do seu jeito.</span></h1>
        <ul>
          <li><Icon name="sliders" size={18} /> Escolha só as funções que vai usar</li>
          <li><Icon name="gift" size={18} /> 7 dias grátis na primeira compra</li>
          <li><Icon name="monitor" size={18} /> No computador, tablet e celular</li>
        </ul>
      </div>
      <div className="auth-form">
        <div className="row between">
          <Link to="/comecar" className="brand"><span className="brand-mark"><Icon name="grid" size={18} stroke={2.2} /></span>{BRAND.name}</Link>
          <Link to="/comecar" className="linkish small">Montar meu ERP</Link>
        </div>
        {children}
        <div className="auth-foot"><span>© {new Date().getFullYear()} {BRAND.name}</span><span className="row" style={{ gap: 6 }}><Icon name="shield" size={14} /> Conexão segura</span></div>
      </div>
    </div>
  );
}

function PasswordInput({ name, placeholder, autoComplete, minLength }: { name: string; placeholder: string; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pill-wrap">
      <input className="pill" style={{ paddingRight: 52 }} type={show ? 'text' : 'password'} name={name} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required />
      <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
    </div>
  );
}

/** Depois de entrar na CONTA: volta para onde ia (ex.: pagamento) ou abre o ERP da conta. */
async function afterAccount(next: string | null, go: (to: string) => void) {
  if (next) return go(next);
  const me = await acct.get('/account/me');
  if (me.companies.length === 1) {
    session.set(await acct.post(`/account/companies/${me.companies[0].id}/session`));
    return go('/');
  }
  if (me.companies.length > 1) return go('/minha-conta');
  return go(cart.get().modules.length ? '/carrinho' : '/comecar');
}

function GoogleButton({ onCredential, busy }: { onCredential: (c: string) => void; busy: boolean }) {
  const { data: catalog } = useCatalog();
  const ref = useRef<HTMLDivElement>(null);
  const [mock, setMock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mode = catalog?.google.mode ?? 'off';
  useEffect(() => {
    if (mode === 'real' && ref.current && catalog?.google.clientId) renderGoogleButton(ref.current, catalog.google.clientId, onCredential).catch((e) => setErr(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  if (mode === 'real') return (
    <>
      {/* A pílula é só o desenho; o clique cai no botão do Google por cima (transparente). */}
      <div className="google-real">
        <div className="btn-pill google" aria-hidden><GoogleG size={20} /> Continuar com o Google</div>
        <div ref={ref} className="google-real-layer" />
      </div>
      {err && <ErrorBox error={err} />}
    </>
  );
  return (
    <>
      <button type="button" className="btn-pill google" disabled={busy || mode === 'off'} onClick={() => setMock(true)} title={mode === 'off' ? 'Login com Google não configurado neste ambiente (GOOGLE_CLIENT_ID)' : undefined}>
        <GoogleG size={20} /> Continuar com o Google
      </button>
      {mode === 'off' && <div className="faint small" style={{ textAlign: 'center', marginTop: -6 }}>Login com Google indisponível neste ambiente.</div>}
      <Modal title="Google (simulação de desenvolvimento)" open={mock} onClose={() => setMock(false)}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); const f = new FormData(e.currentTarget); setMock(false); onCredential(mockGoogleCredential(String(f.get('email')), String(f.get('name')))); }}>
          <div className="muted small">Este ambiente não tem o Google configurado; a API aceita uma conta Google simulada (GOOGLE_AUTH_MOCK=1, recusado em produção).</div>
          <label className="field"><span>E-mail da conta Google</span><input className="input" name="email" type="email" required autoFocus /></label>
          <label className="field"><span>Nome</span><input className="input" name="name" required /></label>
          <button className="btn primary">Continuar</button>
        </form>
      </Modal>
    </>
  );
}

export function Login() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [q] = useSearchParams();
  const next = q.get('next') ?? loc.state?.from ?? null;
  const [mode, setMode] = useState<'entrar' | 'cadastro' | 'funcionario'>(q.get('modo') === 'cadastro' ? 'cadastro' : q.get('modo') === 'funcionario' ? 'funcionario' : 'entrar');
  // O e-mail de boas-vindas abre esta tela já com a empresa e o e-mail de quem comprou.
  const [tenant, setTenant] = useState(q.get('empresa') ?? localStorage.getItem('fc.tenant') ?? '');
  const go = (to: string) => nav(to, { replace: true });
  // Anti-robô da Cloudflare nos formulários de senha (força bruta, contas falsas). O Google já faz
  // a dele; o botão do Google não passa por aqui.
  const human = useTurnstile(mode === 'funcionario' ? 'equipe' : mode);
  const guarded = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (!human.ready) throw new Error('Aguarde a verificação anti-robô terminar.');
    try { return await fn(); } finally { human.reset(); } // token de uso único
  };

  const account = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const r = await guarded(() => (mode === 'cadastro'
      ? pub.post('/account/register', { name: f.get('name'), email: f.get('email'), password: f.get('password') }, human.headers())
      : pub.post('/account/login', { email: f.get('email'), password: f.get('password') }, human.headers())));
    accountSession.set(r);
    await afterAccount(next, go);
  });
  const google = useAction(async (credential: string) => {
    accountSession.set(await pub.post('/account/google', { credential }));
    await afterAccount(next, go);
  });
  const employee = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const r = await guarded(() => api('/auth/login', { method: 'POST', body: { tenant: f.get('tenant'), email: f.get('email'), password: f.get('password') }, headers: human.headers() }));
    localStorage.setItem('fc.tenant', String(f.get('tenant')));
    session.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, tenant: r.tenant, permissions: r.permissions, modules: r.modules });
    go(loc.state?.from ?? '/');
  });
  const busy = account.busy || google.busy || employee.busy;

  if (mode === 'funcionario') {
    return (
      <AuthLayout>
        <form onSubmit={(e) => void employee.run(e)}>
          <h2>Acesso da equipe</h2>
          <div className="muted" style={{ marginTop: -6 }}>Para quem foi convidado para uma empresa.</div>
          <ErrorBox error={employee.error} />
          <input className="pill" name="tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Identificador da empresa (ex.: minha-loja)" required autoFocus />
          <input className="pill" name="email" type="email" placeholder="E-mail" autoComplete="username" required defaultValue={q.get('email') ?? ''} />
          <PasswordInput name="password" placeholder="Senha" autoComplete="current-password" />
          <Link to="/esqueci-senha" className="linkish">Esqueceu a senha?</Link>
          <div className="ts-slot" ref={human.slot} /><ErrorBox error={human.error} />
          <button className="btn-pill main" disabled={busy || !human.ready}>{employee.busy ? <Spinner /> : <Icon name="arrowRight" />} Entrar</button>
          <button type="button" className="linkish" style={{ alignSelf: 'center' }} onClick={() => setMode('entrar')}>Sou dono(a) da conta</button>
        </form>
      </AuthLayout>
    );
  }

  const cadastro = mode === 'cadastro';
  return (
    <AuthLayout>
      <form onSubmit={(e) => void account.run(e)}>
        <h2>{cadastro ? 'Criar conta' : 'Entrar'}</h2>
        {q.get('senha') === 'redefinida' && <div className="banner info" style={{ margin: 0 }}><Icon name="check" size={18} /><span className="grow">Senha redefinida. Entre com a nova senha.</span></div>}
        {next === '/checkout' && <div className="banner info" style={{ margin: 0 }}><Icon name="cart" size={18} /><span className="grow">Entre ou crie sua conta para finalizar o pedido. O carrinho fica guardado.</span></div>}
        <ErrorBox error={account.error ?? google.error} />
        <GoogleButton onCredential={(c) => void google.run(c)} busy={busy} />
        <div className="or">ou com e-mail</div>
        {cadastro && <input className="pill" name="name" placeholder="Seu nome" autoComplete="name" required minLength={2} />}
        <input className="pill" name="email" type="email" placeholder="E-mail" autoComplete="email" required autoFocus={!cadastro} />
        <PasswordInput name="password" placeholder={cadastro ? 'Crie uma senha (mín. 8)' : 'Senha'} autoComplete={cadastro ? 'new-password' : 'current-password'} minLength={cadastro ? 8 : undefined} />
        {!cadastro && <Link to="/conta/esqueci-senha" className="linkish" style={{ alignSelf: 'flex-end', fontSize: 13.5 }}>Esqueceu a senha?</Link>}
        <div className="ts-slot" ref={human.slot} /><ErrorBox error={human.error} />
        <button className="btn-pill main" disabled={busy || !human.ready}>{account.busy ? <Spinner /> : <Icon name="arrowRight" />} {cadastro ? 'Criar conta' : 'Entrar'}</button>
        <div className="row" style={{ justifyContent: 'center', gap: 6, fontSize: 13.5 }}>
          <span className="muted">{cadastro ? 'Já tem conta?' : 'Ainda não tem conta?'}</span>
          <button type="button" className="linkish" onClick={() => setMode(cadastro ? 'entrar' : 'cadastro')}>{cadastro ? 'Entrar' : 'Criar conta'}</button>
        </div>
        <button type="button" className="linkish" style={{ alignSelf: 'center', color: 'var(--muted)', fontWeight: 600 }} onClick={() => setMode('funcionario')}><Icon name="users" size={14} /> Sou da equipe de uma empresa</button>
      </form>
    </AuthLayout>
  );
}

export function Forgot() {
  const [done, setDone] = useState(false);
  const human = useTurnstile('esqueci');
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (!human.ready) throw new Error('Aguarde a verificação anti-robô terminar.');
    try { await api('/auth/forgot', { method: 'POST', body: { tenant: f.get('tenant'), email: f.get('email') }, headers: human.headers() }); } finally { human.reset(); }
    setDone(true);
  });
  return (
    <AuthLayout>
      <form onSubmit={(e) => void run(e)}>
        <h2>Esqueci minha senha</h2>
        {done ? <div className="banner info" style={{ margin: 0 }}><Icon name="mail" size={18} /><span className="grow">Se o e-mail existir, você receberá um link válido por 1 hora.</span></div> : <>
          <ErrorBox error={error} />
          <input className="pill" name="tenant" defaultValue={localStorage.getItem('fc.tenant') ?? ''} placeholder="Identificador da empresa" required />
          <input className="pill" name="email" type="email" placeholder="E-mail" required />
          <div className="ts-slot" ref={human.slot} /><ErrorBox error={human.error} />
          <button className="btn-pill main" disabled={busy || !human.ready}>{busy ? <Spinner /> : <Icon name="mail" />} Enviar link</button>
        </>}
        <Link to="/login?modo=funcionario" className="linkish" style={{ alignSelf: 'center' }}>Voltar</Link>
      </form>
    </AuthLayout>
  );
}

export function Reset({ invite = false }: { invite?: boolean }) {
  const [q] = useSearchParams(); const nav = useNavigate();
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (f.get('p1') !== f.get('p2')) throw new Error('As senhas não conferem.');
    await post('/auth/reset', { token: q.get('token'), password: f.get('p1') });
    if (q.get('tenant')) localStorage.setItem('fc.tenant', q.get('tenant')!);
    nav('/login?modo=funcionario', { replace: true });
  });
  return (
    <AuthLayout>
      <form onSubmit={(e) => void run(e)}>
        <h2>{invite ? 'Defina sua senha' : 'Nova senha'}</h2>
        <ErrorBox error={error} />
        <PasswordInput name="p1" placeholder="Senha (mín. 8)" autoComplete="new-password" minLength={8} />
        <PasswordInput name="p2" placeholder="Repita a senha" autoComplete="new-password" minLength={8} />
        <button className="btn-pill main" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" />} Salvar e entrar</button>
      </form>
    </AuthLayout>
  );
}

/** "Esqueci a senha" da CONTA do comprador (loja e Minha conta). Resposta sempre igual. */
export function AccountForgot() {
  const [done, setDone] = useState(false);
  const human = useTurnstile('esqueci');
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (!human.ready) throw new Error('Aguarde a verificação anti-robô terminar.');
    try { await api('/account/forgot', { method: 'POST', body: { email: f.get('email') }, headers: human.headers() }); } finally { human.reset(); }
    setDone(true);
  });
  return (
    <AuthLayout>
      <form onSubmit={(e) => void run(e)}>
        <h2>Esqueci a senha da conta</h2>
        {done ? <div className="banner info" style={{ margin: 0 }}><Icon name="mail" size={18} /><span className="grow">Se houver conta com este e-mail, você receberá um link válido por 1 hora.</span></div> : <>
          <div className="muted" style={{ fontSize: 13.5 }}>A conta é a que você usou para comprar na loja. Para a senha de funcionário de uma empresa, use o acesso da equipe.</div>
          <ErrorBox error={error} />
          <input className="pill" name="email" type="email" placeholder="E-mail da conta" autoComplete="email" required />
          <div className="ts-slot" ref={human.slot} /><ErrorBox error={human.error} />
          <button className="btn-pill main" disabled={busy || !human.ready}>{busy ? <Spinner /> : <Icon name="mail" />} Enviar link</button>
        </>}
        <Link to="/login" className="linkish" style={{ alignSelf: 'center' }}>Voltar</Link>
      </form>
    </AuthLayout>
  );
}

export function AccountReset() {
  const [q] = useSearchParams(); const nav = useNavigate();
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (f.get('p1') !== f.get('p2')) throw new Error('As senhas não conferem.');
    await api('/account/reset', { method: 'POST', body: { token: q.get('token'), password: f.get('p1') } });
    nav('/login?senha=redefinida', { replace: true });
  });
  return (
    <AuthLayout>
      <form onSubmit={(e) => void run(e)}>
        <h2>Nova senha da conta</h2>
        <div className="muted" style={{ fontSize: 13.5 }}>Vale para a loja e para a área Minha conta. Nas suas empresas, quem ainda entra com a senha da conta passa a usar esta.</div>
        <ErrorBox error={error} />
        <PasswordInput name="p1" placeholder="Senha (mín. 8)" autoComplete="new-password" minLength={8} />
        <PasswordInput name="p2" placeholder="Repita a senha" autoComplete="new-password" minLength={8} />
        <button className="btn-pill main" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" />} Salvar</button>
      </form>
    </AuthLayout>
  );
}
