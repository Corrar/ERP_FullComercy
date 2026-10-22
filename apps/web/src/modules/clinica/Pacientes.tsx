// Pacientes: busca e a ficha (dados, ficha clínica, consultas e — para quem pode — prontuário).
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { d, dt } from '@/lib/format';
import { TIPO } from './Agenda';

export function Pacientes() {
  const nav = useNavigate(); const [q, setQ] = useState('');
  const lista = useGet<any[]>(q.trim().length >= 2 ? '/customers' : null, { q: q.trim() });
  return <div className="grid"><h1>Pacientes</h1>
    <Card><input className="input" placeholder="Nome, telefone ou documento" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {q.trim().length >= 2 ? <Table rows={lista.data} empty="Nenhum paciente." onRow={(c) => nav(`/clinica/pacientes/${c.id}`)} cols={[{ h: 'Paciente', c: (c) => c.name }, { h: 'Documento', c: (c) => c.document ?? '—' }, { h: 'Telefone', c: (c) => c.phone ?? '—' }]} /> : <div className="muted">Digite ao menos 2 letras. Paciente novo nasce ao agendar.</div>}</Card></div>;
}

export function FichaPaciente() {
  const { id } = useParams(); const { can } = useSession();
  const f = useGet<any>(`/m/clinica/pacientes/${id}`); const convs = useGet<any[]>('/m/clinica/convenios'); const profs = useGet<any[]>('/m/clinica/profissionais');
  const [ficha, setFicha] = useState(false); const [evo, setEvo] = useState(false);
  const salvarFicha = useAction(async (v: Record<string, any>) => { await put(`/m/clinica/pacientes/${id}/ficha`, { birthDate: v.birthDate ?? null, insuranceId: v.insuranceId || null, insuranceCard: v.insuranceCard ?? null, allergies: v.allergies ?? null, notes: v.notes ?? null }); setFicha(false); await f.reload(); });
  const salvarEvo = useAction(async (v: Record<string, any>) => { await post(`/m/clinica/pacientes/${id}/prontuario`, { professionalId: v.professionalId, appointmentId: v.appointmentId || undefined, anamnesis: v.anamnesis, evolution: v.evolution, prescription: v.prescription, returnAt: v.returnAt }); setEvo(false); await f.reload(); });
  if (!f.data) return <Card><ErrorBox error={f.error} />{!f.error && 'Carregando…'}</Card>;
  const p = f.data; const pf = p.perfil;
  return <div className="grid">
    <div><h1 style={{ margin: 0 }}>{p.name}</h1><div className="muted">{p.document ?? ''} {p.phone ?? ''} {p.email ?? ''}</div></div>
    {pf?.allergies && <div className="error-box">Alergias: {pf.allergies}</div>}
    <Card title="Ficha clínica" actions={<button className="btn" onClick={() => setFicha(true)}>Editar</button>}>
      <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}><span>Nascimento: <strong>{d(pf?.birthDate)}</strong></span><span>Convênio: <strong>{pf?.insurance?.name ?? 'particular'}</strong>{pf?.insuranceCard ? ` · carteirinha ${pf.insuranceCard}` : ''}</span></div>
      {pf?.notes && <div className="muted" style={{ marginTop: 6 }}>{pf.notes}</div>}</Card>
    <Card title="Consultas"><Table<any> rows={p.consultas} empty="Nenhuma consulta." cols={[{ h: 'Quando', c: (a) => dt(a.startsAt) }, { h: 'Tipo', c: (a) => TIPO[a.kind] ?? a.kind }, { h: 'Profissional', c: (a) => a.professional.name }, { h: 'Pagador', c: (a) => a.payer === 'CONVENIO' ? a.insurance?.name : 'Particular' }, { h: 'Valor', c: (a) => <Money v={a.price} />, right: true }, { h: 'Status', c: (a) => <Badge s={a.status} /> }, { h: '', c: (a) => a.orderId && <a className="btn" href={`/clinica/recibo/${a.orderId}`}>Recibo</a> }]} /></Card>
    {p.prontuario && <Card title="Prontuário" actions={can('cli.prontuario:manage') && <button className="btn primary" onClick={() => setEvo(true)}>Nova evolução</button>}>
      {!p.prontuario.length && <div className="muted">Sem registros.</div>}
      {p.prontuario.map((r: any) => <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8 }}><div className="row between"><strong>{dt(r.date)} · {r.professional.name}</strong>{r.returnAt && <span className="muted">retorno {d(r.returnAt)}</span>}</div>
        {r.anamnesis && <p><strong>Anamnese:</strong> {r.anamnesis}</p>}{r.evolution && <p><strong>Evolução:</strong> {r.evolution}</p>}{r.prescription && <p style={{ whiteSpace: 'pre-wrap' }}><strong>Prescrição:</strong> {r.prescription}</p>}</div>)}</Card>}
    <Modal title="Ficha clínica" open={ficha} onClose={() => setFicha(false)}><ErrorBox error={salvarFicha.error} /><Form onSubmit={(v) => void salvarFicha.run(v)} busy={salvarFicha.busy}>
      <div className="row"><Field label="Nascimento"><input className="input" name="birthDate" type="date" defaultValue={pf?.birthDate?.slice(0, 10) ?? ''} /></Field><Field label="Convênio"><select className="input" name="insuranceId" defaultValue={pf?.insuranceId ?? ''}><option value="">Particular</option>{convs.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
      <Field label="Carteirinha"><input className="input" name="insuranceCard" defaultValue={pf?.insuranceCard ?? ''} /></Field>
      <Field label="Alergias"><input className="input" name="allergies" defaultValue={pf?.allergies ?? ''} /></Field><Field label="Observações"><textarea className="input" name="notes" rows={3} defaultValue={pf?.notes ?? ''} /></Field></Form></Modal>
    <Modal title="Nova evolução" open={evo} onClose={() => setEvo(false)} wide><ErrorBox error={salvarEvo.error} /><Form onSubmit={(v) => void salvarEvo.run(v)} busy={salvarEvo.busy}>
      <div className="row"><Field label="Profissional"><select className="input" name="professionalId" required>{profs.data?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Consulta"><select className="input" name="appointmentId" defaultValue=""><option value="">—</option>{p.consultas.map((a: any) => <option key={a.id} value={a.id}>{dt(a.startsAt)} · {TIPO[a.kind] ?? a.kind}</option>)}</select></Field></div>
      <Field label="Anamnese"><textarea className="input" name="anamnesis" rows={3} /></Field><Field label="Evolução"><textarea className="input" name="evolution" rows={3} /></Field><Field label="Prescrição"><textarea className="input" name="prescription" rows={4} /></Field>
      <Field label="Retorno em"><input className="input" name="returnAt" type="date" /></Field></Form></Modal>
  </div>;
}
