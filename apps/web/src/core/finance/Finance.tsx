import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Kpi, Modal, Money, Table, Tabs } from '@/components/ui';
import { d } from '@/lib/format';

export function Finance() {
  const [tab, setTab] = useState('RECEIVABLE'); const [novo, setNovo] = useState(false); const [baixa, setBaixa] = useState<any | null>(null);
  const resumo = useGet<any>('/finance/summary');
  const entries = useGet<any[]>('/finance/entries', { kind: tab });
  const criar = useAction(async (v: Record<string, any>) => { await post('/finance/entries', { ...v, kind: tab }); setNovo(false); await entries.reload(); await resumo.reload(); });
  const baixar = useAction(async (v: Record<string, any>) => { await post(`/finance/entries/${baixa.id}/settle`, v); setBaixa(null); await entries.reload(); await resumo.reload(); });
  return <div className="grid">
    <h1>Financeiro</h1>
    {resumo.data && <div className="grid kpis"><Kpi label="Recebido no mês" value={resumo.data.recebido} money /><Kpi label="Pago no mês" value={resumo.data.pago} money /><Kpi label="Saldo do mês" value={resumo.data.saldo} money /><Kpi label="Títulos vencidos" value={resumo.data.vencidos.length} /></div>}
    <Card><div className="row between"><Tabs tabs={[{ k: 'RECEIVABLE', label: 'A receber' }, { k: 'PAYABLE', label: 'A pagar' }]} active={tab} onChange={setTab} /><button className="btn primary" onClick={() => setNovo(true)}>Novo título</button></div>
      <Table rows={entries.data} cols={[{ h: 'Vencimento', c: (r) => d(r.dueDate) }, { h: 'Descrição', c: (r) => r.description }, { h: 'Cliente', c: (r) => r.customer?.name ?? '—' }, { h: 'Origem', c: (r) => r.origin }, { h: 'Valor', c: (r) => <Money v={r.amount} />, right: true }, { h: 'Pago', c: (r) => <Money v={r.paidAmount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
        { h: '', c: (r) => ['OPEN', 'PARTIAL'].includes(r.status) ? <button className="btn" onClick={() => setBaixa(r)}>Baixar</button> : null }]} /></Card>
    <Modal title="Novo título" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Descrição"><input className="input" name="description" required /></Field><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" required /></Field><Field label="Vencimento"><input className="input" name="dueDate" type="date" required /></Field></Form></Modal>
    <Modal title={`Baixar: ${baixa?.description ?? ''}`} open={!!baixa} onClose={() => setBaixa(null)}><ErrorBox error={baixar.error} /><Form onSubmit={(v) => void baixar.run(v)} busy={baixar.busy} submitLabel="Baixar">
      <Field label="Valor"><input className="input" name="amount" type="number" step="0.01" defaultValue={baixa ? (Number(baixa.amount) - Number(baixa.paidAmount)).toFixed(2) : ''} required /></Field>
      <Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'OTHER'].map((m) => <option key={m}>{m}</option>)}</select></Field></Form></Modal>
  </div>;
}
