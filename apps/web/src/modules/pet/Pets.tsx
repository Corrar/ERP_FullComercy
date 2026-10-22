// Pets e tutores: busca por nome do pet ou do tutor, cadastro e a ficha (vacinas, banhos,
// compras e — para quem pode — o prontuário).
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { d, dt } from '@/lib/format';

export const ESPECIE: Record<string, string> = { CAO: 'Cão', GATO: 'Gato', OUTRO: 'Outro' };

export function Pets() {
  const nav = useNavigate(); const { can } = useSession();
  const [q, setQ] = useState(''); const [novo, setNovo] = useState(false);
  const pets = useGet<any[]>('/m/pet/pets', { q: q.trim() || undefined });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Pets e tutores</h1>{can('pet.pets:manage') && <button className="btn primary" onClick={() => setNovo(true)}>Novo pet</button>}</div>
    <Card><input className="input" placeholder="Nome do pet ou do tutor" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <Table rows={pets.data} empty="Nenhum pet." onRow={(p) => nav(`/pet/pets/${p.id}`)} cols={[{ h: 'Pet', c: (p) => p.name }, { h: 'Espécie', c: (p) => `${ESPECIE[p.species] ?? p.species}${p.breed ? ` · ${p.breed}` : ''}` }, { h: 'Porte', c: (p) => p.size ?? '—' }, { h: 'Tutor', c: (p) => <>{p.customer.name}<div className="muted">{p.customer.phone}</div></> }]} /></Card>
    <Modal title="Novo pet" open={novo} onClose={() => setNovo(false)}>{novo && <NovoPet onDone={(id) => nav(`/pet/pets/${id}`)} />}</Modal>
  </div>;
}

