// modules/varejo/Relatorios.tsx — relatórios da loja (varejo.relatorios): o resumo do período
// (vendas, faturamento, ticket médio, peças por venda) e uma aba por rota de /m/varejo/relatorios.
import { useState } from 'react';
import { baixarArquivo } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Kpi, Money, Table, Tabs } from '@/components/ui';
import { num } from '@/lib/format';

export const MEIO: Record<string, string> = { CASH: 'Dinheiro', PIX: 'Pix', DEBIT: 'Débito', CREDIT: 'Crédito', TRANSFER: 'Transferência', STORE_CREDIT: 'Vale-troca', VOUCHER: 'Voucher', OTHER: 'Outro' };
const hoje = () => new Date().toLocaleDateString('sv-SE'); // aaaa-mm-dd no fuso do navegador
const inicioDoMes = () => `${hoje().slice(0, 8)}01`; // o mesmo padrão da API: do dia 1 até agora

export function Relatorios() {
  const [tab, setTab] = useState('vendedores');
  const [de, setDe] = useState(inicioDoMes()); const [ate, setAte] = useState(hoje());
  const query = { from: de ? new Date(`${de}T00:00:00`).toISOString() : undefined, to: ate ? new Date(`${ate}T23:59:59.999`).toISOString() : undefined };
  const rota = `/m/varejo/relatorios/${tab === 'semgiro' ? 'sem-giro' : tab}`;
  const r = useGet<any[]>(rota, tab === 'semgiro' ? undefined : query);
  const resumo = useGet<any>('/m/varejo/relatorios/resumo', query);
  // CSV pelo cliente da API (Bearer): o link direto para /api ia sem token e voltava 401.
  const csv = useAction(() => baixarArquivo(rota, { ...(tab === 'semgiro' ? {} : query), format: 'csv' }, `relatorio-${tab}.csv`));
  const rows = r.loading ? null : r.data;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Relatórios da loja</h1><div className="row">
      <input className="input" type="date" aria-label="De" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} style={{ width: 160 }} />
      <span className="muted">até</span>
      <input className="input" type="date" aria-label="Até" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} style={{ width: 160 }} />
      <button className="btn" onClick={() => void csv.run()} disabled={csv.busy}>CSV</button>
    </div></div>
    <ErrorBox error={csv.error ?? r.error ?? resumo.error} />
    {resumo.data && <div className="grid kpis" data-testid="resumo-loja">
      <Kpi label="Vendas" value={resumo.data.vendas} /><Kpi label="Faturamento" value={resumo.data.total} money />
      <Kpi label="Ticket médio" value={resumo.data.ticketMedio} money /><Kpi label="Peças por venda" value={resumo.data.pecasPorVenda} />
    </div>}
    <Tabs tabs={[{ k: 'vendedores', label: 'Por vendedor' }, { k: 'pagamentos', label: 'Por forma de pagamento' }, { k: 'horas', label: 'Por hora' }, { k: 'abc', label: 'Curva ABC' }, { k: 'semgiro', label: 'Sem giro' }]} active={tab} onChange={setTab} />
    <Card>
      {tab === 'vendedores' && <Table rows={rows} empty="Nenhuma venda no período." cols={[{ h: 'Vendedor', c: (x) => x.vendedor }, { h: 'Vendas', c: (x) => x.vendas, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }, { h: 'Comissão', c: (x) => <Money v={x.comissao} />, right: true }]} />}
      {tab === 'pagamentos' && <Table rows={rows} empty="Nenhuma venda no período." cols={[{ h: 'Forma de pagamento', c: (x) => MEIO[x.meio] ?? x.meio }, { h: 'Vendas', c: (x) => x.vendas, right: true }, { h: 'Recebido', c: (x) => <Money v={x.total} />, right: true }, { h: 'Ticket médio', c: (x) => <Money v={x.ticket_medio} />, right: true }]} />}
      {tab === 'horas' && <Table rows={rows} empty="Nenhuma venda no período." cols={[{ h: 'Hora', c: (x) => `${x.hora}h` }, { h: 'Vendas', c: (x) => x.vendas, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} />}
      {tab === 'abc' && <Table rows={rows} empty="Nenhuma venda no período." cols={[{ h: 'Classe', c: (x) => x.classe }, { h: 'Produto', c: (x) => x.produto }, { h: 'SKU', c: (x) => x.sku }, { h: 'Qtd', c: (x) => num(x.qtd), right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }, { h: '%', c: (x) => (x.participacao * 100).toFixed(1), right: true }]} />}
      {tab === 'semgiro' && <Table rows={rows} empty="Nada parado: todo produto com saldo vendeu nos últimos 60 dias." cols={[{ h: 'SKU', c: (x) => x.sku }, { h: 'Produto', c: (x) => x.produto }, { h: 'Variante', c: (x) => x.variante ?? '—' }, { h: 'Saldo', c: (x) => num(x.saldo), right: true }, { h: 'Última venda', c: (x) => x.ultima_venda ? new Date(x.ultima_venda).toLocaleDateString('pt-BR') : 'nunca' }]} />}
    </Card>
  </div>;
}
