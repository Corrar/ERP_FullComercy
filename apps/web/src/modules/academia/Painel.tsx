import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, Kpi, Table } from '@/components/ui';
import { d } from '@/lib/format';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function Painel() {
  const p = useGet<any>('/m/academia/painel'); const sumidos = useGet<any[]>('/m/academia/relatorios/sumidos', { dias: 14 }); const aVencer = useGet<any[]>('/m/academia/matriculas/a-vencer');
  const [periodo] = useState(() => ({ from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() }));
  const freq = useGet<any[]>('/m/academia/relatorios/frequencia', periodo); const pico = useGet<any[]>('/m/academia/relatorios/pico', periodo);
  if (!p.data) return <div className="muted">Carregando…</div>;
  return <div className="grid">
    <h1>Academia</h1>
    <div className="grid kpis"><Kpi label="Alunos ativos" value={p.data.ativos} /><Kpi label="Receita recorrente (MRR)" value={p.data.mrr} money /><Kpi label="Novos no mês" value={p.data.novosNoMes} /><Kpi label="Cancelados no mês" value={p.data.canceladosNoMes} /><Kpi label="Churn do mês" value={`${(p.data.churnMes * 100).toFixed(1)}%`} /><Kpi label="Inadimplentes" value={p.data.inadimplentes} /><Kpi label="Check-ins hoje" value={p.data.checkinsHoje} /></div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Card title="Sumidos há 14+ dias (retenção)"><Table rows={sumidos.data} empty="Todo mundo apareceu." cols={[{ h: 'Aluno', c: (r) => r.nome }, { h: 'Telefone', c: (r) => r.telefone ?? '—' }, { h: 'Plano', c: (r) => r.plano }, { h: 'Último check-in', c: (r) => r.ultimo_checkin ? d(r.ultimo_checkin) : 'nunca' }]} /></Card>
      <Card title="Horários de pico (30 dias)"><Table<any> rows={pico.data ? [...pico.data].sort((a, b) => b.checkins - a.checkins).slice(0, 10) : null} empty="Sem check-ins." cols={[{ h: 'Dia', c: (r) => DIAS[r.dow] }, { h: 'Hora', c: (r) => `${r.hora}h` }, { h: 'Check-ins', c: (r) => r.checkins, right: true }]} /></Card>
      <Card title="Frequência por dia (30 dias)"><Table<any> rows={freq.data} empty="Sem check-ins." cols={[{ h: 'Dia', c: (r) => d(r.dia) }, { h: 'Check-ins', c: (r) => r.checkins, right: true }, { h: 'Alunos', c: (r) => r.alunos, right: true }]} /></Card>
      <Card title="Vencem em 7 dias"><Table rows={aVencer.data} empty="Nada vencendo." cols={[{ h: 'Aluno', c: (r) => r.customer.name }, { h: 'Plano', c: (r) => r.plan.name }, { h: 'Vence', c: (r) => d(r.nextBillingAt) }]} /></Card>
    </div>
  </div>;
}
