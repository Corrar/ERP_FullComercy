import { useState } from 'react';
import { post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Toast } from '@/components/ui';

export function Account() {
  const { s, refresh } = useSession(); const [msg, setMsg] = useState<string | null>(null);
  const senha = useAction(async (v: Record<string, any>) => { await post('/users/me/password', { current: v.current, next: v.next }); setMsg('Senha alterada. Outras sessões foram encerradas.'); });
  return <div className="grid" style={{ maxWidth: 520 }}>
    <h1>Minha conta</h1>
    <Card title="Sessão"><div>{s?.user.name} · {s?.user.email}</div><div className="muted">{s?.tenant.name} · módulos: {s?.modules.join(', ') || 'nenhum'} · {s?.permissions.includes('*') ? 'administrador' : `${s?.permissions.length} permissões`}</div>
      <div style={{ marginTop: 8 }}><button className="btn" onClick={() => void refresh()}>Recarregar permissões</button></div></Card>
    <Card title="Trocar senha"><ErrorBox error={senha.error} /><Form onSubmit={(v) => void senha.run(v)} busy={senha.busy} submitLabel="Trocar">
      <Field label="Senha atual"><input className="input" name="current" type="password" required /></Field>
      <Field label="Nova senha (mín. 8)"><input className="input" name="next" type="password" minLength={8} required /></Field></Form></Card>
    <Toast msg={msg} />
  </div>;
}
