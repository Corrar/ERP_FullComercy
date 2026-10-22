import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, Field, Kpi, Money, Table, Tabs } from '@/components/ui';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Relatorios() {
  const [tab, setTab] = useState('profissionais');
  const [de, setDe] = useState(iso(new Date(new Date().setDate(1)))); const [ate, setAte] = useState(iso(new Date()));
  const q = { from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(`${ate}T23:59:59`).toISOString() };
  const r = useGet<any>(`/m/beleza/relatorios/${tab}`, q);
  return <div className="grid">
    <h1>Relatórios do salão</h1>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    <Tabs tabs={[{ k: 'profissionais', label: 'Por profissional' }, { k: 'servicos', label: 'Por serviço' }, { k: 'faltas', label: 'Faltas' }]} active={tab} onChange={setTab} />
    {tab === 'profissionais' && <Card><Table<any> rows={Array.isArray(r.data) ? r.data : null} cols={[{ h: 'Profissional', c: (x) => x.profissional }, { h: 'Atendimentos', c: (x) => x.atendimentos, right: true }, { h: 'Faturamento', c: (x) => <Money v={x.faturamento} />, right: true }, { h: 'Comissão', c: (x) => <Money v={x.comissao} />, right: true }]} /></Card>}
    {tab === 'servicos' && <Card><Table<any> rows={Array.isArray(r.data) ? r.data : null} cols={[{ h: 'Serviço', c: (x) => x.servico }, { h: 'Vezes', c: (x) => x.vezes, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} /></Card>}
    {tab === 'faltas' && r.data && !Array.isArray(r.data) && <div className="grid kpis"><Kpi label="Agendados" value={r.data.agendados} /><Kpi label="Faltas" value={r.data.faltas} /><Kpi label="Taxa de faltas" value={`${r.data.taxa}%`} /></div>}
  </div>;
}
