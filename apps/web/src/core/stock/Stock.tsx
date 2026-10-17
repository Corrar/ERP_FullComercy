import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Form, Modal, Table, Tabs } from '@/components/ui';
import { dt, num } from '@/lib/format';
import { useSession } from '@/lib/session';

export function Stock() {
  const { can } = useSession(); const [tab, setTab] = useState('saldos'); const [mov, setMov] = useState(false);
  const saldos = useGet<any[]>(tab === 'saldos' ? '/stock/balances' : null);
  const baixo = useGet<any[]>(tab === 'baixo' ? '/stock/low' : null);
  const razao = useGet<any[]>(tab === 'razao' ? '/stock/ledger' : null, { take: 200 });
  const contagens = useGet<any[]>(tab === 'inventario' ? '/stock/counts' : null);
  const movimentar = useAction(async (v: Record<string, any>) => { await post('/stock/movements', v); setMov(false); await saldos.reload(); });
  const abrirContagem = useAction(async () => { await post('/stock/counts', {}); await contagens.reload(); });
  return <div>
    <div className="row between"><h1>Estoque</h1><div className="row">{can('core.stock:move') && <button className="btn primary" onClick={() => setMov(true)}>Movimentar</button>}</div></div>
    <Tabs tabs={[{ k: 'saldos', label: 'Saldos' }, { k: 'baixo', label: 'Abaixo do mínimo' }, { k: 'razao', label: 'Razão' }, { k: 'inventario', label: 'Inventário' }]} active={tab} onChange={setTab} />
    {tab === 'saldos' && <Table rows={saldos.data} cols={[{ h: 'Produto', c: (r) => r.variant.product.name }, { h: 'SKU', c: (r) => r.variant.sku }, { h: 'Armazém', c: (r) => r.warehouse.code }, { h: 'Saldo', c: (r) => num(r.onHand, 0), right: true }, { h: 'Reservado', c: (r) => num(r.reserved, 0), right: true }, { h: 'Mínimo', c: (r) => r.minLevel ?? '—', right: true }]} />}
    {tab === 'baixo' && <Table rows={baixo.data} empty="Nenhum item abaixo do mínimo." cols={[{ h: 'Produto', c: (r) => r.product }, { h: 'SKU', c: (r) => r.sku }, { h: 'Armazém', c: (r) => r.warehouse }, { h: 'Saldo', c: (r) => r.on_hand, right: true }, { h: 'Mínimo', c: (r) => r.min_level, right: true }]} />}
    {tab === 'razao' && <Table rows={razao.data} cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'SKU', c: (r) => r.variant.sku }, { h: 'Tipo', c: (r) => r.kind }, { h: 'Δ saldo', c: (r) => r.deltaOnHand, right: true }, { h: 'Δ reserva', c: (r) => r.deltaReserved, right: true }, { h: 'Ref', c: (r) => r.refType ?? '—' }, { h: 'Quem', c: (r) => r.user?.name ?? 'sistema' }]} />}
    {tab === 'inventario' && <div><div className="row" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => void abrirContagem.run()}>Abrir contagem</button><ErrorBox error={abrirContagem.error} /></div>
      <Table rows={contagens.data} cols={[{ h: 'Aberta em', c: (r) => dt(r.openedAt) }, { h: 'Armazém', c: (r) => r.warehouse.code }, { h: 'Itens', c: (r) => r._count.items, right: true }, { h: 'Status', c: (r) => r.status }]} /></div>}
    <Modal title="Movimento manual" open={mov} onClose={() => setMov(false)}><ErrorBox error={movimentar.error} /><Form onSubmit={(v) => void movimentar.run(v)} busy={movimentar.busy}>
      <Field label="ID da variante"><input className="input" name="variantId" required /></Field>
      <Field label="Tipo"><select className="input" name="kind"><option value="RECEIVE">Entrada</option><option value="CONSUME">Saída</option><option value="ADJUST">Ajustar para</option></select></Field>
      <Field label="Quantidade"><input className="input" name="quantity" type="number" step="0.001" required /></Field><Field label="Observação"><input className="input" name="note" /></Field></Form></Modal>
  </div>;
}
