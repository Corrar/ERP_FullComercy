import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, Money, Table, Tabs } from '@/components/ui';
import { num } from '@/lib/format';

export function Relatorios() {
  const [tab, setTab] = useState('vendedores');
  const r = useGet<any[]>(`/m/varejo/relatorios/${tab === 'semgiro' ? 'sem-giro' : tab}`);
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Relatórios da loja</h1><a className="btn" href={`/api/m/varejo/relatorios/${tab === 'semgiro' ? 'sem-giro' : tab}?format=csv`} target="_blank" rel="noreferrer">CSV</a></div>
    <Tabs tabs={[{ k: 'vendedores', label: 'Por vendedor' }, { k: 'horas', label: 'Por hora' }, { k: 'abc', label: 'Curva ABC' }, { k: 'semgiro', label: 'Sem giro' }]} active={tab} onChange={setTab} />
    <Card>
      {tab === 'vendedores' && <Table rows={r.data} cols={[{ h: 'Vendedor', c: (x) => x.vendedor }, { h: 'Vendas', c: (x) => x.vendas, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }, { h: 'Comissão', c: (x) => <Money v={x.comissao} />, right: true }]} />}
      {tab === 'horas' && <Table rows={r.data} cols={[{ h: 'Hora', c: (x) => `${x.hora}h` }, { h: 'Vendas', c: (x) => x.vendas, right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }]} />}
      {tab === 'abc' && <Table rows={r.data} cols={[{ h: 'Classe', c: (x) => x.classe }, { h: 'Produto', c: (x) => x.produto }, { h: 'SKU', c: (x) => x.sku }, { h: 'Qtd', c: (x) => num(x.qtd), right: true }, { h: 'Total', c: (x) => <Money v={x.total} />, right: true }, { h: '%', c: (x) => (x.participacao * 100).toFixed(1), right: true }]} />}
      {tab === 'semgiro' && <Table rows={r.data} cols={[{ h: 'SKU', c: (x) => x.sku }, { h: 'Produto', c: (x) => x.produto }, { h: 'Variante', c: (x) => x.variante ?? '—' }, { h: 'Saldo', c: (x) => num(x.saldo), right: true }, { h: 'Última venda', c: (x) => x.ultima_venda ? new Date(x.ultima_venda).toLocaleDateString('pt-BR') : 'nunca' }]} />}
    </Card>
  </div>;
}
