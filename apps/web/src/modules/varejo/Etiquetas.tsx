import { useState } from 'react';
import { baixarArquivo, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form } from '@/components/ui';

export function Etiquetas() {
  const modelos = useGet<any[]>('/m/varejo/etiquetas/modelos'); const [lote, setLote] = useState<any | null>(null);
  // O ID da variante não aparece em tela nenhuma: o campo de texto deixava a tela sem uso. Escolhe-se o item.
  const produtos = useGet<any[]>('/products'); const variantes = (produtos.data ?? []).flatMap((p) => p.variants.map((v: any) => ({ id: v.id, nome: [p.name, v.name].filter(Boolean).join(' · '), sku: v.sku })));
  const criar = useAction(async (v: Record<string, any>) => { setLote(await post('/m/varejo/etiquetas/lotes', { templateId: v.templateId || undefined, itens: [{ variantId: v.variantId, quantity: v.quantity }] })); });
  // Download pelo cliente da API (Bearer, refresh e erro legível), não por fetch solto.
  const baixar = useAction((fmt: 'pdf' | 'zpl') => baixarArquivo(`/m/varejo/etiquetas/lotes/${lote.id}/${fmt}`, undefined, `etiquetas.${fmt}`));
  const impresso = useAction(async () => { const r = await post(`/m/varejo/etiquetas/lotes/${lote.id}/impresso`); setLote({ ...lote, status: r.status, printedAt: r.printedAt }); });
  return <div className="grid">
    <h1>Etiquetas</h1>
    <Card title="Novo lote"><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy} submitLabel="Gerar lote">
      <Field label="Modelo"><select className="input" name="templateId"><option value="">padrão</option>{modelos.data?.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.widthMm}×{m.heightMm} mm)</option>)}</select></Field>
      <Field label="Produto"><select className="input" name="variantId" required><option value="">—</option>{variantes.map((v) => <option key={v.id} value={v.id}>{v.nome} ({v.sku})</option>)}</select></Field><Field label="Quantidade"><input className="input" name="quantity" type="number" min={1} defaultValue={1} /></Field></Form></Card>
    {lote && <Card title={`Lote ${lote.id.slice(0, 8)}`} actions={<><Badge s={lote.status} /><button className="btn primary" onClick={() => void baixar.run('pdf')}>PDF (A4)</button><button className="btn" onClick={() => void baixar.run('zpl')}>ZPL (térmica)</button>{lote.status !== 'PRINTED' && <button className="btn" onClick={() => void impresso.run()}>Marcar impresso</button>}</>}>
      <ErrorBox error={baixar.error ?? impresso.error} />
      {lote.items.map((i: any) => <div key={i.id}>{i.variant.product.name} {i.variant.name ?? ''} × {i.quantity}</div>)}</Card>}
  </div>;
}
