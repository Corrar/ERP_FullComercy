// PDV: bipa/digita código → carrinho → pagamento → POST /orders (estratégia do Varejo).
import { useEffect, useRef, useState } from 'react';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Money, Toast } from '@/components/ui';
import { brl } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Linha { variantId: string; sku: string; nome: string; preco: number; qtd: number }
const MEIOS = ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'VOUCHER', 'STORE_CREDIT'];

export function Pdv() {
  const caixa = useGet<any>('/m/varejo/caixa/atual', { terminal: localStorage.getItem('fc.terminal') ?? 'CAIXA-1' });
  // Vendedor só existe com a função "Comissões" no plano/perfil: sem ela, o campo some (a API
  // responderia 403 e o PDV mostraria um seletor vazio). Achado na navegação da prévia comprada.
  const { can } = useSession();
  const comVendedor = can('varejo.comissoes:view');
  const vendedores = useGet<any[]>(comVendedor ? '/m/varejo/vendedores' : null);
  const [linhas, setLinhas] = useState<Linha[]>([]); const [codigo, setCodigo] = useState(''); const [desconto, setDesconto] = useState(0);
  const [pag, setPag] = useState<{ method: string; amount: number }[]>([]); const [meio, setMeio] = useState('PIX'); const [valor, setValor] = useState('');
  const [vendedor, setVendedor] = useState(''); const [cliente, setCliente] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [linhas.length]);

  const subtotal = linhas.reduce((s, l) => s + l.preco * l.qtd, 0); const total = Math.max(0, subtotal - desconto); const pago = pag.reduce((s, p) => s + p.amount, 0); const falta = Math.round((total - pago) * 100) / 100;

  const bipar = useAction(async () => {
    if (!codigo.trim()) return;
    const prods = await get<any[]>('/products', { q: codigo.trim() });
    const todas = prods.flatMap((p) => p.variants.map((x: any) => ({ ...x, produto: p })));
    const v = todas.find((x) => x.sku === codigo.trim() || x.barcode === codigo.trim()) ?? todas[0];
    if (!v) throw new Error(`Item "${codigo}" não encontrado.`);
    setLinhas((ls) => { const i = ls.findIndex((l) => l.variantId === v.id); if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qtd: c[i].qtd + 1 }; return c; } return [...ls, { variantId: v.id, sku: v.sku, nome: [v.produto.name, v.name].filter(Boolean).join(' · '), preco: Number(v.priceOverride ?? v.produto.salePrice), qtd: 1 }]; });
    setCodigo('');
  });
  const finalizar = useAction(async () => {
    if (!caixa.data) throw new Error('Abra o caixa antes de vender.');
    if (falta > 0.009) throw new Error(`Faltam ${brl(falta)}.`);
    const o = await post('/orders', { channel: 'POS', items: linhas.map((l) => ({ variantId: l.variantId, quantity: l.qtd, unitPrice: l.preco })), discount: desconto, payments: pag, customerId: cliente || null, moduleData: { posSessionId: caixa.data.id, salespersonId: vendedor || undefined } });
    setMsg(`Venda #${o.number} concluída.`); setLinhas([]); setPag([]); setDesconto(0);
  });

  return <div className="pdv">
    <div className="grid">
      <Card><div className="row"><input ref={input} className="input" placeholder="Bipe o código de barras ou digite o SKU e Enter" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void bipar.run()} />
        <button className="btn" onClick={() => void bipar.run()}>Adicionar</button></div><ErrorBox error={bipar.error} />
        {!caixa.data && <div className="muted" style={{ marginTop: 8 }}>Sem caixa aberto neste terminal. Abra em <a href="/varejo/caixa">Caixa</a>.</div>}</Card>
      <Card title="Itens">{!linhas.length ? <div className="empty">Carrinho vazio</div> : <table className="table"><thead><tr><th>Item</th><th className="right">Qtd</th><th className="right">Unit.</th><th className="right">Total</th><th></th></tr></thead><tbody>
        {linhas.map((l) => <tr key={l.variantId}><td>{l.nome}<div className="muted">{l.sku}</div></td><td className="right"><input className="input" type="number" min={1} value={l.qtd} style={{ width: 70 }} onChange={(e) => setLinhas((ls) => ls.map((x) => x.variantId === l.variantId ? { ...x, qtd: Number(e.target.value) } : x))} /></td><td className="right mono">{brl(l.preco)}</td><td className="right mono">{brl(l.preco * l.qtd)}</td><td><button className="btn" onClick={() => setLinhas((ls) => ls.filter((x) => x.variantId !== l.variantId))}>✕</button></td></tr>)}</tbody></table>}</Card>
    </div>
    <div className="grid">
      <Card title="Total"><div className="total mono">{brl(total)}</div><div className="row"><label className="field">Desconto<input className="input" type="number" step="0.01" value={desconto} onChange={(e) => setDesconto(Number(e.target.value))} /></label>
        {comVendedor && <label className="field">Vendedor<select className="input" value={vendedor} onChange={(e) => setVendedor(e.target.value)}><option value="">—</option>{vendedores.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}</div>
        <label className="field">Cliente (id, opcional)<input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label></Card>
      <Card title="Pagamento"><div className="row"><select className="input" value={meio} onChange={(e) => setMeio(e.target.value)} style={{ width: 130 }}>{MEIOS.map((m) => <option key={m}>{m}</option>)}</select>
        <input className="input" type="number" step="0.01" placeholder={falta.toFixed(2)} value={valor} onChange={(e) => setValor(e.target.value)} />
        <button className="btn" onClick={() => { const a = Number(valor || falta); if (a > 0) { setPag((p) => [...p, { method: meio, amount: a }]); setValor(''); } }}>+</button></div>
        {pag.map((p, i) => <div key={i} className="row between"><span>{p.method}</span><span className="row"><Money v={p.amount} /><button className="btn" onClick={() => setPag((x) => x.filter((_, j) => j !== i))}>✕</button></span></div>)}
        <div className="row between" style={{ marginTop: 8 }}><span>{falta > 0 ? 'Falta' : 'Troco'}</span><strong><Money v={Math.abs(falta)} /></strong></div>
        <ErrorBox error={finalizar.error} />
        <button className="btn primary" style={{ width: '100%', marginTop: 8, padding: 14 }} disabled={!linhas.length || finalizar.busy} onClick={() => void finalizar.run()}>Finalizar venda (F12)</button></Card>
    </div>
    <Toast msg={msg} />
  </div>;
}
