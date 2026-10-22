import { useState } from 'react';
import { patch, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Form, Modal, Table, Toast } from '@/components/ui';
import { useSession } from '@/lib/session';
import { dt } from '@/lib/format';

export function Users() {
  const users = useGet<any[]>('/users'); const roles = useGet<any>('/roles');
  const [convite, setConvite] = useState(false); const [papeis, setPapeis] = useState<any | null>(null); const [excecoes, setExcecoes] = useState<any | null>(null); const [senha, setSenha] = useState<any | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const { can } = useSession();
  const redefinir = useAction(async (v: Record<string, any>) => { if (v.next !== v.confirm) throw new Error('As senhas não conferem.'); await post(`/users/${senha.id}/reset-password`, { next: v.next }); setMsg(`Senha de ${senha.name} redefinida. As sessões abertas dele caem.`); setSenha(null); });
  const convidar = useAction(async (v: Record<string, any>) => { await post('/users/invite', { name: v.name, email: v.email, roleIds: v.roleId ? [v.roleId] : [] }); setConvite(false); await users.reload(); });
  const ativar = useAction(async (u: any) => { await patch(`/users/${u.id}/active`, { isActive: !u.isActive }); await users.reload(); });
  const salvarPapeis = useAction(async (v: Record<string, any>) => { await put(`/users/${papeis.id}/roles`, { roleIds: Object.keys(v).filter((k) => v[k]) }); setPapeis(null); await users.reload(); });
  return <div>
    <div className="row between"><h1>Usuários</h1><button className="btn primary" onClick={() => setConvite(true)}>Convidar por e-mail</button></div>
    <ErrorBox error={ativar.error} />
    <Table rows={users.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'E-mail', c: (r) => r.email }, { h: 'Perfis', c: (r) => r.roles.map((x: any) => x.role.name).join(', ') || '—' }, { h: 'Último acesso', c: (r) => dt(r.lastLoginAt) }, { h: 'Ativo', c: (r) => r.isActive ? 'sim' : 'não' },
      { h: '', c: (r) => <div className="row"><button className="btn" onClick={() => setPapeis(r)}>Perfis</button>{can('core.roles:manage') && <button className="btn" onClick={() => setExcecoes(r)}>Exceções{r.permissions?.length ? ` (${r.permissions.length})` : ''}</button>}{can('core.users:manage') && <button className="btn" onClick={() => setSenha(r)}>Senha</button>}<button className="btn" onClick={() => void ativar.run(r)}>{r.isActive ? 'Desativar' : 'Ativar'}</button></div> }]} />
    <Modal title="Convidar usuário" open={convite} onClose={() => setConvite(false)}><ErrorBox error={convidar.error} /><Form onSubmit={(v) => void convidar.run(v)} busy={convidar.busy} submitLabel="Enviar convite">
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
      <Field label="Perfil inicial"><select className="input" name="roleId"><option value="">— nenhum —</option>{roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></Form></Modal>
    <Modal title={`Perfis de ${papeis?.name ?? ''}`} open={!!papeis} onClose={() => setPapeis(null)}><ErrorBox error={salvarPapeis.error} /><Form onSubmit={(v) => void salvarPapeis.run(v)} busy={salvarPapeis.busy}>
      {roles.data?.roles.map((r: any) => <label key={r.id} className="row"><input type="checkbox" name={r.id} defaultChecked={papeis?.roles.some((x: any) => x.role.key === r.key)} /> {r.name} <span className="muted">({r.key})</span></label>)}</Form></Modal>
    <Modal title={`Exceções de ${excecoes?.name ?? ''}`} open={!!excecoes} onClose={() => setExcecoes(null)} wide>{excecoes && roles.data && <Excecoes usuario={excecoes} catalogo={roles.data.catalog} onDone={async () => { setExcecoes(null); await users.reload(); }} />}</Modal>
    <Modal title={`Redefinir senha de ${senha?.name ?? ''}`} open={!!senha} onClose={() => setSenha(null)}><ErrorBox error={redefinir.error} /><Form onSubmit={(v) => void redefinir.run(v)} busy={redefinir.busy} submitLabel="Redefinir">
      <Field label="Nova senha (mín. 8)"><input className="input" name="next" type="password" minLength={8} required autoComplete="new-password" /></Field><Field label="Repita"><input className="input" name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field></Form></Modal>
    <Toast msg={msg} />
  </div>;
}

/** Exceção individual: PERMITIR dá uma chave que o perfil não dá; NEGAR tira uma que ele dá (vence). */
function Excecoes({ usuario, catalogo, onDone }: { usuario: any; catalogo: { key: string; label: string; module: string | null }[]; onDone: () => void }) {
  const [efeito, setEfeito] = useState<Record<string, string>>(Object.fromEntries((usuario.permissions ?? []).map((p: any) => [p.permissionKey, p.effect])));
  const salvar = useAction(async () => { await put(`/users/${usuario.id}/exceptions`, { items: Object.entries(efeito).filter(([, e]) => e).map(([permissionKey, effect]) => ({ permissionKey, effect })) }); onDone(); });
  const grupos = catalogo.reduce<Record<string, typeof catalogo>>((acc, p) => { (acc[p.module ?? 'Núcleo'] ??= []).push(p); return acc; }, {});
  return <div className="grid" style={{ gap: 12 }}>
    <div className="muted">Vale só para esta pessoa, por cima dos perfis dela. "Negar" vence qualquer perfil.</div>
    <div style={{ maxHeight: '55vh', overflow: 'auto' }}>{Object.entries(grupos).map(([g, ps]) => <div key={g} style={{ marginBottom: 12 }}><strong>{g}</strong>
      {ps.map((p) => <div key={p.key} className="row between" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span>{p.label} <span className="muted mono">{p.key}</span></span>
        <select className="input" style={{ width: 150 }} value={efeito[p.key] ?? ''} aria-label={`Exceção ${p.key}`} onChange={(e) => setEfeito((x) => ({ ...x, [p.key]: e.target.value }))}><option value="">Do perfil</option><option value="ALLOW">Permitir</option><option value="DENY">Negar</option></select></div>)}</div>)}</div>
    <ErrorBox error={salvar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy} onClick={() => void salvar.run()}>Salvar exceções</button></div>
  </div>;
}
