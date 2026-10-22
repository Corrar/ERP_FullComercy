import { useState } from 'react';
import { del, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Modal, Table } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { dt } from '@/lib/format';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function Turmas() {
  const { can } = useSession(); const gerir = can('gym.turmas:manage');
  const turmas = useGet<any[]>('/m/academia/turmas'); const agenda = useGet<any[]>('/m/academia/agenda'); const [nova, setNova] = useState(false);
  const [reservar, setReservar] = useState<any | null>(null); const [chamada, setChamada] = useState<any | null>(null);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/academia/turmas', { name: v.name, capacity: v.capacity, durationMin: v.durationMin, schedule: [{ weekday: Number(v.weekday), time: v.time }] }); setNova(false); await turmas.reload(); await post('/m/academia/turmas/gerar-sessoes?dias=14'); await agenda.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Turmas</h1>{gerir && <button className="btn primary" onClick={() => setNova(true)}>Nova turma</button>}</div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
      <Card title="Turmas">{turmas.data?.map((t) => <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><strong>{t.name}</strong><div className="muted">{t.instructor?.name ?? 'sem instrutor'} · {t.capacity} vagas · {(t.schedule as any[]).map((s) => `${DIAS[s.weekday]} ${s.time}`).join(', ')}</div></div>)}</Card>
      <Card title="Agenda (7 dias)"><Table rows={agenda.data} empty="Sem sessões. Crie turmas ou gere as sessões." cols={[{ h: 'Quando', c: (r) => dt(r.startsAt) }, { h: 'Turma', c: (r) => r.class.name }, { h: 'Instrutor', c: (r) => r.class.instructor?.name ?? '—' }, { h: 'Vagas', c: (r) => `${r._count.bookings}/${r.capacity}`, right: true },
        { h: '', c: (r) => <div className="row"><button className="btn" onClick={() => setReservar(r)}>Reservar</button>{gerir && <button className="btn" onClick={() => setChamada(r)}>Chamada</button>}</div> }]} /></Card>
    </div>
    <Modal title={`Reservar · ${reservar?.class.name ?? ''}`} open={!!reservar} onClose={() => setReservar(null)}>{reservar && <Reservar sessao={reservar} onDone={async () => { setReservar(null); await agenda.reload(); }} />}</Modal>
    <Modal title={`Chamada · ${chamada?.class.name ?? ''} · ${chamada ? dt(chamada.startsAt) : ''}`} open={!!chamada} onClose={() => setChamada(null)}>{chamada && <Chamada sessao={chamada} onDone={async () => { setChamada(null); await agenda.reload(); }} />}</Modal>
    <Modal title="Nova turma" open={nova} onClose={() => setNova(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><div className="row"><Field label="Capacidade"><input className="input" name="capacity" type="number" defaultValue={20} /></Field><Field label="Duração (min)"><input className="input" name="durationMin" type="number" defaultValue={60} /></Field></div>
      <div className="row"><Field label="Dia da semana"><select className="input" name="weekday">{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field><Field label="Horário"><input className="input" name="time" type="time" defaultValue="18:00" required /></Field></div></Form></Modal>
  </div>;
}

function Reservar({ sessao, onDone }: { sessao: any; onDone: () => void }) {
  const [aluno, setAluno] = useState<ClienteMin | null>(null);
  const ok = useAction(async () => { if (!aluno) throw new Error('Escolha o aluno.'); await post(`/m/academia/agenda/${sessao.id}/reservas`, { customerId: aluno.id }); onDone(); });
  return <div className="grid" style={{ gap: 12 }}><div className="muted">{dt(sessao.startsAt)} · {sessao._count.bookings}/{sessao.capacity} vagas</div><EscolherCliente value={aluno} onChange={setAluno} rotulo="Aluno" /><ErrorBox error={ok.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={ok.busy} onClick={() => void ok.run()}>Reservar</button></div></div>;
}

/** Chamada: marca quem veio; quem estava reservado e não veio vira falta. */
function Chamada({ sessao, onDone }: { sessao: any; onDone: () => void }) {
  const [veio, setVeio] = useState<Set<string>>(new Set(sessao.bookings.filter((b: any) => b.status === 'ATTENDED').map((b: any) => b.customerId)));
  const salvar = useAction(async () => { await post(`/m/academia/agenda/${sessao.id}/chamada`, { presentes: [...veio] }); onDone(); });
  const tirar = useAction(async (customerId: string) => { await del(`/m/academia/agenda/${sessao.id}/reservas/${customerId}`); onDone(); });
  if (!sessao.bookings.length) return <div className="muted">Ninguém reservou esta aula.</div>;
  return <div className="grid" style={{ gap: 8 }}>
    {sessao.bookings.map((b: any) => <div key={b.customerId} className="row between"><label className="row"><input type="checkbox" checked={veio.has(b.customerId)} onChange={(e) => setVeio((s) => { const n = new Set(s); if (e.target.checked) n.add(b.customerId); else n.delete(b.customerId); return n; })} /> {b.customer.name}</label>
      <span className="row"><Badge s={b.status} />{b.status === 'BOOKED' && <button className="btn" onClick={() => void tirar.run(b.customerId)}>Cancelar reserva</button>}</span></div>)}
    <ErrorBox error={salvar.error ?? tirar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy} onClick={() => void salvar.run()}>Salvar chamada</button></div>
  </div>;
}
