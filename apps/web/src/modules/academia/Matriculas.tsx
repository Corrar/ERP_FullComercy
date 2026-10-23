import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Table, Tabs } from '@/components/ui';
import { brl, d } from '@/lib/format';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';

export function Matriculas() {
  const [tab, setTab] = useState('ACTIVE'); const [adesao, setAdesao] = useState(false);
  const mats = useGet<any[]>(tab === 'OVERDUE' ? '/m/academia/matriculas/inadimplentes' : '/m/academia/matriculas', tab === 'OVERDUE' ? undefined : { status: tab });
  const planos = useGet<any[]>('/m/academia/planos');
  const [aluno, setAluno] = useState<ClienteMin | null>(null); const [planoId, setPlanoId] = useState('');
  const plano = planos.data?.find((p) => p.id === planoId) ?? planos.data?.[0];
  const primeiro = plano ? Number(plano.price) + Number(plano.enrollmentFee ?? 0) : 0;
  const aderir = useAction(async (v: Record<string, any>) => {
    if (!aluno) throw new Error('Escolha ou cadastre o aluno.');
    if (!plano) throw new Error('Crie um plano antes (Planos).');
    const o = await post('/orders', { channel: 'SUBSCRIPTION', customerId: aluno.id, items: [], payments: v.amount ? [{ method: v.method, amount: v.amount }] : undefined, moduleData: { planId: plano.id } });
    setAdesao(false); setAluno(null); await mats.reload();
    setCobrado(o.status === 'COMPLETED' ? `${aluno.name} matriculado(a) no ${plano.name}.` : `Adesão registrada como pedido #${o.number}: a matrícula nasce quando o pedido for pago (Pedidos → Receber).`);
  });
  const [cobrado, setCobrado] = useState<string | null>(null);
  const cobrar = useAction(async () => { const r = await post<any>('/m/academia/matriculas/rodar-cobranca'); setCobrado(`Cobranças geradas: ${r?.cobrancasGeradas ?? r?.geradas ?? JSON.stringify(r)}.`); await mats.reload(); });
  const acao = useAction(async (id: string, a: string, body?: unknown) => { await post(`/m/academia/matriculas/${id}/${a}`, body ?? {}); await mats.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Matrículas</h1><div className="row"><button className="btn" onClick={() => void cobrar.run()} title="O job roda sozinho a cada 6 h; aqui é para não esperar.">Gerar cobranças vencidas agora</button><button className="btn primary" onClick={() => setAdesao(true)}>Nova adesão</button></div></div>
    <ErrorBox error={cobrar.error} />{cobrado && <div className="card" style={{ padding: 10 }}>{cobrado}</div>}
    <Tabs tabs={[{ k: 'ACTIVE', label: 'Ativas' }, { k: 'PAUSED', label: 'Pausadas' }, { k: 'OVERDUE', label: 'Inadimplentes' }, { k: 'CANCELLED', label: 'Canceladas' }]} active={tab} onChange={setTab} />
    <ErrorBox error={acao.error} />
    <Card><Table rows={mats.data} cols={[{ h: 'Aluno', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Plano', c: (r) => r.plan.name }, { h: 'Início', c: (r) => d(r.startDate) }, { h: 'Próx. cobrança', c: (r) => d(r.nextBillingAt) }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => <div className="row">{r.status === 'ACTIVE' && <button className="btn" onClick={() => { const ate = prompt('Pausar até (AAAA-MM-DD)'); if (ate) void acao.run(r.id, 'pausar', { until: ate }); }}>Pausar</button>}{r.status === 'PAUSED' && <button className="btn" onClick={() => void acao.run(r.id, 'retomar')}>Retomar</button>}{['ACTIVE', 'OVERDUE', 'PAUSED'].includes(r.status) && <button className="btn danger" onClick={() => { const m = prompt('Motivo do cancelamento'); if (m) void acao.run(r.id, 'cancelar', { reason: m }); }}>Cancelar</button>}</div> }]} /></Card>
    <Modal title="Nova adesão" open={adesao} onClose={() => setAdesao(false)}><ErrorBox error={aderir.error} /><Form onSubmit={(v) => void aderir.run(v)} busy={aderir.busy} submitLabel="Registrar adesão">
      <EscolherCliente value={aluno} onChange={setAluno} rotulo="Aluno" />
      {planos.data && !planos.data.length && <div className="banner warn" style={{ margin: 0 }}>Nenhum plano ainda: crie em Planos (mensal, trimestral…).</div>}
      <Field label="Plano"><select className="input" value={plano?.id ?? ''} onChange={(e) => setPlanoId(e.target.value)} required>{planos.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · {brl(p.price)}{Number(p.enrollmentFee) ? ` + adesão ${brl(p.enrollmentFee)}` : ''}</option>)}</select></Field>
      <div className="row"><Field label="Pagar agora (valor)"><input key={plano?.id} className="input" name="amount" type="number" step="0.01" defaultValue={primeiro ? primeiro.toFixed(2) : ''} /></Field><Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT'].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
      <div className="muted">Adesão + 1º período: {brl(primeiro)}. A matrícula nasce ao pagar; sem valor, fica um pedido em aberto.</div></Form></Modal>
  </div>;
}
