import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { useSession } from '@/lib/session';

export function Products() {
  const { can } = useSession(); const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const { data, reload } = useGet<any[]>('/products', { q });
  const criar = useAction(async (v: Record<string, any>) => { await post('/products', v); setOpen(false); await reload(); });
  return <div>
    <div className="row between"><h1>Produtos</h1><div className="row"><input className="input" placeholder="nome, SKU ou código" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />{can('core.products:manage') && <button className="btn primary" onClick={() => setOpen(true)}>Novo produto</button>}</div></div>
    <Table rows={data} cols={[{ h: 'Produto', c: (r) => r.name }, { h: 'Categoria', c: (r) => r.category?.name ?? '—' }, { h: 'Tipo', c: (r) => r.kind === 'SERVICE' ? 'Serviço' : 'Produto' }, { h: 'Variantes', c: (r) => r.variants.map((v: any) => v.sku).join(', ') }, { h: 'Custo', c: (r) => <Money v={r.costPrice} />, right: true }, { h: 'Venda', c: (r) => <Money v={r.salePrice} />, right: true }, { h: 'Estoque', c: (r) => r.trackStock ? 'controla' : 'não' }]} />
    <Modal title="Novo produto" open={open} onClose={() => setOpen(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="SKU"><input className="input" name="sku" required /></Field><Field label="Código de barras"><input className="input" name="barcode" /></Field>
      <div className="row"><Field label="Tipo"><select className="input" name="kind"><option value="GOOD">Produto</option><option value="SERVICE">Serviço</option></select></Field><Field label="Unidade"><input className="input" name="unit" defaultValue="UN" /></Field></div>
      <div className="row"><Field label="Custo"><input className="input" name="costPrice" type="number" step="0.01" /></Field><Field label="Preço de venda"><input className="input" name="salePrice" type="number" step="0.01" required /></Field></div>
      <label className="row"><input type="checkbox" name="hasVariants" /> Tem grade (tamanho/cor) — as variantes são geradas no módulo Varejo</label></Form></Modal>
  </div>;
}
