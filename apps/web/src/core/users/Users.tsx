import { useState } from 'react';
import { patch, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Form, Modal, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Users() {
  const users = useGet<any[]>('/users'); const roles = useGet<any>('/roles');
  const [convite, setConvite] = useState(false); const [papeis, setPapeis] = useState<any | null>(null);
  const convidar = useAction(async (v: Record<string, any>) => { await post('/users/invite', { name: v.name, email: v.email, roleIds: v.roleId ? [v.roleId] : [] }); setConvite(false); await users.reload(); });
  const ativar = useAction(async (u: any) => { await patch(`/users/${u.id}/active`, { isActive: !u.isActive }); await users.reload(); });
  const salvarPapeis = useAction(async (v: Record<string, any>) => { await put(`/users/${papeis.id}/roles`, { roleIds: Object.keys(v).filter((k) => v[k]) }); setPapeis(null); await users.reload(); });
  return <div>
    <div className="row between"><h1>Usuários</h1><button className="btn primary" onClick={() => setConvite(true)}>Convidar por e-mail</button></div>
    <ErrorBox error={ativar.error} />
    <Table rows={users.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'E-mail', c: (r) => r.email }, { h: 'Perfis', c: (r) => r.roles.map((x: any) => x.role.name).join(', ') || '—' }, { h: 'Último acesso', c: (r) => dt(r.lastLoginAt) }, { h: 'Ativo', c: (r) => r.isActive ? 'sim' : 'não' },
      { h: '', c: (r) => <div className="row"><button className="btn" onClick={() => setPapeis(r)}>Perfis</button><button className="btn" onClick={() => void ativar.run(r)}>{r.isActive ? 'Desativar' : 'Ativar'}</button></div> }]} />
    <Modal title="Convidar usuário" open={convite} onClose={() => setConvite(false)}><ErrorBox error={convidar.error} /><Form onSubmit={(v) => void convidar.run(v)} busy={convidar.busy} submitLabel="Enviar convite">
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
      <Field label="Perfil inicial"><select className="input" name="roleId"><option value="">— nenhum —</option>{roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></Form></Modal>
    <Modal title={`Perfis de ${papeis?.name ?? ''}`} open={!!papeis} onClose={() => setPapeis(null)}><ErrorBox error={salvarPapeis.error} /><Form onSubmit={(v) => void salvarPapeis.run(v)} busy={salvarPapeis.busy}>
      {roles.data?.roles.map((r: any) => <label key={r.id} className="row"><input type="checkbox" name={r.id} defaultChecked={papeis?.roles.some((x: any) => x.role.key === r.key)} /> {r.name} <span className="muted">({r.key})</span></label>)}</Form></Modal>
  </div>;
}
