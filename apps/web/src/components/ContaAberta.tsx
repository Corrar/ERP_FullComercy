// src/components/ContaAberta.tsx — a CONTA de um pedido aberto, reaproveitada pelos módulos que
// atendem antes de cobrar (comanda do salão, balcão do pet, conta do hóspede, consulta por
// convênio): itens, lançar produto pelo código/SKU, receber e ver quanto falta. Quem decide preço,
// estoque e quando o pedido fecha é a API (estratégia do módulo).
import { useState } from 'react';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Money } from './ui';
import { brl, num } from '@/lib/format';
import { CobrarPix } from '@/core/payments/CobrarPix';

const MEIOS: { k: string; label: string }[] = [{ k: 'PIX', label: 'PIX' }, { k: 'CASH', label: 'Dinheiro' }, { k: 'DEBIT', label: 'Débito' }, { k: 'CREDIT', label: 'Crédito' }, { k: 'TRANSFER', label: 'Transferência' }];

export function ContaAberta({ orderId, titulo = 'Conta', podeLancar = true, onChange }: { orderId: string; titulo?: string; podeLancar?: boolean; onChange?: (o: any) => void }) {
  const o = useGet<any>(`/orders/${orderId}`);
  const [codigo, setCodigo] = useState(''); const [meio, setMeio] = useState('PIX'); const [valor, setValor] = useState('');
  const recarregar = async () => { await o.reload(); onChange?.(await get(`/orders/${orderId}`)); };
  const lancar = useAction(async () => {
    const c = codigo.trim(); if (!c) return;
    const prods = await get<any[]>('/products', { q: c });
    const v = prods.flatMap((p) => p.variants.map((x: any) => ({ ...x, produto: p }))).find((x) => x.sku === c || x.barcode === c) ?? prods[0]?.variants[0];
    if (!v) throw new Error(`Produto "${c}" não encontrado.`);
    await post(`/orders/${orderId}/items`, { items: [{ variantId: v.id, quantity: 1 }] }); setCodigo(''); await recarregar();
  });
  const pago = (o.data?.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const falta = Math.round((Number(o.data?.total ?? 0) - pago) * 100) / 100;
  const receber = useAction(async () => {
    const a = Number(valor || falta); if (!(a > 0)) throw new Error('Nada a receber.');
    await post(`/orders/${orderId}/payments`, { payments: [{ method: meio, amount: a }] }); setValor(''); await recarregar();
  });
  if (!o.data) return <Card title={titulo}><ErrorBox error={o.error} />{!o.error && <div className="muted">Carregando…</div>}</Card>;
  const aberto = !['COMPLETED', 'CANCELLED'].includes(o.data.status);
  return <Card title={`${titulo} #${o.data.number}`} actions={<Badge s={o.data.status} />}>
    <table className="table"><thead><tr><th>Item</th><th className="right">Qtd</th><th className="right">Total</th></tr></thead>
      <tbody>{o.data.items.map((i: any) => <tr key={i.id}><td>{i.description}</td><td className="right">{num(i.quantity)}</td><td className="right"><Money v={i.total} /></td></tr>)}</tbody></table>
    {aberto && podeLancar && <div className="row" style={{ marginTop: 10 }}>
      <input className="input" placeholder="Lançar produto: código, SKU ou nome" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void lancar.run()} />
      <button className="btn" onClick={() => void lancar.run()} disabled={lancar.busy}>Lançar</button></div>}
    <ErrorBox error={lancar.error} />
    <div className="row between" style={{ marginTop: 10 }}><span>Total</span><strong className="mono">{brl(o.data.total)}</strong></div>
    {o.data.payments.map((p: any) => <div key={p.id} className="row between muted"><span>{p.method}{p.reference ? ` · ${p.reference}` : ''}</span><Money v={p.amount} /></div>)}
    <div className="row between"><span>{falta > 0 ? 'Falta' : 'Pago'}</span><strong className="mono">{brl(Math.max(0, falta))}</strong></div>
    {aberto && falta > 0 && <div className="row" style={{ marginTop: 10 }}>
      <select className="input" value={meio} onChange={(e) => setMeio(e.target.value)} style={{ width: 150 }}>{MEIOS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}</select>
      <input className="input" type="number" step="0.01" min={0} placeholder={falta.toFixed(2)} value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor a receber" />
      <button className="btn primary" onClick={() => void receber.run()} disabled={receber.busy}>Receber</button>
      <CobrarPix orderId={orderId} falta={falta} onPago={recarregar} /></div>}
    <ErrorBox error={receber.error} />
  </Card>;
}
