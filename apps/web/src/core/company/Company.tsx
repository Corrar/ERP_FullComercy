import { useState } from 'react';
import { put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Toast } from '@/components/ui';

export function Company() {
  const { refresh } = useSession(); const [msg, setMsg] = useState<string | null>(null);
  const mods = useGet<any[]>('/tenant/modules'); const cfg = useGet<any>('/tenant/settings');
  const toggle = useAction(async (m: any) => { await put(`/tenant/modules/${m.key}`, { enabled: !m.enabled }); await mods.reload(); await refresh(); setMsg(`${m.name} ${m.enabled ? 'desligado' : 'ligado'}.`); });
  const salvar = useAction(async (v: Record<string, any>) => { await put('/tenant/settings', { name: v.name, document: v.document, defaultSalesModule: v.defaultSalesModule || null }); await cfg.reload(); await refresh(); setMsg('Configurações salvas.'); });
  return <div className="grid">
    <h1>Empresa e módulos</h1>
    <ErrorBox error={toggle.error ?? salvar.error} />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {mods.data?.map((m) => <Card key={m.key} title={m.name} actions={<button className={`btn ${m.enabled ? '' : 'primary'}`} onClick={() => void toggle.run(m)} disabled={toggle.busy}>{m.enabled ? 'Desligar' : 'Ligar'}</button>}><div className="muted">{m.description}</div><div style={{ marginTop: 8 }}>{m.enabled ? <span className="badge ok">ativo</span> : <span className="badge">inativo</span>}</div></Card>)}
    </div>
    {cfg.data && <Card title="Dados e preferências"><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" defaultValue={cfg.data.name} /></Field><Field label="CNPJ"><input className="input" name="document" defaultValue={cfg.data.document ?? ''} /></Field>
      <Field label="Módulo de venda padrão (desempate quando há mais de um)"><select className="input" name="defaultSalesModule" defaultValue={cfg.data.settings?.defaultSalesModule ?? ''}><option value="">— automático —</option>{mods.data?.filter((m) => m.enabled).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select></Field>
      <div className="muted">Identificador de login: <code>{cfg.data.slug}</code></div></Form></Card>}
    <Toast msg={msg} />
  </div>;
}
