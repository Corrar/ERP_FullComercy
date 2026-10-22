// Lembretes da veterinária: vacinas vencidas ou vencendo e retornos marcados, com o telefone do
// tutor para avisar.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGet } from '@/lib/use-api';
import { Card, Field, Table } from '@/components/ui';
import { d } from '@/lib/format';

export function Veterinaria() {
  const nav = useNavigate(); const [dias, setDias] = useState(30);
  const l = useGet<any>('/m/pet/lembretes', { dias });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Veterinária · lembretes</h1><Field label="Próximos (dias)"><input className="input" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(Number(e.target.value) || 30)} style={{ width: 100 }} /></Field></div>
    <Card title="Vacinas"><Table<any> rows={l.data?.vacinas} empty="Nenhuma vacina vencendo." onRow={(v) => nav(`/pet/pets/${v.petId}`)} cols={[{ h: 'Pet', c: (v) => v.pet.name }, { h: 'Vacina', c: (v) => v.name }, { h: 'Vence', c: (v) => <span style={v.vencida ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{d(v.nextDueAt)}{v.vencida ? ' (vencida)' : ''}</span> }, { h: 'Tutor', c: (v) => `${v.pet.customer.name} ${v.pet.customer.phone ?? ''}` }]} /></Card>
    <Card title="Retornos"><Table<any> rows={l.data?.retornos} empty="Nenhum retorno marcado." onRow={(r) => nav(`/pet/pets/${r.petId}`)} cols={[{ h: 'Pet', c: (r) => r.pet.name }, { h: 'Retorno', c: (r) => d(r.returnAt) }, { h: 'Motivo', c: (r) => r.diagnosis ?? r.complaint ?? r.kind }, { h: 'Tutor', c: (r) => `${r.pet.customer.name} ${r.pet.customer.phone ?? ''}` }]} /></Card>
  </div>;
}
