// Convênios (tabela de valor) e o que cada um ainda não repassou: o repasse entra como pagamento
// do pedido da consulta, e o pedido conclui quando quitado.
import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Money, Switch, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Convenios() {
  const convs = useGet<any[]>('/m/clinica/convenios'); const [ed, setEd] = useState<any | null>(null); const [filtro, setFiltro] = useState('');
  const aReceber = useGet<any[]>('/m/clinica/convenios-a-receber', { insuranceId: filtro || undefined });
  const salvar = useAction(async (v: Record<string, any>) => { const b = { name: v.name, code: v.code, price: v.price ?? 0 }; if (ed?.id) await patch(`/m/clinica/convenios/${ed.id}`, b); else await post('/m/clinica/convenios', b); setEd(null); await convs.reload(); });
  const ativo = useAction(async (r: any) => { await patch(`/m/clinica/convenios/${r.id}`, { isActive: !r.isActive }); await convs.reload(); });
  const repasse = useAction(async (c: any) => {
    const falta = Number(c.order.total) - c.order.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
    await post(`/orders/${c.order.id}/payments`, { payments: [{ method: 'TRANSFER', amount: Math.round(falta * 100) / 100, reference: 'repasse do convênio' }] }); await aReceber.reload();
  });
  const nome = (id: string) => convs.data?.find((c) => c.id === id)?.name ?? '';
  return <div className="grid"><div className="row between"><h1 style={{ margin: 0 }}>Convênios</h1><button className="btn primary" onClick={() => setEd({})}>Novo convênio</button></div>
    <ErrorBox error={ativo.error ?? repasse.error} />
    <Card><Table rows={convs.data} empty="Nenhum convênio." cols={[{ h: 'Convênio', c: (r) => r.name }, { h: 'Registro ANS', c: (r) => r.code ?? '—' }, { h: 'Valor da consulta', c: (r) => <Money v={r.price} />, right: true }, { h: 'Ativo', c: (r) => <Switch on={r.isActive} label={`${r.name} ativo`} onChange={() => void ativo.run(r)} /> }, { h: '', c: (r) => <button className="btn" onClick={() => setEd(r)}>Editar</button> }]} /></Card>
    <Card title="A receber dos convênios" actions={<select className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos</option>{convs.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}>
      <Table rows={aReceber.data} empty="Nada em aberto." cols={[{ h: 'Consulta', c: (c) => `#${c.order.number}` }, { h: 'Quando', c: (c) => dt(c.order.createdAt) }, { h: 'Paciente', c: (c) => c.order.customer?.name }, { h: 'Convênio', c: (c) => nome(c.insuranceId) }, { h: 'Valor', c: (c) => <Money v={c.order.total} />, right: true }, { h: '', c: (c) => <button className="btn" onClick={() => void repasse.run(c)}>Repasse recebido</button> }]} /></Card>
    <Modal title={ed?.id ? `Editar · ${ed.name}` : 'Novo convênio'} open={!!ed} onClose={() => setEd(null)}>{ed && <><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} defaultValue={ed.name ?? ''} /></Field>
      <div className="row"><Field label="Registro ANS"><input className="input" name="code" defaultValue={ed.code ?? ''} /></Field><Field label="Valor da consulta (R$)"><input className="input" name="price" type="number" step="0.01" min={0} required defaultValue={ed.price ?? ''} /></Field></div>
    </Form></>}</Modal></div>;
}
