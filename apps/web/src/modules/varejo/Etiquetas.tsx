import { useState } from 'react';
import { post, apiBase } from '@/lib/api';
import { session } from '@/lib/session';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form } from '@/components/ui';

export function Etiquetas() {
  const modelos = useGet<any[]>('/m/varejo/etiquetas/modelos'); const [lote, setLote] = useState<any | null>(null);
  // O ID da variante não aparece em tela nenhuma: o campo de texto deixava a tela sem uso. Escolhe-se o item.
  const produtos = useGet<any[]>('/products'); const variantes = (produtos.data ?? []).flatMap((p) => p.variants.map((v: any) => ({ id: v.id, nome: [p.name, v.name].filter(Boolean).join(' · '), sku: v.sku })));
  const criar = useAction(async (v: Record<string, any>) => { setLote(await post('/m/varejo/etiquetas/lotes', { templateId: v.templateId || undefined, itens: [{ variantId: v.variantId, quantity: v.quantity }] })); });
  const baixar = async (fmt: 'pdf' | 'zpl') => {
    const r = await fetch(`${apiBase}/m/varejo/etiquetas/lotes/${lote.id}/${fmt}`, { headers: { authorization: `Bearer ${session.get()?.accessToken}` } });
    const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `etiquetas.${fmt === 'pdf' ? 'pdf' : 'zpl'}`; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="grid">
    <h1>Etiquetas</h1>
    <Card title="Novo lote"><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy} submitLabel="Gerar lote">
      <Field label="Modelo"><select className="input" name="templateId"><option value="">padrão</option>{modelos.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.widthMm}×{m.heightMm} mm)</option>)}</select></Field>
      <Field label="Produto"><select className="input" name="variantId" required><option value="">—</option>{variantes.map((v) => <option key={v.id} value={v.id}>{v.nome} ({v.sku})</option>)}</select></Field><Field label="Quantidade"><input className="input" name="quantity" type="number" min={1} defaultValue={1} /></Field></Form></Card>
    {lote && <Card title={`Lote ${lote.id.slice(0, 8)}`} actions={<><button className="btn primary" onClick={() => void baixar('pdf')}>PDF (A4)</button><button className="btn" onClick={() => void baixar('zpl')}>ZPL (térmica)</button></>}>
      {lote.items.map((i: any) => <div key={i.id}>{i.variant.product.name} {i.variant.name ?? ''} × {i.quantity}</div>)}</Card>}
  </div>;
}
