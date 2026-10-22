// Banho e tosa do dia: agendado → no banho → pronto → cobrado no balcão (a entrega é a venda).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { hhmm } from '@/lib/format';

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PROX: Record<string, { to: string; label: string }[]> = { SCHEDULED: [{ to: 'IN_PROGRESS', label: 'Começar' }, { to: 'NO_SHOW', label: 'Não veio' }], IN_PROGRESS: [{ to: 'READY', label: 'Pronto' }] };

export function BanhoTosa() {
  const nav = useNavigate(); const [dia, setDia] = useState(hojeISO()); const [novo, setNovo] = useState(false);
  const ag = useGet<any[]>('/m/pet/banho-tosa', { from: new Date(`${dia}T00:00:00`).toISOString(), to: new Date(new Date(`${dia}T00:00:00`).getTime() + 86400000).toISOString() });
  const mover = useAction(async (id: string, to: string) => { await post(`/m/pet/banho-tosa/${id}/mover`, { to }); await ag.reload(); });
  const cobrar = useAction(async (b: any) => {
    const o = await post<any>('/orders', { channel: 'PETSHOP', customerId: b.pet.customer.id, items: [{ kind: 'SERVICE', description: b.services, unitPrice: Number(b.price), quantity: 1, metadata: { groomingId: b.id } }], moduleData: { petId: b.pet.id, groomingId: b.id } });
    nav(`/pet/balcao?o=${o.id}`);
  });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Banho e tosa</h1><div className="row"><input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia" /><button className="btn primary" onClick={() => setNovo(true)}>Agendar</button></div></div>
    <ErrorBox error={mover.error ?? cobrar.error} />
    <Card><Table rows={ag.data} empty="Nada agendado neste dia." cols={[
      { h: 'Hora', c: (b) => hhmm(b.scheduledAt) }, { h: 'Pet', c: (b) => <>{b.pet.name}<div className="muted">{b.pet.breed ?? ''} {b.pet.size ? `· ${b.pet.size}` : ''}</div></> },
      { h: 'Tutor', c: (b) => <>{b.pet.customer.name}<div className="muted">{b.pet.customer.phone}</div></> }, { h: 'Serviços', c: (b) => <>{b.services}{b.taxiDog && <div className="muted">táxi dog</div>}</> },
      { h: 'Valor', c: (b) => <Money v={b.price} />, right: true }, { h: 'Status', c: (b) => <Badge s={b.status} /> },
      { h: '', c: (b) => <div className="row">{(PROX[b.status] ?? []).map((p) => <button key={p.to} className="btn" onClick={() => void mover.run(b.id, p.to)}>{p.label}</button>)}
        {b.status === 'READY' && !b.orderId && <button className="btn primary" onClick={() => void cobrar.run(b)}>Cobrar e entregar</button>}
        {b.orderId && <button className="btn" onClick={() => nav(`/pet/balcao?o=${b.orderId}`)}>Ver venda</button>}</div> }]} /></Card>
    <Modal title="Agendar banho/tosa" open={novo} onClose={() => setNovo(false)}>{novo && <NovoBanho dia={dia} onDone={async () => { setNovo(false); await ag.reload(); }} />}</Modal>
  </div>;
}

function NovoBanho({ dia, onDone }: { dia: string; onDone: () => void }) {
  const [q, setQ] = useState(''); const [pet, setPet] = useState<any | null>(null);
  const pets = useGet<any[]>(!pet && q.trim().length >= 2 ? '/m/pet/pets' : null, { q: q.trim() });
  const salvar = useAction(async (v: Record<string, any>) => {
    if (!pet) throw new Error('Escolha o pet.');
    await post('/m/pet/banho-tosa', { petId: pet.id, scheduledAt: new Date(`${dia}T${v.hora}:00`).toISOString(), durationMin: v.durationMin, services: v.services, price: v.price, taxiDog: !!v.taxiDog, notes: v.notes }); onDone();
  });
  return <div className="grid" style={{ gap: 12 }}>
    {pet ? <div className="row between"><strong>{pet.name} · {pet.customer.name}</strong><button className="btn" onClick={() => setPet(null)}>Trocar</button></div>
      : <><input className="input" placeholder="Nome do pet ou do tutor" value={q} onChange={(e) => setQ(e.target.value)} />{q.trim().length >= 2 && <Table rows={pets.data} empty="Nenhum pet. Cadastre em Pets." onRow={setPet} cols={[{ h: 'Pet', c: (p) => p.name }, { h: 'Tutor', c: (p) => p.customer.name }]} />}</>}
    <ErrorBox error={salvar.error} />
    <Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <div className="row"><Field label="Hora"><input className="input" name="hora" type="time" step={300} defaultValue="09:00" required /></Field><Field label="Duração (min)"><input className="input" name="durationMin" type="number" min={10} defaultValue={60} /></Field></div>
      <Field label="Serviços"><input className="input" name="services" required placeholder="Banho + tosa higiênica" /></Field>
      <div className="row"><Field label="Valor (R$)"><input className="input" name="price" type="number" step="0.01" min={0} required /></Field><Field label="Táxi dog"><input type="checkbox" name="taxiDog" /></Field></div>
      <Field label="Observação"><input className="input" name="notes" /></Field>
    </Form></div>;
}
