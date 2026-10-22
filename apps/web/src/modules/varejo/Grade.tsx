import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Table } from '@/components/ui';

export function Grade() {
  const eixos = useGet<any[]>('/m/varejo/grade/eixos'); const produtos = useGet<any[]>('/products');
  const [produto, setProduto] = useState(''); const matriz = useGet<any[]>(produto ? `/m/varejo/grade/${produto}/estoque` : null);
  const gerar = useAction(async (v: Record<string, any>) => {
    const eixosSel: Record<string, string[]> = {};
    for (const e of eixos.data ?? []) { const vals = String(v[`eixo_${e.id}`] ?? '').split(',').map((s) => s.trim()).filter(Boolean); if (vals.length) eixosSel[e.name] = vals; }
    await post('/m/varejo/grade/gerar', { productId: v.productId, skuBase: v.skuBase, eixos: eixosSel }); setProduto(v.productId); await matriz.reload();
  });
  // Eixos (Tamanho, Cor…) e seus valores: o cadastro que a geração de variantes usa como sugestão.
  const [novoEixo, setNovoEixo] = useState(false); const [valorDe, setValorDe] = useState<any | null>(null);
  const criarEixo = useAction(async (v: Record<string, any>) => { await post('/m/varejo/grade/eixos', { name: v.name }); setNovoEixo(false); await eixos.reload(); });
  const criarValor = useAction(async (axisId: string, v: Record<string, any>) => { await post(`/m/varejo/grade/eixos/${axisId}/valores`, { value: v.value, hexColor: v.hexColor || undefined }); setValorDe(null); await eixos.reload(); });
  return <div className="grid">
    <h1>Grade (tamanho × cor)</h1>
    <Card title="Eixos da grade" actions={<button className="btn" onClick={() => setNovoEixo(true)}>Novo eixo</button>}>
      <Table rows={eixos.data} empty="Sem eixos: crie Tamanho, Cor…" cols={[{ h: 'Eixo', c: (r) => r.name },
        { h: 'Valores', c: (r) => r.values.length ? r.values.map((v: any) => <span key={v.id} className="badge" style={{ marginRight: 4 }}>{v.hexColor && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: v.hexColor, marginRight: 4 }} />}{v.value}</span>) : <span className="muted">nenhum</span> },
        { h: '', c: (r) => <button className="btn" onClick={() => setValorDe(r)}>Adicionar valor</button> }]} /></Card>
    <Card title="Gerar variantes"><ErrorBox error={gerar.error} /><Form onSubmit={(v) => void gerar.run(v)} busy={gerar.busy} submitLabel="Gerar">
      <Field label="Produto com grade"><select className="input" name="productId" required><option value="">—</option>{produtos.data?.filter((p) => p.hasVariants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="SKU base"><input className="input" name="skuBase" placeholder="CAM-BASICA" required /></Field>
      {eixos.data?.map((e) => <Field key={e.id} label={`${e.name} (separe por vírgula)`}><input className="input" name={`eixo_${e.id}`} placeholder={e.values.map((v: any) => v.value).join(', ') || 'P, M, G'} /></Field>)}</Form></Card>
    <Card title="Matriz de estoque"><div className="row" style={{ marginBottom: 8 }}><select className="input" value={produto} onChange={(e) => setProduto(e.target.value)} style={{ width: 320 }}><option value="">escolha o produto</option>{produtos.data?.filter((p) => p.hasVariants).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <Table rows={matriz.data} empty="Sem variantes." cols={[{ h: 'SKU', c: (r) => r.sku }, { h: 'Célula', c: (r) => r.celula.map((c: any) => `${c.eixo}: ${c.valor}`).join(' · ') }, { h: 'Saldo', c: (r) => String(r.onHand), right: true }]} /></Card>
    <Modal title="Novo eixo" open={novoEixo} onClose={() => setNovoEixo(false)}><ErrorBox error={criarEixo.error} /><Form onSubmit={(v) => void criarEixo.run(v)} busy={criarEixo.busy}>
      <Field label="Nome"><input className="input" name="name" required maxLength={40} placeholder="Tamanho" /></Field></Form></Modal>
    <Modal title={`Novo valor em ${valorDe?.name ?? ''}`} open={!!valorDe} onClose={() => setValorDe(null)}><ErrorBox error={criarValor.error} />{valorDe && <Form onSubmit={(v) => void criarValor.run(valorDe.id, v)} busy={criarValor.busy}>
      <Field label="Valor"><input className="input" name="value" required maxLength={40} placeholder="GG" /></Field>
      <Field label="Cor (opcional, #RRGGBB)"><input className="input" name="hexColor" pattern="#[0-9a-fA-F]{6}" placeholder="#1f2937" /></Field></Form>}</Modal>
  </div>;
}
