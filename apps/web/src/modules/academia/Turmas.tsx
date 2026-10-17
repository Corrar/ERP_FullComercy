import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Turmas() {
  const turmas = useGet<any[]>('/m/academia/turmas'); const agenda = useGet<any[]>('/m/academia/agenda'); const [nova, setNova] = useState(false);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/academia/turmas', { name: v.name, capacity: v.capacity, durationMin: v.durationMin, schedule: [{ weekday: Number(v.weekday), time: v.time }] }); setNova(false); await turmas.reload(); await post('/m/academia/turmas/gerar-sessoes?dias=14'); await agenda.reload(); });
  const reservar = useAction(async (sessionId: string) => { const id = prompt('ID do aluno (cliente)'); if (id) { await post(`/m/academia/agenda/${sessionId}/reservas`, { customerId: id }); await agenda.reload(); } });
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Turmas</h1><button className="btn primary" onClick={() => setNova(true)}>Nova turma</button></div>
    <ErrorBox error={reservar.error} />
    <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
      <Card title="Turmas">{turmas.data?.map((t) => <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><strong>{t.name}</strong><div className="muted">{t.instructor?.name ?? 'sem instrutor'} · {t.capacity} vagas · {(t.schedule as any[]).map((s) => `${DIAS[s.weekday]} ${s.time}`).join(', ')}</div></div>)}</Card>
      <Card title="Agenda (7 dias)"><Table rows={agenda.data} empty="Sem sessões. Crie turmas ou gere as sessões." cols={[{ h: 'Quando', c: (r) => dt(r.startsAt) }, { h: 'Turma', c: (r) => r.class.name }, { h: 'Instrutor', c: (r) => r.class.instructor?.name ?? '—' }, { h: 'Vagas', c: (r) => `${r._count.bookings}/${r.capacity}`, right: true }, { h: '', c: (r) => <button className="btn" onClick={() => void reservar.run(r.id)}>Reservar</button> }]} /></Card>
    </div>
    <Modal title="Nova turma" open={nova} onClose={() => setNova(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><div className="row"><Field label="Capacidade"><input className="input" name="capacity" type="number" defaultValue={20} /></Field><Field label="Duração (min)"><input className="input" name="durationMin" type="number" defaultValue={60} /></Field></div>
      <div className="row"><Field label="Dia da semana"><select className="input" name="weekday">{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field><Field label="Horário"><input className="input" name="time" type="time" defaultValue="18:00" required /></Field></div></Form></Modal>
  </div>;
}
