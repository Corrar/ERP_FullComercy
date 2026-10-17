import { useGet } from '@/lib/use-api';
import { Card, Kpi, Table } from '@/components/ui';
import { d } from '@/lib/format';

export function Painel() {
  const p = useGet<any>('/m/academia/painel'); const sumidos = useGet<any[]>('/m/academia/relatorios/sumidos', { dias: 14 }); const aVencer = useGet<any[]>('/m/academia/matriculas/a-vencer');
  if (!p.data) return <div className="muted">Carregando…</div>;
  return <div className="grid">
    <h1>Academia</h1>
    <div className="grid kpis"><Kpi label="Alunos ativos" value={p.data.ativos} /><Kpi label="Receita recorrente (MRR)" value={p.data.mrr} money /><Kpi label="Novos no mês" value={p.data.novosNoMes} /><Kpi label="Cancelados no mês" value={p.data.canceladosNoMes} /><Kpi label="Churn do mês" value={`${(p.data.churnMes * 100).toFixed(1)}%`} /><Kpi label="Inadimplentes" value={p.data.inadimplentes} /><Kpi label="Check-ins hoje" value={p.data.checkinsHoje} /></div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Card title="Sumidos há 14+ dias (retenção)"><Table rows={sumidos.data} empty="Todo mundo apareceu." cols={[{ h: 'Aluno', c: (r) => r.nome }, { h: 'Telefone', c: (r) => r.telefone ?? '—' }, { h: 'Plano', c: (r) => r.plano }, { h: 'Último check-in', c: (r) => r.ultimo_checkin ? d(r.ultimo_checkin) : 'nunca' }]} /></Card>
      <Card title="Vencem em 7 dias"><Table rows={aVencer.data} empty="Nada vencendo." cols={[{ h: 'Aluno', c: (r) => r.customer.name }, { h: 'Plano', c: (r) => r.plan.name }, { h: 'Vence', c: (r) => d(r.nextBillingAt) }]} /></Card>
    </div>
  </div>;
}