function NovoPet({ onDone }: { onDone: (id: string) => void }) {
  const [tutor, setTutor] = useState<ClienteMin | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => {
    if (!tutor) throw new Error('Escolha o tutor.');
    const p = await post<any>('/m/pet/pets', { customerId: tutor.id, name: v.name, species: v.species, breed: v.breed, size: v.size || undefined, sex: v.sex || undefined, weightKg: v.weightKg, birthDate: v.birthDate, allergies: v.allergies });
    onDone(p.id);
  });
  return <div className="grid" style={{ gap: 12 }}><EscolherCliente value={tutor} onChange={setTutor} rotulo="Tutor" /><ErrorBox error={salvar.error} />
    <Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <div className="row"><Field label="Nome do pet"><input className="input" name="name" required /></Field><Field label="Espécie"><select className="input" name="species" defaultValue="CAO">{Object.entries(ESPECIE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
      <div className="row"><Field label="Raça"><input className="input" name="breed" /></Field><Field label="Porte"><select className="input" name="size" defaultValue=""><option value="">—</option><option value="P">Pequeno</option><option value="M">Médio</option><option value="G">Grande</option></select></Field><Field label="Sexo"><select className="input" name="sex" defaultValue=""><option value="">—</option><option value="M">Macho</option><option value="F">Fêmea</option></select></Field></div>
      <div className="row"><Field label="Peso (kg)"><input className="input" name="weightKg" type="number" step="0.1" min={0.1} /></Field><Field label="Nascimento"><input className="input" name="birthDate" type="date" /></Field></div>
      <Field label="Alergias / cuidados"><input className="input" name="allergies" /></Field>
    </Form></div>;
}

export function FichaPet() {
  const { id } = useParams(); const { can } = useSession();
  const f = useGet<any>(`/m/pet/pets/${id}`);
  const [vac, setVac] = useState(false); const [at, setAt] = useState(false);
  const vacina = useAction(async (v: Record<string, any>) => { await post(`/m/pet/pets/${id}/vacinas`, v); setVac(false); await f.reload(); });
  const atend = useAction(async (v: Record<string, any>) => { await post(`/m/pet/pets/${id}/atendimentos`, v); setAt(false); await f.reload(); });
  if (!f.data) return <Card><ErrorBox error={f.error} />{!f.error && 'Carregando…'}</Card>;
  const p = f.data; const vet = can('pet.vet:manage');
  return <div className="grid">
    <div><h1 style={{ margin: 0 }}>{p.name}</h1><div className="muted">{ESPECIE[p.species]}{p.breed ? ` · ${p.breed}` : ''}{p.size ? ` · porte ${p.size}` : ''}{p.weightKg ? ` · ${p.weightKg} kg` : ''} · tutor {p.customer.name} {p.customer.phone ?? ''}</div>
      {p.allergies && <div className="error-box" style={{ marginTop: 8 }}>Alergias/cuidados: {p.allergies}</div>}</div>
    <Card title="Vacinas" actions={vet && <button className="btn" onClick={() => setVac(true)}>Registrar vacina</button>}><Table<any> rows={p.vacinas} empty="Nenhuma vacina registrada." cols={[{ h: 'Vacina', c: (v) => v.name }, { h: 'Aplicada', c: (v) => d(v.appliedAt) }, { h: 'Próxima', c: (v) => d(v.nextDueAt) }, { h: 'Lote', c: (v) => v.lot ?? '—' }]} /></Card>
    {p.prontuario && <Card title="Prontuário" actions={vet && <button className="btn" onClick={() => setAt(true)}>Novo atendimento</button>}><Table<any> rows={p.prontuario} empty="Sem atendimentos." cols={[{ h: 'Data', c: (r) => dt(r.date) }, { h: 'Tipo', c: (r) => r.kind }, { h: 'Queixa', c: (r) => r.complaint ?? '—' }, { h: 'Diagnóstico', c: (r) => r.diagnosis ?? '—' }, { h: 'Prescrição', c: (r) => r.prescription ?? '—' }, { h: 'Retorno', c: (r) => d(r.returnAt) }]} /></Card>}
    <Card title="Banho e tosa"><Table<any> rows={p.banhos} empty="Nenhum." cols={[{ h: 'Quando', c: (b) => dt(b.scheduledAt) }, { h: 'Serviços', c: (b) => b.services }, { h: 'Valor', c: (b) => <Money v={b.price} />, right: true }, { h: 'Status', c: (b) => <Badge s={b.status} /> }]} /></Card>
    <Card title="Compras"><Table<any> rows={p.compras} empty="Nenhuma." cols={[{ h: '#', c: (o) => o.number }, { h: 'Quando', c: (o) => dt(o.createdAt) }, { h: 'Total', c: (o) => <Money v={o.total} />, right: true }, { h: 'Status', c: (o) => <Badge s={o.status} /> }]} /></Card>
    <Modal title="Registrar vacina" open={vac} onClose={() => setVac(false)}><ErrorBox error={vacina.error} /><Form onSubmit={(v) => void vacina.run(v)} busy={vacina.busy}>
      <Field label="Vacina"><input className="input" name="name" required placeholder="V10, Antirrábica…" /></Field>
      <div className="row"><Field label="Aplicada em"><input className="input" name="appliedAt" type="date" required defaultValue={new Date().toLocaleDateString('sv-SE')} /></Field><Field label="Próxima dose"><input className="input" name="nextDueAt" type="date" /></Field></div>
      <div className="row"><Field label="Lote"><input className="input" name="lot" /></Field><Field label="Veterinário"><input className="input" name="vetName" /></Field></div></Form></Modal>
    <Modal title="Novo atendimento" open={at} onClose={() => setAt(false)}><ErrorBox error={atend.error} /><Form onSubmit={(v) => void atend.run(v)} busy={atend.busy}>
      <Field label="Tipo"><select className="input" name="kind" defaultValue="CONSULTA"><option>CONSULTA</option><option>RETORNO</option><option>EXAME</option><option>CIRURGIA</option></select></Field>
      <Field label="Queixa"><textarea className="input" name="complaint" rows={2} /></Field><Field label="Diagnóstico"><textarea className="input" name="diagnosis" rows={2} /></Field><Field label="Prescrição"><textarea className="input" name="prescription" rows={3} /></Field>
      <div className="row"><Field label="Peso (kg)"><input className="input" name="weightKg" type="number" step="0.1" min={0.1} /></Field><Field label="Retorno em"><input className="input" name="returnAt" type="date" /></Field><Field label="Veterinário"><input className="input" name="vetName" /></Field></div></Form></Modal>
  </div>;
}
