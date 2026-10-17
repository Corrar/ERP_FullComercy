import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGet } from '@/lib/use-api';
import { Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Veiculos() {
  const [q, setQ] = useState(''); const nav = useNavigate(); const v = useGet<any[]>('/m/servicos/veiculos', { q });
  return <div>
    <div className="row between"><h1>Veículos</h1><input className="input" placeholder="placa, modelo ou dono" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} /></div>
    <Table rows={v.data} onRow={(r) => nav(`/servicos/veiculos?q=${r.plate}`)} cols={[{ h: 'Placa', c: (r) => <strong>{r.plate}</strong> }, { h: 'Veículo', c: (r) => `${r.brand ?? ''} ${r.model ?? ''} ${r.year ?? ''}` }, { h: 'Dono', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Km', c: (r) => r.mileage ?? '—', right: true }, { h: 'Atualizado', c: (r) => dt(r.updatedAt) }]} />
  </div>;
}
