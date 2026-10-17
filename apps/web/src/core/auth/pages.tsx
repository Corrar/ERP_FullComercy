import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '@/lib/api';
import { session } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { ErrorBox, Field } from '@/components/ui';

export function Login() {
  const nav = useNavigate(); const loc = useLocation() as { state?: { from?: string } };
  const [tenant, setTenant] = useState(localStorage.getItem('fc.tenant') ?? '');
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const r = await post('/auth/login', { tenant: f.get('tenant'), email: f.get('email'), password: f.get('password') });
    localStorage.setItem('fc.tenant', String(f.get('tenant')));
    session.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, tenant: r.tenant, permissions: r.permissions, modules: r.modules });
    nav(loc.state?.from ?? '/', { replace: true });
  });
  return <div className="login"><form className="card grid" style={{ gap: 12 }} onSubmit={(e) => void run(e)}>
    <h1 style={{ margin: 0 }}>FullComercy</h1><div className="muted">Entre na sua empresa</div>
    <ErrorBox error={error} />
    <Field label="Empresa (identificador)"><input className="input" name="tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="minha-loja" required autoFocus /></Field>
    <Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
    <Field label="Senha"><input className="input" name="password" type="password" required /></Field>
    <button className="btn primary" disabled={busy}>{busy ? '…' : 'Entrar'}</button>
    <Link to="/esqueci-senha" className="muted" style={{ fontSize: 12 }}>Esqueci minha senha</Link>
  </form></div>;
}

export function Forgot() {
  const [done, setDone] = useState(false);
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); await post('/auth/forgot', { tenant: f.get('tenant'), email: f.get('email') }); setDone(true); });
  return <div className="login"><form className="card grid" style={{ gap: 12 }} onSubmit={(e) => void run(e)}>
    <h1 style={{ margin: 0 }}>Esqueci minha senha</h1>
    {done ? <div>Se o e-mail existir, você receberá um link válido por 1 hora.</div> : <>
      <ErrorBox error={error} />
      <Field label="Empresa"><input className="input" name="tenant" defaultValue={localStorage.getItem('fc.tenant') ?? ''} required /></Field>
      <Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
      <button className="btn primary" disabled={busy}>Enviar link</button></>}
    <Link to="/login" className="muted" style={{ fontSize: 12 }}>Voltar</Link>
  </form></div>;
}

export function Reset({ invite = false }: { invite?: boolean }) {
  const [q] = useSearchParams(); const nav = useNavigate();
  const { run, busy, error } = useAction(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (f.get('p1') !== f.get('p2')) throw new Error('As senhas não conferem.');
    await post('/auth/reset', { token: q.get('token'), password: f.get('p1') });
    if (q.get('tenant')) localStorage.setItem('fc.tenant', q.get('tenant')!);
    nav('/login', { replace: true });
  });
  return <div className="login"><form className="card grid" style={{ gap: 12 }} onSubmit={(e) => void run(e)}>
    <h1 style={{ margin: 0 }}>{invite ? 'Defina sua senha' : 'Nova senha'}</h1>
    <ErrorBox error={error} />
    <Field label="Senha (mín. 8)"><input className="input" name="p1" type="password" minLength={8} required /></Field>
    <Field label="Repita a senha"><input className="input" name="p2" type="password" minLength={8} required /></Field>
    <button className="btn primary" disabled={busy}>Salvar e entrar</button>
  </form></div>;
}
