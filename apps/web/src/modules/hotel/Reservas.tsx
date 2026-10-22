// Reservas: período, hóspede, quartos livres naquele período, e o que fazer com cada reserva.
import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Modal, Money, Table, Toast } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { brl, d } from '@/lib/format';
import { checkIn } from './Painel';

const iso = (dt: Date) => new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mais = (s: string, n: number) => iso(new Date(new Date(`${s}T12:00:00`).getTime() + n * 86400000));

export function Reservas() {
  const [de, setDe] = useState(iso(new Date())); const [ate, setAte] = useState(mais(iso(new Date()), 30)); const [nova, setNova] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const rs = useGet<any[]>('/m/hotel/reservas', { from: de, to: ate });
  const mudar = useAction(async (id: string, status: string) => { await patch(`/m/hotel/reservas/${id}`, { status }); await rs.reload(); });
  const entrar = useAction(async (r: any) => { const o = await checkIn(r); setMsg(`Check-in feito: conta #${o.number} (${brl(o.total)}).`); await rs.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Reservas</h1><button className="btn primary" onClick={() => setNova(true)}>Nova reserva</button></div>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    <ErrorBox error={rs.error ?? mudar.error ?? entrar.error} />
    <Card><Table rows={rs.data} empty="Nenhuma reserva no período." cols={[
      { h: 'Entrada', c: (r) => d(r.checkIn) }, { h: 'Saída', c: (r) => d(r.checkOut) }, { h: 'Quarto', c: (r) => `${r.room.number} · ${r.room.type}` }, { h: 'Hóspede', c: (r) => <>{r.customer.name}<div className="muted">{r.guests} pessoa(s)</div></> },
      { h: 'Diária', c: (r) => <Money v={r.dailyRate} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => r.status === 'BOOKED' && <div className="row">{r.checkIn.slice(0, 10) <= iso(new Date()) && <button className="btn primary" onClick={() => void entrar.run(r)}>Check-in</button>}<button className="btn" onClick={() => void mudar.run(r.id, 'NO_SHOW')}>Não veio</button><button className="btn danger" onClick={() => void mudar.run(r.id, 'CANCELLED')}>Cancelar</button></div> }]} /></Card>
    <Modal title="Nova reserva" open={nova} onClose={() => setNova(false)} wide>{nova && <NovaReserva onDone={async () => { setNova(false); setMsg('Reserva feita.'); await rs.reload(); }} />}</Modal>
    <Toast msg={msg} />
  </div>;
}

function NovaReserva({ onDone }: { onDone: () => void }) {
  const hoje = iso(new Date());
  const [hosp, setHosp] = useState<ClienteMin | null>(null); const [ent, setEnt] = useState(hoje); const [sai, setSai] = useState(mais(hoje, 2)); const [pessoas, setPessoas] = useState(2);
  const livres = useGet<any[]>(ent < sai ? '/m/hotel/disponiveis' : null, { checkIn: ent, checkOut: sai, guests: pessoas });
  const quartos = useGet<any[]>('/m/hotel/quartos');
  const noites = Math.max(0, Math.round((new Date(`${sai}T12:00:00`).getTime() - new Date(`${ent}T12:00:00`).getTime()) / 86400000));
  const reservar = useAction(async (q: any) => { if (!hosp) throw new Error('Escolha o hóspede.'); await post('/m/hotel/reservas', { customerId: hosp.id, roomId: q.id, checkIn: ent, checkOut: sai, guests: pessoas, source: 'balcão' }); onDone(); });
  return <div className="grid" style={{ gap: 12 }}>
    <EscolherCliente value={hosp} onChange={setHosp} rotulo="Hóspede" />
    <div className="row"><Field label="Entrada"><input className="input" type="date" value={ent} onChange={(e) => setEnt(e.target.value)} /></Field><Field label="Saída"><input className="input" type="date" value={sai} min={mais(ent, 1)} onChange={(e) => setSai(e.target.value)} /></Field><Field label="Pessoas"><input className="input" type="number" min={1} max={20} value={pessoas} onChange={(e) => setPessoas(Number(e.target.value) || 1)} /></Field></div>
    <div className="muted">{noites} diária(s). Quartos livres no período:</div>
    <ErrorBox error={reservar.error ?? livres.error} />
    <Table rows={livres.data} empty={quartos.data && !quartos.data.length ? 'Nenhum quarto cadastrado ainda: crie em Quartos.' : 'Nenhum quarto livre para esse período e número de pessoas.'} cols={[{ h: 'Quarto', c: (q) => q.number }, { h: 'Tipo', c: (q) => q.type }, { h: 'Capacidade', c: (q) => q.capacity, right: true }, { h: 'Diária', c: (q) => <Money v={q.dailyRate} />, right: true }, { h: 'Total', c: (q) => <Money v={Number(q.dailyRate) * noites} />, right: true }, { h: '', c: (q) => <button className="btn primary" disabled={!hosp || reservar.busy} onClick={() => void reservar.run(q)}>Reservar</button> }]} />
  </div>;
}
