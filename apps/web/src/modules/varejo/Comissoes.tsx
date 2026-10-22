import { useState } from 'react';
import { del, patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Switch, Table } from '@/components/ui';
import { d, dt } from '@/lib/format';
import { useSession } from '@/lib/session';

export function Comissoes() {
  const vend = useGet<any[]>('/m/varejo/vendedores'); const com = useGet<any[]>('/m/varejo/comissoes'); const [novo, setNovo] = useState(false);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/varejo/vendedores', v); setNovo(false); await vend.reload(); });
  const [editando, setEditando] = useState<any | null>(null);
  const salvar = useAction(async (id: string, v: Record<string, any>) => { await patch(`/m/varejo/vendedores/${id}`, v); setEditando(null); await vend.reload(); });
  const aprovar = useAction(async () => { const ids = (com.data ?? []).filter((c) => c.status === 'PENDING').map((c) => c.id); if (ids.length) await post('/m/varejo/comissoes/aprovar', { ids }); await com.reload(); });
  const pagar = useAction(async (salespersonId: string) => { await post('/m/varejo/comissoes/pagar', { salespersonId, until: new Date().toISOString() }); await com.reload(); });
  const { can } = useSession(); const gerir = can('varejo.comissoes:manage');
  const regras = useGet<any[]>('/m/varejo/comissoes/regras'); const categorias = useGet<any[]>('/products/categories'); const [novaRegra, setNovaRegra] = useState(false);
  const criarRegra = useAction(async (v: Record<string, any>) => {
    // Data do <input type=date> é meia-noite LOCAL do dia escolhido; o fim vale até o último segundo dele.
    await post('/m/varejo/comissoes/regras', { salespersonId: v.salespersonId || undefined, categoryId: v.categoryId || undefined, rate: v.rate, validFrom: new Date(`${v.validFrom}T00:00:00`).toISOString(), validTo: v.validTo ? new Date(`${v.validTo}T23:59:59`).toISOString() : undefined });
    setNovaRegra(false); await regras.reload();
  });
  const excluirRegra = useAction(async (id: string) => { await del(`/m/varejo/comissoes/regras/${id}`); await regras.reload(); });
  const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return <div className="grid">
    <h1>Comissões</h1><ErrorBox error={aprovar.error ?? pagar.error ?? excluirRegra.error} />
    <Card title="Vendedores" actions={<button className="btn primary" onClick={() => setNovo(true)}>Novo vendedor</button>}><ErrorBox error={salvar.error} /><Table rows={vend.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Taxa padrão', c: (r) => `${r.defaultCommissionRate}%`, right: true },
      { h: 'Ativo', c: (r) => <Switch on={r.isActive} disabled={!gerir} label={`Ativo: ${r.name}`} onChange={(v) => void salvar.run(r.id, { isActive: v })} /> },
      { h: '', c: (r) => <div className="row">{gerir && <button className="btn" onClick={() => setEditando(r)}>Editar</button>}<button className="btn" onClick={() => void pagar.run(r.id)}>Pagar aprovadas</button></div> }]} /></Card>
    <Card title="Regras de comissão" actions={gerir && <button className="btn" onClick={() => setNovaRegra(true)}>Nova regra</button>}>
      <div className="muted" style={{ marginBottom: 8 }}>Por item vendido vale a regra mais específica em vigor: vendedor + categoria, depois só o vendedor, depois só a categoria (para todos) e, sem regra, a taxa padrão do vendedor.</div>
      <Table rows={regras.data} empty="Sem regras: vale a taxa padrão de cada vendedor." cols={[
        { h: 'Vendedor', c: (r) => r.salesperson?.name ?? 'Todos' }, { h: 'Categoria', c: (r) => r.category?.name ?? 'Todas' }, { h: 'Taxa', c: (r) => `${r.rate}%`, right: true },
        { h: 'Vigência', c: (r) => `${d(r.validFrom)} → ${r.validTo ? d(r.validTo) : 'sem fim'}` },
        { h: '', c: (r) => gerir && <button className="btn" aria-label={`Excluir regra de ${r.salesperson?.name ?? 'todos'} em ${r.category?.name ?? 'todas'}`} onClick={() => void excluirRegra.run(r.id)}>Excluir</button> },
      ]} /></Card>
    <Card title="Comissões" actions={<button className="btn" onClick={() => void aprovar.run()}>Aprovar pendentes</button>}><Table rows={com.data} cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Vendedor', c: (r) => r.salesperson.name }, { h: 'Venda', c: (r) => `#${r.sale.order.number}` }, { h: 'Base', c: (r) => <Money v={r.baseAmount} />, right: true }, { h: 'Taxa', c: (r) => `${r.rate}%`, right: true }, { h: 'Comissão', c: (r) => <Money v={r.amount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }]} /></Card>
    <Modal title="Novo vendedor" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}><Field label="Nome"><input className="input" name="name" required /></Field><Field label="Taxa padrão (%)"><input className="input" name="defaultCommissionRate" type="number" step="0.1" defaultValue={0} /></Field></Form></Modal>
    <Modal title="Editar vendedor" open={!!editando} onClose={() => setEditando(null)}>{editando && <Form onSubmit={(v) => void salvar.run(editando.id, v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} defaultValue={editando.name} /></Field>
      <Field label="Taxa padrão (%)"><input className="input" name="defaultCommissionRate" type="number" step="0.1" min={0} max={100} defaultValue={editando.defaultCommissionRate} /></Field></Form>}</Modal>
    <Modal title="Nova regra de comissão" open={novaRegra} onClose={() => setNovaRegra(false)}><ErrorBox error={criarRegra.error} /><Form onSubmit={(v) => void criarRegra.run(v)} busy={criarRegra.busy}>
      <Field label="Vendedor"><select className="input" name="salespersonId" defaultValue=""><option value="">Todos os vendedores</option>{vend.data?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label="Categoria"><select className="input" name="categoryId" defaultValue=""><option value="">Todas as categorias</option>{categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Taxa (%)"><input className="input" name="rate" type="number" step="0.1" min={0} max={100} required /></Field>
      <div className="row"><Field label="Vale a partir de"><input className="input" name="validFrom" type="date" defaultValue={hoje} required /></Field><Field label="Até (opcional)"><input className="input" name="validTo" type="date" /></Field></div>
    </Form></Modal>
  </div>;
}
