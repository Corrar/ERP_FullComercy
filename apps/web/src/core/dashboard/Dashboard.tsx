import { useGet } from '@/lib/use-api';
import { Card, Kpi } from '@/components/ui';
import { brl } from '@/lib/format';
import { PrimeirosPassos } from './PrimeirosPassos';
import { useSession } from '@/lib/session';

const LABEL: Record<string, string> = {
  caixasAbertos: 'Caixas abertos', comissoesPendentes: 'Comissões pendentes', mesasOcupadas: 'Mesas ocupadas', comandasAbertas: 'Comandas abertas', naCozinha: 'Na cozinha', entregasEmCurso: 'Entregas em curso',
  alunosAtivos: 'Alunos ativos', inadimplentes: 'Inadimplentes', checkinsHoje: 'Check-ins hoje', osNoPatio: 'OS no pátio', aguardandoAprovacao: 'Aguardando aprovação', prontos: 'Prontos p/ retirada', agendadosHoje: 'Agendados hoje',
  emAtendimento: 'Em atendimento', faltasHoje: 'Faltas hoje', banhosHoje: 'Banhos hoje', prontosParaBuscar: 'Prontos para buscar', vacinasVencidas: 'Vacinas vencidas',
  consultasHoje: 'Consultas hoje', naRecepcao: 'Na recepção', convenioAReceber: 'Convênio a receber', quartosOcupados: 'Quartos ocupados', chegadasHoje: 'Chegadas hoje', saidasHoje: 'Saídas hoje', emLimpeza: 'Em limpeza',
};
const MOD: Record<string, string> = { VAREJO: 'Varejo', FOOD: 'Food & Delivery', ACADEMIA: 'Academia', SERVICOS: 'Serviços', BELEZA: 'Beleza', PET: 'Pet', CLINICA: 'Clínica', HOTEL: 'Hotelaria' };

export function Dashboard() {
  const { data, loading } = useGet('/dashboard');
  const { can } = useSession();
  const vendas = useGet(can('core.orders:view') ? '/orders/dashboard' : null);
  if (loading || !data) return <div className="muted">Carregando…</div>;
  return <div className="grid">
    <h1>Hoje</h1>
    <PrimeirosPassos />
    {/* A API só manda o que a pessoa pode ver (permissão já cortada pelo plano): card sem campo some. */}
    {(data.hoje || data.financeiro || data.estoque) && <div className="grid kpis">
      {data.hoje && <><Kpi label="Vendas concluídas" value={data.hoje.vendas} /><Kpi label="Faturamento" value={data.hoje.faturamento} money /></>}
      {data.financeiro && <><Kpi label="A receber (em aberto)" value={data.financeiro.aReceber} money /><Kpi label="Títulos vencidos" value={data.financeiro.titulosVencidos} /></>}
      {data.estoque && <Kpi label="Itens abaixo do mínimo" value={data.estoque.itensAbaixoDoMinimo} />}
      {data.pedidosAbertos != null && <Kpi label="Pedidos abertos" value={data.pedidosAbertos} />}
    </div>}
    {Object.entries(data.modulos as Record<string, Record<string, number>>).map(([k, v]) => <div key={k}><h2>{MOD[k] ?? k}</h2><div className="grid kpis">{Object.entries(v).map(([kk, vv]) => <Kpi key={kk} label={LABEL[kk] ?? kk} value={vv} />)}</div></div>)}
    {vendas.data && <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Card title="Por meio de pagamento">{vendas.data.porMeioPagamento.length ? vendas.data.porMeioPagamento.map((r: any) => <div key={r.metodo} className="row between"><span>{r.metodo}</span><span className="mono">{brl(r.total)}</span></div>) : <div className="muted">Sem pagamentos hoje.</div>}</Card>
      <Card title="Itens mais vendidos">{vendas.data.topItens.length ? vendas.data.topItens.map((r: any) => <div key={r.item} className="row between"><span>{r.item}</span><span className="mono">{brl(r.total)}</span></div>) : <div className="muted">Sem vendas hoje.</div>}</Card>
    </div>}
  </div>;
}
