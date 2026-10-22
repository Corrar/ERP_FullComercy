import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { post, put } from '@/lib/api';
import { EscolherProduto, type VarianteMin } from '@/components/EscolherProduto';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { d, dt } from '@/lib/format';

export function PurchaseDetail() {
  const { id } = useParams(); const po = useGet<any>(`/purchases/${id}`); const [receber, setReceber] = useState(false); const [devolver, setDevolver] = useState(false); const [editarItens, setEditarItens] = useState(false);
  const enviar = useAction(async () => { await post(`/purchases/${id}/ordered`); await po.reload(); });
  const recebe = useAction(async (v: Record<string, any>) => {
    const items = po.data.items.map((i: any) => ({ itemId: i.id, quantity: Number(v[`q_${i.id}`] ?? 0) })).filter((x: any) => x.quantity > 0);
    await post(`/purchases/${id}/receive`, { items, invoiceNumber: v.invoiceNumber || undefined, dueDate: v.dueDate || undefined }); setReceber(false); await po.reload();
  });
  const devolve = useAction(async (v: Record<string, any>) => {
    const items = po.data.items.map((i: any) => ({ variantId: i.variantId, quantity: Number(v[`q_${i.variantId}`] ?? 0) })).filter((x: any) => x.quantity > 0);
    await post(`/purchases/${id}/returns`, { reason: v.reason, items }); setDevolver(false); await po.reload();
  });
  const cancelar = useAction(async () => { const r = prompt('Motivo'); if (r) { await post(`/purchases/${id}/cancel`, { reason: r }); await po.reload(); } });
  if (!po.data) return <div className="muted">Carregando…</div>;
  const c = po.data;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Compra #{c.number} <Badge s={c.status} /></h1><div className="row">
      {c.status === 'DRAFT' && <><button className="btn" onClick={() => setEditarItens(true)}>Editar itens</button><button className="btn primary" onClick={() => void enviar.run()}>Enviar ao fornecedor</button></>}
      {['ORDERED', 'PARTIAL'].includes(c.status) && <button className="btn primary" onClick={() => setReceber(true)}>Receber</button>}
      {['RECEIVED', 'PARTIAL'].includes(c.status) && <button className="btn" onClick={() => setDevolver(true)}>Devolver ao fornecedor</button>}
      {['DRAFT', 'ORDERED'].includes(c.status) && <button className="btn danger" onClick={() => void cancelar.run()}>Cancelar</button>}</div></div>
    <ErrorBox error={enviar.error ?? cancelar.error} />
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <Card title="Itens"><Table rows={c.items} cols={[{ h: 'Produto', c: (i: any) => <>{i.variant.product.name}<div className="muted">{i.variant.sku}</div></> }, { h: 'Pedido', c: (i: any) => i.quantity, right: true }, { h: 'Recebido', c: (i: any) => i.receivedQty, right: true }, { h: 'Custo unit.', c: (i: any) => Number(i.unitCost).toFixed(2), right: true }, { h: 'Total', c: (i: any) => <Money v={i.total} />, right: true }]} />
        <div className="row between" style={{ marginTop: 8 }}><span className="muted">Frete <Money v={c.freight} /></span><strong>Total <Money v={c.total} /></strong></div></Card>
      <Card title="Fornecedor"><div><strong>{c.supplier.name}</strong></div><div className="muted">{c.supplier.phone} {c.supplier.email}</div><div style={{ marginTop: 8 }}>Armazém {c.warehouse.code} · previsto {d(c.expectedAt)}</div>{c.invoiceNumber && <div>NF {c.invoiceNumber}</div>}{c.receivedAt && <div className="muted">Recebida em {dt(c.receivedAt)}</div>}{c.notes && <div className="muted" style={{ marginTop: 8 }}>{c.notes}</div>}</Card>
    </div>
    <Modal title="Receber mercadoria" open={receber} onClose={() => setReceber(false)}><ErrorBox error={recebe.error} /><Form onSubmit={(v) => void recebe.run(v)} busy={recebe.busy} submitLabel="Confirmar recebimento">
      {c.items.map((i: any) => <Field key={i.id} label={`${i.variant.product.name} (${i.variant.sku}) — faltam ${Number(i.quantity) - Number(i.receivedQty)}`}><input className="input" name={`q_${i.id}`} type="number" step="0.001" defaultValue={Number(i.quantity) - Number(i.receivedQty)} /></Field>)}
      <div className="row"><Field label="Nº da NF"><input className="input" name="invoiceNumber" /></Field><Field label="Vencimento do título"><input className="input" name="dueDate" type="date" /></Field></div></Form></Modal>
    <Modal title="Devolver ao fornecedor" open={devolver} onClose={() => setDevolver(false)}><ErrorBox error={devolve.error} /><Form onSubmit={(v) => void devolve.run(v)} busy={devolve.busy} submitLabel="Registrar devolução">
      {c.items.map((i: any) => <Field key={i.id} label={`${i.variant.product.name} — recebido ${i.receivedQty}`}><input className="input" name={`q_${i.variantId}`} type="number" step="0.001" defaultValue={0} /></Field>)}
      <Field label="Motivo"><input className="input" name="reason" required /></Field></Form></Modal>
    <Modal title="Itens do rascunho" open={editarItens} onClose={() => setEditarItens(false)} wide>{editarItens && <ItensRascunho compra={c} onDone={async () => { setEditarItens(false); await po.reload(); }} />}</Modal>
  </div>;
}

