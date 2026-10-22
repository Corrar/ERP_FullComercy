// Catálogo de serviços da oficina: preço padrão e tempo estimado (o orçamento puxa daqui).
import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';

export function Catalogo() {
  const { can } = useSession(); const gerir = can('svc.catalogo:manage');
  const cat = useGet<any[]>('/m/servicos/catalogo'); const [ed, setEd] = useState<any | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { const b = { name: v.name, defaultPrice: v.defaultPrice, estimatedMinutes: v.estimatedMinutes ?? (ed?.id ? null : undefined) }; if (ed?.id) await patch(`/m/servicos/catalogo/${ed.id}`, b); else await post('/m/servicos/catalogo', b); setEd(null); await cat.reload(); });
  const desativar = useAction(async (s: any) => { await patch(`/m/servicos/catalogo/${s.id}`, { isActive: false }); await cat.reload(); });
  return <div className="grid"><div className="row between"><h1 style={{ margin: 0 }}>Catálogo de serviços</h1>{gerir && <button className="btn primary" onClick={() => setEd({})}>Novo serviço</button>}</div>
    <ErrorBox error={desativar.error} />
    <Card><Table rows={cat.data} empty="Nenhum serviço." cols={[{ h: 'Serviço', c: (s) => s.name }, { h: 'Preço padrão', c: (s) => <Money v={s.defaultPrice} />, right: true }, { h: 'Tempo', c: (s) => s.estimatedMinutes ? `${s.estimatedMinutes} min` : '—', right: true },
      { h: '', c: (s) => gerir && <div className="row"><button className="btn" onClick={() => setEd(s)}>Editar</button><button className="btn danger" onClick={() => void desativar.run(s)}>Desativar</button></div> }]} /></Card>
    <Modal title={ed?.id ? `Editar · ${ed.name}` : 'Novo serviço'} open={!!ed} onClose={() => setEd(null)}>{ed && <><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Serviço"><input className="input" name="name" required minLength={2} defaultValue={ed.name ?? ''} /></Field>
      <div className="row"><Field label="Preço padrão (R$)"><input className="input" name="defaultPrice" type="number" step="0.01" min={0} required defaultValue={ed.defaultPrice ?? ''} /></Field><Field label="Tempo (min)"><input className="input" name="estimatedMinutes" type="number" min={1} defaultValue={ed.estimatedMinutes ?? ''} /></Field></div></Form></>}</Modal></div>;
}
