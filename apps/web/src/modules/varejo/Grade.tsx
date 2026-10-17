import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Table } from '@/components/ui';

export function Grade() {
  const eixos = useGet<any[]>('/m/varejo/grade/eixos'); const produtos = useGet<any[]>('/products');
  const [produto, setProduto] = useState(''); const matriz = useGet<any[]>(produto ? `/m/varejo/grade/${produto}/estoque` : null);
  const gerar = useAction(async (v: Record<string, any>) => {
    const eixosSel: Record<string, string[]> = {};
    for (const e of eixos.data ?? []) { const vals = String(v[`eixo_${e.id}`] ?? '').split(',').map((s) => s.trim()).filter(Boolean); if (vals.length) eixosSel[e.name] = vals; }
    await post('/m/varejo/grade/gerar', { productId: v.productId, skuBase: v.skuBase, eixos: eixosSel }); setProduto(v.productId); await matriz.reload();
  });
  return <div className="grid">
    <h1>Grade (tamanho × cor)</h1>
    <Card title="Gerar variantes"><ErrorBox error={gerar.error} /><Form onSubmit={(v) => void gerar.run(v)} busy={gerar.busy} submitLabel="Gerar">
      <Field label="Produto com grade"><select className="input" name="productId" required><option value="">—</option>{produtos.data?.filter((p) => p.hasVariants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="SKU base"><input className="input" name="skuBase" placeholder="CAM-BASICA" required /></Field>
      {eixos.data?.map((e) => <Field key={e.id} label={`${e.name} (separe por vírgula)`}><input className="input" name={`eixo_${e.id}`} placeholder={e.values.map((v: any) => v.value).join(', ') || 'P, M, G'} /></Field>)}</Form></Card>
    <Card title="Matriz de estoque"><div className="row" style={{ marginBottom: 8 }}><select className="input" value={produto} onChange={(e) => setProduto(e.target.value)} style={{ width: 320 }}><option value="">escolha o produto</option>{produtos.data?.filter((p) => p.hasVariants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <Table rows={matriz.data} empty="Sem variantes." cols={[{ h: 'SKU', c: (r) => r.sku }, { h: 'Célula', c: (r) => r.celula.map((c: any) => `${c.eixo}: ${c.valor}`).join(' · ') }, { h: 'Saldo', c: (r) => String(r.onHand), right: true }]} /></Card>
  </div>;
}
