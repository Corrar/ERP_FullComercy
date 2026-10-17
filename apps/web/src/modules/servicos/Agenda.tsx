import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Agenda() {
  const nav = useNavigate(); const ag = useGet<any[]>('/m/servicos/agenda'); const clientes = useGet<any[]>('/customers'); const [novo, setNovo] = useState(false);
  const agendar = useAction(async (v: Record<string, any>) => { await post('/m/servicos/agenda', { customerId: v.customerId, scheduledAt: new Date(v.scheduledAt).toISOString(), durationMin: v.durationMin, service: v.service, notes: v.notes }); setNovo(false); await ag.reload(); });
  const chegada = useAction(async (id: string) => { const o = await post(`/m/servicos/agenda/${id}/chegada`, {}); nav(`/servicos/os/${o.serviceOrder.id}`); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Agenda da oficina</h1><button className="btn primary" onClick={() => setNovo(true)}>Agendar</button></div>
    <ErrorBox error={chegada.error} />
    <Card><Table rows={ag.data} empty="Nada agendado nos próximos 7 dias." cols={[{ h: 'Quando', c: (r) => dt(r.scheduledAt) }, { h: 'Cliente', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Veículo', c: (r) => r.vehicle ? `${r.vehicle.plate} · ${r.vehicle.brand ?? ''} ${r.vehicle.model ?? ''}` : '—' }, { h: 'Serviço', c: (r) => r.service ?? '—' }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => ['SCHEDULED', 'CONFIRMED'].includes(r.status) ? <button className="btn primary" onClick={() => void chegada.run(r.id)}>Chegou → abrir OS</button> : null }]} /></Card>
    <Modal title="Agendar" open={novo} onClose={() => setNovo(false)}><ErrorBox error={agendar.error} /><Form onSubmit={(v) => void agendar.run(v)} busy={agendar.busy}>
      <Field label="Cliente"><select className="input" name="customerId" required>{clientes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <div className="row"><Field label="Data e hora"><input className="input" name="scheduledAt" type="datetime-local" required /></Field><Field label="Duração (min)"><input className="input" name="durationMin" type="number" defaultValue={60} /></Field></div>
      <Field label="Serviço solicitado"><input className="input" name="service" required /></Field><Field label="Observações"><input className="input" name="notes" /></Field></Form></Modal>
  </div>;
}
