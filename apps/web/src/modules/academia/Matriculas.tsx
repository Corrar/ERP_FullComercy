import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table, Tabs } from '@/components/ui';
import { d } from '@/lib/format';

export function Matriculas() {
  const [tab, setTab] = useState('ACTIVE'); const [adesao, setAdesao] = useState(false);
  const mats = useGet<any[]>(tab === 'OVERDUE' ? '/m/academia/matriculas/inadimplentes' : '/m/academia/matriculas', tab === 'OVERDUE' ? undefined : { status: tab });
  const planos = useGet<any[]>('/m/academia/planos'); const clientes = useGet<any[]>('/customers');
  const aderir = useAction(async (v: Record<string, any>) => {
    const o = await post('/orders', { channel: 'SUBSCRIPTION', customerId: v.customerId, items: [], payments: v.amount ? [{ method: v.method, amount: v.amount }] : undefined, moduleData: { planId: v.planId } });
    setAdesao(false); await mats.reload(); if (o.status !== 'COMPLETED') alert(`Adesão criada como pedido #${o.number}. A matrícula nasce quando o pedido for pago.`);
  });
  const acao = useAction(async (id: string, a: string, body?: unknown) => { await post(`/m/academia/matriculas/${id}/${a}`, body ?? {}); await mats.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Matrículas</h1><button className="btn primary" onClick={() => setAdesao(true)}>Nova adesão</button></div>
    <Tabs tabs={[{ k: 'ACTIVE', label: 'Ativas' }, { k: 'PAUSED', label: 'Pausadas' }, { k: 'OVERDUE', label: 'Inadimplentes' }, { k: 'CANCELLED', label: 'Canceladas' }]} active={tab} onChange={setTab} />
    <ErrorBox error={acao.error} />
    <Card><Table rows={mats.data} cols={[{ h: 'Aluno', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Plano', c: (r) => r.plan.name }, { h: 'Início', c: (r) => d(r.startDate) }, { h: 'Próx. cobrança', c: (r) => d(r.nextBillingAt) }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => <div className="row">{r.status === 'ACTIVE' && <button className="btn" onClick={() => { const ate = prompt('Pausar até (AAAA-MM-DD)'); if (ate) void acao.run(r.id, 'pausar', { until: ate }); }}>Pausar</button>}{r.status === 'PAUSED' && <button className="btn" onClick={() => void acao.run(r.id, 'retomar')}>Retomar</button>}{['ACTIVE', 'OVERDUE', 'PAUSED'].includes(r.status) && <button className="btn danger" onClick={() => { const m = prompt('Motivo do cancelamento'); if (m) void acao.run(r.id, 'cancelar', { reason: m }); }}>Cancelar</button>}</div> }]} /></Card>
    <Modal title="Nova adesão" open={adesao} onClose={() => setAdesao(false)}><ErrorBox error={aderir.error} /><Form onSubmit={(v) => void aderir.run(v)} busy={aderir.busy} submitLabel="Registrar adesão">
      <Field label="Aluno (cliente)"><select className="input" name="customerId" required>{clientes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Plano"><select className="input" name="planId" required>{planos.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.price}</option>)}</select></Field>
      <div className="row"><Field label="Pagar agora (valor)"><input className="input" name="amount" type="number" step="0.01" /></Field><Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT'].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
      <div className="muted">Adesão + 1º período. A matrícula nasce ao pagar. Sem valor, fica um pedido em aberto. <Money v={0} /></div></Form></Modal>
  </div>;
}
