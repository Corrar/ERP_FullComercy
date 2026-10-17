import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { del, patch, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Kpi, Modal, Toast } from '@/components/ui';
import { dt } from '@/lib/format';

export function CustomerDetail() {
  const { id } = useParams(); const c = useGet<any>(`/customers/${id}/summary`); const [endereco, setEndereco] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { await put(`/customers/${id}`, v); await c.reload(); setMsg('Cliente salvo.'); });
  const addEnd = useAction(async (v: Record<string, any>) => { await post(`/customers/${id}/addresses`, { ...v, isDefault: true }); setEndereco(false); await c.reload(); });
  const removerEnd = useAction(async (aid: string) => { await del(`/customers/${id}/addresses/${aid}`); await c.reload(); });
  const ativo = useAction(async () => { await patch(`/customers/${id}/active`, { isActive: !c.data.cliente.isActive }); await c.reload(); });
  if (!c.data) return <div className="muted">Carregando…</div>;
  const cl = c.data.cliente;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>{cl.name} {!cl.isActive && <span className="badge danger">inativo</span>}</h1><button className="btn" onClick={() => void ativo.run()}>{cl.isActive ? 'Desativar' : 'Reativar'}</button></div>
    <div className="grid kpis"><Kpi label="Compras" value={c.data.compras} /><Kpi label="Total gasto" value={c.data.totalGasto} money /><Kpi label="Ticket médio" value={c.data.ticketMedio} money /><Kpi label="Em aberto" value={c.data.emAberto.valor} money /></div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <Card title="Dados"><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
        <Field label="Nome"><input className="input" name="name" defaultValue={cl.name} required /></Field><Field label="Telefone"><input className="input" name="phone" defaultValue={cl.phone ?? ''} /></Field>
        <Field label="CPF/CNPJ"><input className="input" name="document" defaultValue={cl.document ?? ''} /></Field><Field label="E-mail"><input className="input" name="email" type="email" defaultValue={cl.email ?? ''} /></Field>
        <Field label="Observações"><textarea className="input" name="notes" rows={3} defaultValue={cl.notes ?? ''} /></Field></Form></Card>
      <div className="grid">
        <Card title="Endereços" actions={<button className="btn" onClick={() => setEndereco(true)}>Adicionar</button>}><ErrorBox error={removerEnd.error} />
          {cl.addresses.length ? cl.addresses.map((a: any) => <div key={a.id} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}><span>{a.label && <strong>{a.label} · </strong>}{a.street}, {a.number} {a.complement} · {a.district} · {a.city}/{a.state}{a.isDefault && <span className="badge info" style={{ marginLeft: 6 }}>padrão</span>}</span><button className="btn" onClick={() => void removerEnd.run(a.id)}>✕</button></div>) : <div className="muted">Nenhum endereço.</div>}</Card>
        <Card title="Última compra">{c.data.ultimaCompra ? <div>#{c.data.ultimaCompra.number} · {dt(c.data.ultimaCompra.completedAt)}</div> : <div className="muted">Nunca comprou.</div>}</Card>
      </div>
    </div>
    <Modal title="Novo endereço" open={endereco} onClose={() => setEndereco(false)}><ErrorBox error={addEnd.error} /><Form onSubmit={(v) => void addEnd.run(v)} busy={addEnd.busy}>
      <Field label="Rótulo"><input className="input" name="label" placeholder="Casa" /></Field><div className="row"><Field label="Rua"><input className="input" name="street" required /></Field><Field label="Nº"><input className="input" name="number" /></Field></div>
      <div className="row"><Field label="Bairro"><input className="input" name="district" /></Field><Field label="Cidade"><input className="input" name="city" required /></Field><Field label="UF"><input className="input" name="state" maxLength={2} required /></Field><Field label="CEP"><input className="input" name="zipCode" /></Field></div></Form></Modal>
    <Toast msg={msg} />
  </div>;
}
