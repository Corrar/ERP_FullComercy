// PDV: bipa/digita código → carrinho → pagamento → POST /orders (estratégia do Varejo).
import { useEffect, useRef, useState } from 'react';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Modal, Money, Table, Toast } from '@/components/ui';
import { brl } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Linha { variantId: string; sku: string; nome: string; preco: number; qtd: number }
// Vale-troca não é um meio digitado: entra por "Usar vale", que abate o vale da devolução certo
// (`moduleData.valeFinanceEntryId`). Um STORE_CREDIT digitado à mão não abatia vale nenhum.
const MEIOS = ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'VOUCHER'];
interface Vale { id: string; saldo: number; cliente: { id: string; name: string } }

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
  const [vale, setVale] = useState<Vale | null>(null); const [buscaVale, setBuscaVale] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [linhas.length]);

  const subtotal = linhas.reduce((s, l) => s + l.preco * l.qtd, 0); const total = Math.max(0, subtotal - desconto); const doVale = vale ? Math.min(vale.saldo, total) : 0; const pago = pag.reduce((s, p) => s + p.amount, 0); const falta = Math.round((total - doVale - pago) * 100) / 100;

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
    const o = await post('/orders', { channel: 'POS', items: linhas.map((l) => ({ variantId: l.variantId, quantity: l.qtd, unitPrice: l.preco })), discount: desconto, payments: pag, customerId: (vale?.cliente.id ?? cliente) || null, moduleData: { posSessionId: caixa.data.id, salespersonId: vendedor || undefined, valeFinanceEntryId: vale?.id } });
    setMsg(`Venda #${o.number} concluída.`); setLinhas([]); setPag([]); setDesconto(0); setVale(null);
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
        <label className="field">Cliente (id, opcional)<input className="input" value={vale?.cliente.id ?? cliente} disabled={!!vale} onChange={(e) => setCliente(e.target.value)} /></label>
        {vale ? <div className="row between" style={{ marginTop: 8 }}><span>Vale de {vale.cliente.name} <span className="muted">(saldo {brl(vale.saldo)})</span></span><span className="row"><span className="mono">− {brl(doVale)}</span><button className="btn" aria-label="Tirar o vale" onClick={() => setVale(null)}>✕</button></span></div>
          : <button className="btn" style={{ marginTop: 8 }} onClick={() => setBuscaVale(true)}>Usar vale</button>}</Card>
      <Card title="Pagamento"><div className="row"><select className="input" value={meio} onChange={(e) => setMeio(e.target.value)} style={{ width: 130 }}>{MEIOS.map((m) => <option key={m}>{m}</option>)}</select>
        <input className="input" type="number" step="0.01" placeholder={falta.toFixed(2)} value={valor} onChange={(e) => setValor(e.target.value)} />
        <button className="btn" onClick={() => { const a = Number(valor || falta); if (a > 0) { setPag((p) => [...p, { method: meio, amount: a }]); setValor(''); } }}>+</button></div>
        {pag.map((p, i) => <div key={i} className="row between"><span>{p.method}</span><span className="row"><Money v={p.amount} /><button className="btn" onClick={() => setPag((x) => x.filter((_, j) => j !== i))}>✕</button></span></div>)}
        <div className="row between" style={{ marginTop: 8 }}><span>{falta > 0 ? 'Falta' : 'Troco'}</span><strong><Money v={Math.abs(falta)} /></strong></div>
        <ErrorBox error={finalizar.error} />
        <button className="btn primary" style={{ width: '100%', marginTop: 8, padding: 14 }} disabled={!linhas.length || finalizar.busy} onClick={() => void finalizar.run()}>Finalizar venda (F12)</button></Card>
    </div>
    <Toast msg={msg} />
    <Modal title="Usar vale-troca" open={buscaVale} onClose={() => setBuscaVale(false)}><EscolherVale onEscolher={(v) => { setVale(v); setBuscaVale(false); }} /></Modal>
  </div>;
}

/** Acha o cliente e lista os vales em aberto dele (devoluções pagas em vale-compra). */
function EscolherVale({ onEscolher }: { onEscolher: (v: Vale) => void }) {
  const [q, setQ] = useState(''); const [cliente, setCliente] = useState<{ id: string; name: string } | null>(null);
  const clientes = useGet<any[]>(q.trim().length >= 2 && !cliente ? '/customers' : null, { q: q.trim() });
  const vales = useGet<any[]>(cliente ? `/m/varejo/devolucoes/vales/${cliente.id}` : null);
  if (!cliente) return <div className="grid" style={{ gap: 10 }}>
    <input className="input" autoFocus placeholder="Nome, telefone ou documento do cliente" value={q} onChange={(e) => setQ(e.target.value)} />
    <ErrorBox error={clientes.error} />
    {q.trim().length >= 2 && <Table rows={clientes.data} empty="Nenhum cliente encontrado." onRow={(c) => setCliente({ id: c.id, name: c.name })} cols={[{ h: 'Cliente', c: (c) => c.name }, { h: 'Telefone', c: (c) => c.phone ?? '—' }]} />}
  </div>;
  return <div className="grid" style={{ gap: 10 }}>
    <div className="row between"><strong>{cliente.name}</strong><button className="btn" onClick={() => setCliente(null)}>Trocar cliente</button></div>
    <ErrorBox error={vales.error} />
    <Table rows={vales.data} empty="Este cliente não tem vale em aberto." cols={[
      { h: 'Vale', c: (v) => v.description }, { h: 'Saldo', c: (v) => <Money v={Number(v.amount) - Number(v.paidAmount)} />, right: true },
      { h: '', c: (v) => <button className="btn primary" onClick={() => onEscolher({ id: v.id, saldo: Number(v.amount) - Number(v.paidAmount), cliente })}>Usar</button> },
    ]} />
  </div>;
}
