import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Switch } from '@/components/ui';

const CICLO: Record<string, string> = { MONTHLY: 'mês', WEEKLY: 'semana', QUARTERLY: 'trimestre', SEMIANNUAL: 'semestre', ANNUAL: 'ano' };

export function Planos() {
  const { can } = useSession(); const gerir = can('gym.planos:manage');
  const planos = useGet<any[]>('/m/academia/planos'); const [novo, setNovo] = useState(false); const [ed, setEd] = useState<any | null>(null);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/academia/planos', { ...v, accessRules: { maxCheckInsPerDay: v.maxCheckInsPerDay ?? 1 } }); setNovo(false); await planos.reload(); });
  const salvar = useAction(async (v: Record<string, any>) => { await patch(`/m/academia/planos/${ed.id}`, { name: v.name, description: v.description, price: v.price, enrollmentFee: v.enrollmentFee, accessRules: { ...(ed.accessRules ?? {}), maxCheckInsPerDay: v.maxCheckInsPerDay ?? 1 } }); setEd(null); await planos.reload(); });
  const ativo = useAction(async (p: any) => { await patch(`/m/academia/planos/${p.id}`, { isActive: !p.isActive }); await planos.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Planos</h1>{gerir && <button className="btn primary" onClick={() => setNovo(true)}>Novo plano</button>}</div>
    <ErrorBox error={ativo.error} />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>{planos.data?.map((p) => <Card key={p.id} title={p.name} actions={gerir && <Switch on={p.isActive} label={`Plano ${p.name} ativo`} onChange={() => void ativo.run(p)} />}>
      <div style={{ fontSize: 22, fontWeight: 700 }}><Money v={p.price} /><span className="muted" style={{ fontSize: 12 }}> / {CICLO[p.billingCycle] ?? p.billingCycle}</span></div><div className="muted">{p.description}</div>
      <div className="muted" style={{ marginTop: 6 }}>Adesão <Money v={p.enrollmentFee} /> · {p._count.memberships} ativos{!p.isActive && ' · inativo (não vende)'}</div>
      {gerir && <button className="btn" style={{ marginTop: 8 }} onClick={() => setEd(p)}>Editar</button>}</Card>)}</div>
    <Modal title="Novo plano" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="Descrição"><input className="input" name="description" /></Field>
      <div className="row"><Field label="Preço"><input className="input" name="price" type="number" step="0.01" required /></Field><Field label="Ciclo"><select className="input" name="billingCycle">{Object.entries(CICLO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
      <div className="row"><Field label="Taxa de adesão"><input className="input" name="enrollmentFee" type="number" step="0.01" defaultValue={0} /></Field><Field label="Fidelidade (ciclos)"><input className="input" name="contractCycles" type="number" /></Field><Field label="Check-ins/dia"><input className="input" name="maxCheckInsPerDay" type="number" defaultValue={1} /></Field></div></Form></Modal>
    <Modal title={`Editar · ${ed?.name ?? ''}`} open={!!ed} onClose={() => setEd(null)}>{ed && <><div className="muted" style={{ marginBottom: 8 }}>O preço novo vale para as próximas cobranças; ciclo e fidelidade não mudam em plano com alunos.</div><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" required defaultValue={ed.name} /></Field><Field label="Descrição"><input className="input" name="description" defaultValue={ed.description ?? ''} /></Field>
      <div className="row"><Field label="Preço"><input className="input" name="price" type="number" step="0.01" required defaultValue={ed.price} /></Field><Field label="Taxa de adesão"><input className="input" name="enrollmentFee" type="number" step="0.01" defaultValue={ed.enrollmentFee} /></Field><Field label="Check-ins/dia"><input className="input" name="maxCheckInsPerDay" type="number" defaultValue={ed.accessRules?.maxCheckInsPerDay ?? 1} /></Field></div></Form></>}</Modal>
  </div>;
}
