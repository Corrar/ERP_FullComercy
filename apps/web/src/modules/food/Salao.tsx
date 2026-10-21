// Salão: mapa de mesas → comanda → lançar rodada (POST /orders) → conta → fechar.
import { useCallback, useState } from 'react';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { Card, ErrorBox, Field, Form, Modal, Money } from '@/components/ui';
import { brl } from '@/lib/format';

export function Salao() {
  const mesas = useGet<any[]>('/m/food/mesas'); const menus = useGet<any[]>('/m/food/menus');
  const [mesa, setMesa] = useState<any | null>(null); const [conta, setConta] = useState<any | null>(null); const [menu, setMenu] = useState<any | null>(null);
  const [carrinho, setCarrinho] = useState<{ variantId: string; nome: string; preco: number; qtd: number }[]>([]);
  useSocketEvent('order.status', useCallback(() => { void mesas.reload(); }, [mesas]));
  const abrirMesa = async (m: any) => { setMesa(m); setCarrinho([]); setConta(m.comanda ? await get(`/m/food/comandas/${m.comanda.id}/conta`) : null); if (menus.data?.[0] && !menu) setMenu(await get(`/m/food/menus/${menus.data[0].id}`)); };
  const abrirComanda = useAction(async (v: Record<string, any>) => { await post('/m/food/comandas', { code: v.code, tableId: mesa.id, guests: v.guests }); await mesas.reload(); const m = (await get<any[]>('/m/food/mesas')).find((x) => x.id === mesa.id); await abrirMesa(m); });
  const lancar = useAction(async () => {
    await post('/orders', { channel: 'TABLE', items: carrinho.map((c) => ({ variantId: c.variantId, quantity: c.qtd })), moduleData: { tabId: mesa.comanda.id, tableId: mesa.id, menuId: menu?.id } });
    setCarrinho([]); setConta(await get(`/m/food/comandas/${mesa.comanda.id}/conta`));
  });
  const fechar = useAction(async (v: Record<string, any>) => { await post(`/m/food/comandas/${mesa.comanda.id}/fechar`, { payments: [{ method: v.method, amount: v.amount }] }); setMesa(null); await mesas.reload(); });
  const add = (i: any) => setCarrinho((c) => { const k = c.findIndex((x) => x.variantId === i.variantId); if (k >= 0) { const n = [...c]; n[k] = { ...n[k], qtd: n[k].qtd + 1 }; return n; } return [...c, { variantId: i.variantId, nome: i.displayName, preco: Number(i.price), qtd: 1 }]; });
  return <div>
    <h1>Salão</h1>
    <div className="salao">{mesas.data?.map((m) => <div key={m.id} className={`mesa ${m.status}`} onClick={() => void abrirMesa(m)}><strong>Mesa {m.number}</strong><div className="muted">{m.area}</div>{m.comanda ? <div className="mono">{brl(m.comanda.parcial)}</div> : <div className="muted">livre</div>}</div>)}</div>
    <Modal title={`Mesa ${mesa?.number ?? ''}`} open={!!mesa} onClose={() => setMesa(null)}>
      {mesa && !mesa.comanda && <><ErrorBox error={abrirComanda.error} /><Form onSubmit={(v) => void abrirComanda.run(v)} busy={abrirComanda.busy} submitLabel="Abrir comanda"><Field label="Nº da comanda"><input className="input" name="code" defaultValue={`M${mesa.number}-${Date.now().toString().slice(-4)}`} required /></Field><Field label="Pessoas"><input className="input" name="guests" type="number" min={1} defaultValue={2} /></Field></Form></>}
      {mesa?.comanda && <div className="grid">
        <div className="row between"><div>Comanda <strong>{mesa.comanda.code}</strong> · {mesa.comanda.guests} pessoas</div><select className="input" style={{ width: 200 }} value={menu?.id ?? ''} onChange={async (e) => setMenu(await get(`/m/food/menus/${e.target.value}`))}>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <Card title="Lançar rodada">{menu?.categories.map((c: any) => <div key={c.id}><div className="muted" style={{ margin: '6px 0' }}>{c.name}</div><div className="row">{c.items.filter((i: any) => i.isAvailable).map((i: any) => <button key={i.id} className="btn" onClick={() => add(i)}>{i.displayName} · {brl(i.price)}</button>)}</div></div>)}
          {carrinho.length > 0 && <div style={{ marginTop: 10 }}>{carrinho.map((c) => <div key={c.variantId} className="row between"><span>{c.qtd}× {c.nome}</span><Money v={c.preco * c.qtd} /></div>)}<ErrorBox error={lancar.error} /><button className="btn primary" style={{ marginTop: 8 }} onClick={() => void lancar.run()} disabled={lancar.busy}>Enviar para a cozinha</button></div>}</Card>
        {conta && <Card title="Conta"><div className="row between"><span>Consumo</span><Money v={conta.subtotal} /></div><div className="row between"><span>Taxa de serviço</span><Money v={conta.taxaServico} /></div><div className="row between"><strong>Total</strong><strong><Money v={conta.total} /></strong></div><div className="row between muted"><span>Pago</span><Money v={conta.pago} /></div>
          <ErrorBox error={fechar.error} /><Form key={String(conta.restante)} onSubmit={(v) => void fechar.run(v)} busy={fechar.busy} submitLabel="Fechar conta"><div className="row"><Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT'].map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" defaultValue={Number(conta.restante).toFixed(2)} required /></Field></div></Form></Card>}
      </div>}
    </Modal>
  </div>;
}
