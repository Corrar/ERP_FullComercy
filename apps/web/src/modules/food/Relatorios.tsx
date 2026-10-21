// modules/food/Relatorios.tsx — relatórios do restaurante (food.relatorios). Mesmo molde dos
// Relatórios da loja: uma aba por rota de /m/food/relatorios, o período no topo e o CSV que a
// própria API gera com `?format=csv` (baixado por lib/api.ts, para levar o Bearer).
import { useState } from 'react';
import { api } from '@/lib/api';
import { num } from '@/lib/format';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Money, Table, Tabs } from '@/components/ui';

const TIPO: Record<string, string> = { DINE_IN: 'Salão', TAKEOUT: 'Retirada', DELIVERY: 'Delivery' };
const hoje = () => new Date().toLocaleDateString('sv-SE'); // aaaa-mm-dd no fuso do navegador

export function Relatorios() {
  const [tab, setTab] = useState('itens');
  // Padrão igual ao da API (o dia de hoje). As datas viram instantes locais: "até" fecha às 23:59.
  const [de, setDe] = useState(hoje()); const [ate, setAte] = useState(hoje());
  const query = { from: de ? new Date(`${de}T00:00:00`).toISOString() : undefined, to: ate ? new Date(`${ate}T23:59:59.999`).toISOString() : undefined };
  const path = `/m/food/relatorios/${tab}`;
  const r = useGet<any[]>(path, query);
  const csv = useAction(async () => {
    const res = await api<Response>(path, { query: { ...query, format: 'csv' }, raw: true });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `food-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  });
  // Na troca de aba o dado anterior ainda está em `r.data`: mostra "Carregando…" em vez de colunas trocadas.
  const rows = r.loading ? null : r.data;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Relatórios do restaurante</h1><div className="row">
      <input className="input" type="date" aria-label="De" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} style={{ width: 160 }} />
      <span className="muted">até</span>
      <input className="input" type="date" aria-label="Até" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} style={{ width: 160 }} />
      <button className="btn" onClick={() => void csv.run()} disabled={csv.busy}>{csv.busy ? '…' : 'CSV'}</button>
    </div></div>
    <Tabs tabs={[{ k: 'itens', label: 'Por item' }, { k: 'tipos', label: 'Por tipo' }, { k: 'horas', label: 'Por hora' }, { k: 'entregadores', label: 'Entregadores' }]} active={tab} onChange={setTab} />
    <ErrorBox error={r.error ?? csv.error} />
    <Card>
      {tab === 'itens' && <Table rows={rows} empty="Nenhum item vendido no período." cols={[{ h: 'Item', c: (x) => x.item }, { h: 'Qtd', c: (x) => num(x.qtd), right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} />}
      {tab === 'tipos' && <Table rows={rows} empty="Nenhum pedido concluído no período." cols={[{ h: 'Tipo', c: (x) => TIPO[x.tipo] ?? x.tipo }, { h: 'Pedidos', c: (x) => x.pedidos, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }, { h: 'Ticket médio', c: (x) => <Money v={x.ticket_medio} />, right: true }]} />}
      {tab === 'horas' && <Table rows={rows} empty="Nenhum pedido no período." cols={[{ h: 'Hora', c: (x) => `${x.hora}h` }, { h: 'Pedidos', c: (x) => x.pedidos, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} />}
      {tab === 'entregadores' && <Table rows={rows} empty="Nenhuma entrega no período." cols={[{ h: 'Entregador', c: (x) => x.entregador }, { h: 'Entregas', c: (x) => x.entregas, right: true }, { h: 'Falhas', c: (x) => x.falhas, right: true }, { h: 'Tempo médio', c: (x) => (x.tempo_medio_min == null ? '—' : `${Math.round(x.tempo_medio_min)} min`), right: true }, { h: 'Taxas', c: (x) => <Money v={x.taxas} />, right: true }]} />}
    </Card>
  </div>;
}
