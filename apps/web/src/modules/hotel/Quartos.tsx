import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Switch, Table } from '@/components/ui';
import { STATUS_QUARTO } from './Painel';

export function Quartos() {
  const { can } = useSession(); const gerir = can('hot.quartos:manage');
  const qs = useGet<any[]>('/m/hotel/quartos'); const [ed, setEd] = useState<any | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { const b = { number: String(v.number), type: v.type, capacity: v.capacity, dailyRate: v.dailyRate, notes: v.notes }; if (ed?.id) await patch(`/m/hotel/quartos/${ed.id}`, b); else await post('/m/hotel/quartos', b); setEd(null); await qs.reload(); });
  const ativo = useAction(async (q: any) => { await patch(`/m/hotel/quartos/${q.id}`, { isActive: !q.isActive }); await qs.reload(); });
  return <div className="grid"><div className="row between"><h1 style={{ margin: 0 }}>Quartos</h1>{gerir && <button className="btn primary" onClick={() => setEd({})}>Novo quarto</button>}</div>
    <ErrorBox error={ativo.error} />
    <Card><Table rows={qs.data} empty="Nenhum quarto." cols={[{ h: 'Quarto', c: (q) => q.number }, { h: 'Tipo', c: (q) => q.type }, { h: 'Capacidade', c: (q) => q.capacity, right: true }, { h: 'Diária', c: (q) => <Money v={q.dailyRate} />, right: true }, { h: 'Situação', c: (q) => STATUS_QUARTO[q.status]?.label ?? q.status },
      { h: 'Ativo', c: (q) => <Switch on={q.isActive} disabled={!gerir} label={`Quarto ${q.number} ativo`} onChange={() => void ativo.run(q)} /> }, { h: '', c: (q) => gerir && <button className="btn" onClick={() => setEd(q)}>Editar</button> }]} /></Card>
    <Modal title={ed?.id ? `Editar quarto ${ed.number}` : 'Novo quarto'} open={!!ed} onClose={() => setEd(null)}>{ed && <><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <div className="row"><Field label="Número"><input className="input" name="number" required defaultValue={ed.number ?? ''} /></Field><Field label="Tipo"><input className="input" name="type" required defaultValue={ed.type ?? 'Standard'} /></Field></div>
      <div className="row"><Field label="Capacidade"><input className="input" name="capacity" type="number" min={1} max={20} required defaultValue={ed.capacity ?? 2} /></Field><Field label="Diária (R$)"><input className="input" name="dailyRate" type="number" step="0.01" min={0.01} required defaultValue={ed.dailyRate ?? ''} /></Field></div>
      <Field label="Observações"><input className="input" name="notes" defaultValue={ed.notes ?? ''} /></Field></Form></>}</Modal></div>;
}
