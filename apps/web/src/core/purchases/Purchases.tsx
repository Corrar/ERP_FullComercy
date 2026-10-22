import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, ErrorBox, Field, Form, Modal, Money, Paginador, Switch, Table, Tabs } from '@/components/ui';
import { d } from '@/lib/format';

export function Purchases() {
  const [tab, setTab] = useState('pedidos'); const [novoForn, setNovoForn] = useState(false); const [novaCompra, setNovaCompra] = useState(false); const nav = useNavigate();
  const produtos = useGet<any[]>(novaCompra ? '/products' : null);
  const criarCompra = useAction(async (v: Record<string, any>) => { const po = await post('/purchases', { supplierId: v.supplierId, freight: v.freight, expectedAt: v.expectedAt || undefined, items: [{ variantId: v.variantId, quantity: v.quantity, unitCost: v.unitCost }] }); setNovaCompra(false); nav(`/compras/${po.id}`); });
  const [page, setPage] = useState(1);
  const pedidos = useGet<{ rows: any[]; page: number; pageSize: number; total: number }>(tab === 'pedidos' ? '/purchases' : null, { page, pageSize: 50 });
  const forn = useGet<any[]>('/suppliers', { todos: 1 });
  const sug = useGet<any[]>(tab === 'sugestao' ? '/purchases/sugestao' : null);
  const criarForn = useAction(async (v: Record<string, any>) => { await post('/suppliers', v); setNovoForn(false); await forn.reload(); });
  const [edForn, setEdForn] = useState<any | null>(null);
  const salvarForn = useAction(async (v: Record<string, any>) => { await patch(`/suppliers/${edForn.id}`, { name: v.name, phone: v.phone, email: v.email || undefined, notes: v.notes }); setEdForn(null); await forn.reload(); });
  const ativoForn = useAction(async (f: any) => { await patch(`/suppliers/${f.id}`, { isActive: !f.isActive }); await forn.reload(); });
  const receber = useAction(async (id: string) => { await post(`/purchases/${id}/receive`, {}); await pedidos.reload(); });
  const enviar = useAction(async (id: string) => { await post(`/purchases/${id}/ordered`); await pedidos.reload(); });
  return <div>
    <div className="row between"><h1>Compras</h1><button className="btn primary" onClick={() => setNovaCompra(true)}>Nova compra</button></div>
    <Tabs tabs={[{ k: 'pedidos', label: 'Pedidos de compra' }, { k: 'fornecedores', label: 'Fornecedores' }, { k: 'sugestao', label: 'Sugestão de reposição' }]} active={tab} onChange={setTab} />
    <ErrorBox error={receber.error ?? enviar.error} />
    {tab === 'pedidos' && <Table rows={pedidos.data?.rows} onRow={(r) => nav(`/compras/${r.id}`)} cols={[{ h: '#', c: (r) => r.number }, { h: 'Fornecedor', c: (r) => r.supplier.name }, { h: 'Itens', c: (r) => r._count.items, right: true }, { h: 'Total', c: (r) => <Money v={r.total} />, right: true }, { h: 'Previsto', c: (r) => d(r.expectedAt) }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => r.status === 'DRAFT' ? <button className="btn" onClick={(e) => { e.stopPropagation(); void enviar.run(r.id); }}>Enviar</button> : ['ORDERED', 'PARTIAL'].includes(r.status) ? <button className="btn primary" onClick={(e) => { e.stopPropagation(); void receber.run(r.id); }}>Receber tudo</button> : null }]} />}
    {tab === 'pedidos' && pedidos.data && <Paginador page={pedidos.data.page} pageSize={pedidos.data.pageSize} total={pedidos.data.total} onPage={setPage} />}
    {tab === 'fornecedores' && <div><div className="row" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setNovoForn(true)}>Novo fornecedor</button></div>
      <ErrorBox error={ativoForn.error} /><Table rows={forn.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Documento', c: (r) => r.document ?? '—' }, { h: 'Telefone', c: (r) => r.phone ?? '—' }, { h: 'E-mail', c: (r) => r.email ?? '—' }, { h: 'Ativo', c: (r) => <Switch on={r.isActive} label={`${r.name} ativo`} onChange={() => void ativoForn.run(r)} /> }, { h: '', c: (r) => <button className="btn" onClick={() => setEdForn(r)}>Editar</button> }]} /></div>}
    {tab === 'sugestao' && <Table rows={sug.data} empty="Nada abaixo do mínimo." cols={[{ h: 'Produto', c: (r) => r.produto }, { h: 'SKU', c: (r) => r.sku }, { h: 'Saldo', c: (r) => r.on_hand, right: true }, { h: 'Mínimo', c: (r) => r.min_level, right: true }, { h: 'Sugerido', c: (r) => r.sugerido, right: true }, { h: 'Último fornecedor', c: (r) => r.ultimo_fornecedor ?? '—' }, { h: 'Último custo', c: (r) => r.ultimo_custo ? Number(r.ultimo_custo).toFixed(2) : '—', right: true }]} />}
    <Modal title="Nova compra" open={novaCompra} onClose={() => setNovaCompra(false)}><ErrorBox error={criarCompra.error} /><Form onSubmit={(v) => void criarCompra.run(v)} busy={criarCompra.busy} submitLabel="Criar rascunho">
      <Field label="Fornecedor"><select className="input" name="supplierId" required>{forn.data?.filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <Field label="Produto (variante)"><select className="input" name="variantId" required>{produtos.data?.flatMap((p) => p.variants.map((v: any) => <option key={v.id} value={v.id}>{p.name}{v.name ? ` · ${v.name}` : ''} ({v.sku})</option>))}</select></Field>
      <div className="row"><Field label="Quantidade"><input className="input" name="quantity" type="number" step="0.001" required /></Field><Field label="Custo unitário"><input className="input" name="unitCost" type="number" step="0.0001" required /></Field><Field label="Frete"><input className="input" name="freight" type="number" step="0.01" defaultValue={0} /></Field></div>
      <Field label="Previsão de entrega"><input className="input" name="expectedAt" type="date" /></Field><div className="muted">Mais itens podem ser ajustados no detalhe enquanto for rascunho (PUT /purchases/:id/items).</div></Form></Modal>
    <Modal title="Novo fornecedor" open={novoForn} onClose={() => setNovoForn(false)}><ErrorBox error={criarForn.error} /><Form onSubmit={(v) => void criarForn.run(v)} busy={criarForn.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="CNPJ"><input className="input" name="document" /></Field><Field label="Telefone"><input className="input" name="phone" /></Field><Field label="E-mail"><input className="input" name="email" type="email" /></Field></Form></Modal>
    <Modal title={`Editar · ${edForn?.name ?? ''}`} open={!!edForn} onClose={() => setEdForn(null)}>{edForn && <><ErrorBox error={salvarForn.error} /><Form onSubmit={(v) => void salvarForn.run(v)} busy={salvarForn.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} defaultValue={edForn.name} /></Field><Field label="Telefone"><input className="input" name="phone" defaultValue={edForn.phone ?? ''} /></Field>
      <Field label="E-mail"><input className="input" name="email" type="email" defaultValue={edForn.email ?? ''} /></Field><Field label="Observações"><input className="input" name="notes" defaultValue={edForn.notes ?? ''} /></Field></Form></>}</Modal>
  </div>;
}
