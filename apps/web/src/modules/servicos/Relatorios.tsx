// modules/servicos/Relatorios.tsx — relatórios da oficina (svc.relatorios). Mesmo molde dos
// Relatórios da loja: uma aba por rota de /m/servicos/relatorios e o CSV que a própria API gera
// com `?format=csv` (baixado por lib/api.ts, para levar o Bearer). Técnicos e serviços são por
// período; o retorno é por "dias sem voltar" (a régua de revisão).
import { useState } from 'react';
import { api } from '@/lib/api';
import { d } from '@/lib/format';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Money, Table, Tabs } from '@/components/ui';

const dia = (x: Date) => x.toLocaleDateString('sv-SE'); // aaaa-mm-dd no fuso do navegador

export function Relatorios() {
  const [tab, setTab] = useState('tecnicos');
  // Padrão igual ao da API (do dia 1º do mês até hoje). "Até" fecha às 23:59 do dia escolhido.
  const [de, setDe] = useState(() => { const x = new Date(); x.setDate(1); return dia(x); }); const [ate, setAte] = useState(() => dia(new Date()));
  const [dias, setDias] = useState(180);
  const query = tab === 'retorno' ? { dias: dias > 0 ? dias : undefined }
    : { from: de ? new Date(`${de}T00:00:00`).toISOString() : undefined, to: ate ? new Date(`${ate}T23:59:59.999`).toISOString() : undefined };
  const path = `/m/servicos/relatorios/${tab}`;
  const r = useGet<any[]>(path, query);
  const csv = useAction(async () => {
    const res = await api<Response>(path, { query: { ...query, format: 'csv' }, raw: true });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Erro ${res.status}`);
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `oficina-${tab}.csv`; a.click(); URL.revokeObjectURL(url);
  });
  // Na troca de aba o dado anterior ainda está em `r.data`: mostra "Carregando…" em vez de colunas trocadas.
  const rows = r.loading ? null : r.data;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Relatórios da oficina</h1><div className="row">
      {tab === 'retorno'
        ? <><span className="muted">sem voltar há mais de</span><input className="input" type="number" min={1} aria-label="Dias sem voltar" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ width: 100 }} /><span className="muted">dias</span></>
        : <><input className="input" type="date" aria-label="De" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} style={{ width: 160 }} />
          <span className="muted">até</span>
          <input className="input" type="date" aria-label="Até" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} style={{ width: 160 }} /></>}
      <button className="btn" onClick={() => void csv.run()} disabled={csv.busy}>{csv.busy ? '…' : 'CSV'}</button>
    </div></div>
    <Tabs tabs={[{ k: 'tecnicos', label: 'Por técnico' }, { k: 'servicos', label: 'Serviços mais vendidos' }, { k: 'retorno', label: 'Retorno de clientes' }]} active={tab} onChange={setTab} />
    <ErrorBox error={r.error ?? csv.error} />
    <Card>
      {tab === 'tecnicos' && <Table rows={rows} empty="Nenhuma OS entregue no período." cols={[{ h: 'Técnico', c: (x) => x.tecnico }, { h: 'OS entregues', c: (x) => x.os_entregues, right: true }, { h: 'Faturado', c: (x) => <Money v={x.faturado} />, right: true }, { h: 'Tempo médio', c: (x) => (x.tempo_medio_h == null ? '—' : `${x.tempo_medio_h.toFixed(1).replace('.', ',')} h`), right: true }]} />}
      {tab === 'servicos' && <Table rows={rows} empty="Nenhum serviço vendido no período." cols={[{ h: 'Serviço', c: (x) => x.servico }, { h: 'Vezes', c: (x) => x.vezes, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} />}
      {tab === 'retorno' && <Table rows={rows} empty="Nenhum veículo passou do prazo de retorno." cols={[{ h: 'Placa', c: (x) => <span className="mono">{x.plate}</span> }, { h: 'Veículo', c: (x) => x.modelo || '—' }, { h: 'Cliente', c: (x) => x.cliente }, { h: 'Telefone', c: (x) => x.telefone ?? '—' }, { h: 'Última OS', c: (x) => d(x.ultima_os) }]} />}
    </Card>
  </div>;
}
