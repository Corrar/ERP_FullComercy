import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, Field, Kpi, Money, Table, Tabs } from '@/components/ui';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Relatorios() {
  const [tab, setTab] = useState('profissionais');
  const [de, setDe] = useState(iso(new Date(new Date().setDate(1)))); const [ate, setAte] = useState(iso(new Date()));
  const r = useGet<any>(`/m/clinica/relatorios/${tab}`, { from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(`${ate}T23:59:59`).toISOString() });
  const rows = Array.isArray(r.data) ? r.data : null;
  return <div className="grid"><h1>Relatórios da clínica</h1>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    <Tabs tabs={[{ k: 'profissionais', label: 'Por profissional' }, { k: 'convenios', label: 'Por convênio' }, { k: 'faltas', label: 'Faltas' }]} active={tab} onChange={setTab} />
    {tab === 'profissionais' && <Card><Table<any> rows={rows} cols={[{ h: 'Profissional', c: (x) => x.profissional }, { h: 'Consultas', c: (x) => x.consultas, right: true }, { h: 'Faturado', c: (x) => <Money v={x.faturado} />, right: true }]} /></Card>}
    {tab === 'convenios' && <Card><Table<any> rows={rows} cols={[{ h: 'Convênio', c: (x) => x.convenio }, { h: 'Consultas', c: (x) => x.consultas, right: true }, { h: 'Faturado', c: (x) => <Money v={x.faturado} />, right: true }, { h: 'A receber', c: (x) => <Money v={x.aReceber} />, right: true }]} /></Card>}
    {tab === 'faltas' && r.data && !rows && <div className="grid kpis"><Kpi label="Agendadas" value={r.data.agendadas} /><Kpi label="Faltas" value={r.data.faltas} /><Kpi label="Taxa" value={`${r.data.taxa}%`} /></div>}
  </div>;
}
