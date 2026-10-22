import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, Field, Kpi, Money, Table } from '@/components/ui';
import { st } from '@/lib/format';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Relatorios() {
  const [de, setDe] = useState(iso(new Date(new Date().setDate(1)))); const [ate, setAte] = useState(iso(new Date()));
  const r = useGet<any>('/m/pet/relatorios/resumo', { from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(`${ate}T23:59:59`).toISOString() });
  return <div className="grid">
    <h1>Relatórios do pet shop</h1>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    {r.data && <><div className="grid kpis"><Kpi label="Pets atendidos" value={r.data.petsAtendidos} />{r.data.porTipo.map((t: any) => <Kpi key={t.tipo} label={t.tipo} value={t.total} money />)}</div>
      <Card title="Banho e tosa por status"><Table<any> rows={r.data.banhos} cols={[{ h: 'Status', c: (b) => st(b.status) }, { h: 'Quantidade', c: (b) => b.quantidade, right: true }, { h: 'Valor', c: (b) => <Money v={b.valor} />, right: true }]} /></Card></>}
  </div>;
}