interface Linha { variantId: string; nome: string; sku: string; quantity: number; unitCost: number }
/** Enquanto é rascunho, a lista de itens é trocada inteira (PUT /purchases/:id/items). */
function ItensRascunho({ compra, onDone }: { compra: any; onDone: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>(compra.items.map((i: any) => ({ variantId: i.variantId, nome: i.variant.product.name, sku: i.variant.sku, quantity: Number(i.quantity), unitCost: Number(i.unitCost) })));
  const [novo, setNovo] = useState<VarianteMin | null>(null);
  const salvar = useAction(async () => { if (!linhas.length) throw new Error('A compra precisa de pelo menos um item.'); await put(`/purchases/${compra.id}/items`, { items: linhas.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: l.unitCost })) }); onDone(); });
  const muda = (i: number, k: 'quantity' | 'unitCost', v: number) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = linhas.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  return <div className="grid" style={{ gap: 12 }}>
    <table className="table"><thead><tr><th>Produto</th><th className="right">Qtd</th><th className="right">Custo unit.</th><th className="right">Total</th><th /></tr></thead><tbody>
      {linhas.map((l, i) => <tr key={`${l.variantId}-${i}`}><td>{l.nome}<div className="muted">{l.sku}</div></td>
        <td className="right"><input className="input" type="number" min={0.001} step="0.001" value={l.quantity} onChange={(e) => muda(i, 'quantity', Number(e.target.value))} style={{ width: 100 }} aria-label={`Quantidade ${l.sku}`} /></td>
        <td className="right"><input className="input" type="number" min={0} step="0.0001" value={l.unitCost} onChange={(e) => muda(i, 'unitCost', Number(e.target.value))} style={{ width: 110 }} aria-label={`Custo ${l.sku}`} /></td>
        <td className="right"><Money v={l.quantity * l.unitCost} /></td><td><button className="btn" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table>
    <div className="row" style={{ alignItems: 'flex-end' }}><div className="grow"><EscolherProduto value={novo} onChange={setNovo} rotulo="Adicionar produto" /></div>
      <button className="btn" disabled={!novo} onClick={() => { if (novo) { setLinhas((ls) => [...ls, { variantId: novo.id, nome: novo.nome, sku: novo.sku, quantity: 1, unitCost: 0 }]); setNovo(null); } }}>Adicionar</button></div>
    <div className="row between"><span className="muted">Frete não muda aqui.</span><strong>Itens <Money v={total} /></strong></div>
    <ErrorBox error={salvar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy} onClick={() => void salvar.run()}>Salvar itens</button></div>
  </div>;
}
