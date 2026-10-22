import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Field, Kpi } from '@/components/ui';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Relatorios() {
  const hoje = new Date();
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); const [ate, setAte] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)));
  const r = useGet<any>('/m/hotel/relatorios/ocupacao', { from: de, to: ate });
  return <div className="grid"><h1>Ocupação</h1>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até (exclusive)"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    {r.data && <div className="grid kpis">
      <Kpi label="Ocupação" value={`${r.data.ocupacao}%`} /><Kpi label="Diária média (ADR)" value={r.data.diariaMedia} money /><Kpi label="RevPAR" value={r.data.revpar} money />
      <Kpi label="Noites vendidas" value={`${r.data.noitesVendidas} de ${r.data.noitesDisponiveis}`} /><Kpi label="Receita de diárias" value={r.data.receitaDiarias} money /></div>}
  </div>;
}
