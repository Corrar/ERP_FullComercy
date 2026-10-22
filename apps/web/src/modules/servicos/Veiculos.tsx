// Veículos: busca por placa, modelo ou dono; a ficha mostra o histórico de OS e permite corrigir dados.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Veiculos() {
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const v = useGet<any[]>('/m/servicos/veiculos', { q });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Veículos</h1><input className="input" placeholder="placa, modelo ou dono" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} /></div>
    <Card><Table rows={v.data} onRow={(r) => setSel(r.id)} cols={[{ h: 'Placa', c: (r) => <strong>{r.plate}</strong> }, { h: 'Veículo', c: (r) => `${r.brand ?? ''} ${r.model ?? ''} ${r.year ?? ''}` }, { h: 'Dono', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Km', c: (r) => r.mileage ?? '—', right: true }, { h: 'Atualizado', c: (r) => dt(r.updatedAt) }]} /></Card>
    <Modal title="Ficha do veículo" open={!!sel} onClose={() => { setSel(null); void v.reload(); }} wide>{sel && <Ficha id={sel} />}</Modal>
  </div>;
}

function Ficha({ id }: { id: string }) {
  const nav = useNavigate(); const { can } = useSession();
  const h = useGet<any>(`/m/servicos/veiculos/${id}/historico`); const [ed, setEd] = useState(false);
  const salvar = useAction(async (f: Record<string, any>) => { await patch(`/m/servicos/veiculos/${id}`, { brand: f.brand, model: f.model, year: f.year, color: f.color, mileage: f.mileage, notes: f.notes }); setEd(false); await h.reload(); });
  if (!h.data) return <ErrorBox error={h.error} />;
  const x = h.data;
  return <div className="grid" style={{ gap: 12 }}>
    <div className="row between"><div><strong>{x.plate}</strong> · {x.brand} {x.model} {x.year} {x.color ? `· ${x.color}` : ''}<div className="muted">{x.customer.name} {x.customer.phone ?? ''} · km {x.mileage ?? '—'}</div></div>{can('svc.veiculos:manage') && <button className="btn" onClick={() => setEd((e) => !e)}>{ed ? 'Fechar' : 'Editar'}</button>}</div>
    {ed && <><ErrorBox error={salvar.error} /><Form onSubmit={(f) => void salvar.run(f)} busy={salvar.busy}>
      <div className="row"><Field label="Marca"><input className="input" name="brand" defaultValue={x.brand ?? ''} /></Field><Field label="Modelo"><input className="input" name="model" defaultValue={x.model ?? ''} /></Field><Field label="Ano"><input className="input" name="year" type="number" min={1950} max={2100} defaultValue={x.year ?? ''} /></Field></div>
      <div className="row"><Field label="Cor"><input className="input" name="color" defaultValue={x.color ?? ''} /></Field><Field label="Km"><input className="input" name="mileage" type="number" min={0} defaultValue={x.mileage ?? ''} /></Field></div>
      <Field label="Observações"><input className="input" name="notes" defaultValue={x.notes ?? ''} /></Field></Form></>}
    <Table<any> rows={x.serviceOrders} empty="Nenhuma OS." onRow={(o) => nav(`/servicos/os/${o.id}`)} cols={[{ h: 'OS', c: (o) => `#${o.order.number}` }, { h: 'Entrada', c: (o) => dt(o.createdAt) }, { h: 'Serviços', c: (o) => o.order.items.filter((i: any) => i.kind === 'SERVICE').map((i: any) => i.description).join(', ') || '—' }, { h: 'Técnico', c: (o) => o.technician?.name ?? '—' }, { h: 'Total', c: (o) => <Money v={o.order.total} />, right: true }, { h: 'Status', c: (o) => <Badge s={o.maintenanceStatus} /> }]} />
  </div>;
}
