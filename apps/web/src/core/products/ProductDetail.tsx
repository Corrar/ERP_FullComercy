import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { patch, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Table, Toast } from '@/components/ui';
import { num } from '@/lib/format';

export function ProductDetail() {
  const { id } = useParams(); const p = useGet<any>(`/products/${id}`); const cats = useGet<any[]>('/products/categories'); const whs = useGet<any[]>('/stock/warehouses');
  const [novaVar, setNovaVar] = useState(false); const [minimo, setMinimo] = useState<any | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { await patch(`/products/${id}`, { ...v, categoryId: v.categoryId || null, trackStock: !!v.trackStock, isActive: !!v.isActive }); await p.reload(); setMsg('Produto salvo.'); });
  const criarVar = useAction(async (v: Record<string, any>) => { await post(`/products/${id}/variants`, v); setNovaVar(false); await p.reload(); });
  const toggleVar = useAction(async (v: any) => { await patch(`/products/${id}/variants/${v.id}`, { isActive: !v.isActive }); await p.reload(); });
  const salvarMin = useAction(async (v: Record<string, any>) => { await put(`/products/${id}/variants/${minimo.id}/min-level`, { warehouseId: v.warehouseId, minLevel: v.minLevel ?? null }); setMinimo(null); await p.reload(); });
  if (!p.data) return <div className="muted">Carregando…</div>;
  const pr = p.data;
  return <div className="grid">
    <h1>{pr.name}</h1>
    <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
      <Card title="Dados"><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
        <Field label="Nome"><input className="input" name="name" defaultValue={pr.name} required /></Field>
        <Field label="Categoria"><select className="input" name="categoryId" defaultValue={pr.categoryId ?? ''}><option value="">—</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="row"><Field label="Custo"><input className="input" name="costPrice" type="number" step="0.01" defaultValue={pr.costPrice} /></Field><Field label="Venda"><input className="input" name="salePrice" type="number" step="0.01" defaultValue={pr.salePrice} /></Field><Field label="Unidade"><input className="input" name="unit" defaultValue={pr.unit} /></Field></div>
        <Field label="Descrição"><textarea className="input" name="description" rows={3} defaultValue={pr.description ?? ''} /></Field>
        <label className="row"><input type="checkbox" name="trackStock" defaultChecked={pr.trackStock} /> Controla estoque</label>
        <label className="row"><input type="checkbox" name="isActive" defaultChecked={pr.isActive} /> Ativo</label></Form></Card>
      <Card title="Variantes e saldos" actions={<button className="btn" onClick={() => setNovaVar(true)}>Nova variante</button>}><ErrorBox error={toggleVar.error} />
        <Table rows={pr.variants} cols={[{ h: 'SKU', c: (v: any) => <>{v.sku}{v.isDefault && <span className="muted"> (padrão)</span>}</> }, { h: 'Nome', c: (v: any) => v.name ?? '—' }, { h: 'Código', c: (v: any) => v.barcode ?? '—' }, { h: 'Preço', c: (v: any) => v.priceOverride ?? '—', right: true },
          { h: 'Saldos', c: (v: any) => v.balances.map((b: any) => `${b.warehouse.code}: ${num(b.onHand)}${b.minLevel ? ` (mín ${num(b.minLevel)})` : ''}`).join(' · ') || '—' },
          { h: '', c: (v: any) => <div className="row"><button className="btn" onClick={() => setMinimo(v)}>Mínimo</button><button className="btn" onClick={() => void toggleVar.run(v)}>{v.isActive ? 'Desativar' : 'Ativar'}</button></div> }]} /></Card>
    </div>
    <Modal title="Nova variante" open={novaVar} onClose={() => setNovaVar(false)}><ErrorBox error={criarVar.error} /><Form onSubmit={(v) => void criarVar.run(v)} busy={criarVar.busy}>
      <Field label="SKU"><input className="input" name="sku" required /></Field><Field label="Nome (ex.: M / Azul)"><input className="input" name="name" /></Field><Field label="Código de barras"><input className="input" name="barcode" /></Field><Field label="Preço específico"><input className="input" name="priceOverride" type="number" step="0.01" /></Field></Form></Modal>
    <Modal title={`Estoque mínimo · ${minimo?.sku ?? ''}`} open={!!minimo} onClose={() => setMinimo(null)}><ErrorBox error={salvarMin.error} /><Form onSubmit={(v) => void salvarMin.run(v)} busy={salvarMin.busy}>
      <Field label="Armazém"><select className="input" name="warehouseId" required>{whs.data?.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field><Field label="Mínimo (vazio = sem alerta)"><input className="input" name="minLevel" type="number" step="0.001" /></Field></Form></Modal>
    <Toast msg={msg} />
  </div>;
}
