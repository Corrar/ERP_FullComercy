import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, ErrorBox, Field, Form, Modal, Money, Table, Tabs } from '@/components/ui';
import { d } from '@/lib/format';

export function Purchases() {
  const [tab, setTab] = useState('pedidos'); const [novoForn, setNovoForn] = useState(false);
  const pedidos = useGet<any[]>(tab === 'pedidos' ? '/purchases' : null);
  const forn = useGet<any[]>('/suppliers');
  const sug = useGet<any[]>(tab === 'sugestao' ? '/purchases/sugestao' : null);
  const criarForn = useAction(async (v: Record<string, any>) => { await post('/suppliers', v); setNovoForn(false); await forn.reload(); });
  const receber = useAction(async (id: string) => { await post(`/purchases/${id}/receive`, {}); await pedidos.reload(); });
  const enviar = useAction(async (id: string) => { await post(`/purchases/${id}/ordered`); await pedidos.reload(); });
  return <div>
    <h1>Compras</h1>
    <Tabs tabs={[{ k: 'pedidos', label: 'Pedidos de compra' }, { k: 'fornecedores', label: 'Fornecedores' }, { k: 'sugestao', label: 'Sugestão de reposição' }]} active={tab} onChange={setTab} />
    <ErrorBox error={receber.error ?? enviar.error} />
    {tab === 'pedidos' && <Table rows={pedidos.data} cols={[{ h: '#', c: (r) => r.number }, { h: 'Fornecedor', c: (r) => r.supplier.name }, { h: 'Itens', c: (r) => r._count.items, right: true }, { h: 'Total', c: (r) => <Money v={r.total} />, right: true }, { h: 'Previsto', c: (r) => d(r.expectedAt) }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: '', c: (r) => r.status === 'DRAFT' ? <button className="btn" onClick={() => void enviar.run(r.id)}>Enviar</button> : ['ORDERED', 'PARTIAL'].includes(r.status) ? <button className="btn primary" onClick={() => void receber.run(r.id)}>Receber tudo</button> : null }]} />}
    {tab === 'fornecedores' && <div><div className="row" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setNovoForn(true)}>Novo fornecedor</button></div>
      <Table rows={forn.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Documento', c: (r) => r.document ?? '—' }, { h: 'Telefone', c: (r) => r.phone ?? '—' }, { h: 'E-mail', c: (r) => r.email ?? '—' }]} /></div>}
    {tab === 'sugestao' && <Table rows={sug.data} empty="Nada abaixo do mínimo." cols={[{ h: 'Produto', c: (r) => r.produto }, { h: 'SKU', c: (r) => r.sku }, { h: 'Saldo', c: (r) => r.on_hand, right: true }, { h: 'Mínimo', c: (r) => r.min_level, right: true }, { h: 'Sugerido', c: (r) => r.sugerido, right: true }, { h: 'Último fornecedor', c: (r) => r.ultimo_fornecedor ?? '—' }, { h: 'Último custo', c: (r) => r.ultimo_custo ? Number(r.ultimo_custo).toFixed(2) : '—', right: true }]} />}
    <Modal title="Novo fornecedor" open={novoForn} onClose={() => setNovoForn(false)}><ErrorBox error={criarForn.error} /><Form onSubmit={(v) => void criarForn.run(v)} busy={criarForn.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="CNPJ"><input className="input" name="document" /></Field><Field label="Telefone"><input className="input" name="phone" /></Field><Field label="E-mail"><input className="input" name="email" type="email" /></Field></Form></Modal>
  </div>;
}
