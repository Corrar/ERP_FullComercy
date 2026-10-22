// Salão: mapa de mesas → comanda → lançar rodada (POST /orders) → conta → fechar.
import { useCallback, useState } from 'react';
import { ContaComanda } from './ContaComanda';
import { get, patch, post } from '@/lib/api';
import { useSession } from '@/lib/session';
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
  const transferir = useAction(async (toTableId: string) => { if (!toTableId) return; await post(`/m/food/comandas/${mesa.comanda.id}/transferir`, { toTableId }); setMesa(null); await mesas.reload(); });
  const cancelarComanda = useAction(async () => { const reason = window.prompt('Motivo do cancelamento da comanda (mín. 3 letras)'); if (!reason) return; await post(`/m/food/comandas/${mesa.comanda.id}/cancelar`, { reason }); setMesa(null); await mesas.reload(); });
  // Cadastro de mesas (quem gerencia o salão): criar, mudar área/lugares e desativar a mesa livre.
  const { can } = useSession(); const gerir = can('food.salao:manage'); const [novaMesa, setNovaMesa] = useState(false);
  const criarMesa = useAction(async (v: Record<string, any>) => { await post('/m/food/mesas', { number: v.number, area: v.area || undefined, seats: v.seats || undefined }); setNovaMesa(false); await mesas.reload(); });
  const editarMesa = useAction(async (v: Record<string, any>) => { await patch(`/m/food/mesas/${mesa.id}`, { area: v.area, seats: v.seats || undefined }); setMesa(null); await mesas.reload(); });
  const desativarMesa = useAction(async () => { if (!window.confirm(`Desativar a mesa ${mesa.number}? Ela sai do mapa.`)) return; await patch(`/m/food/mesas/${mesa.id}`, { isActive: false }); setMesa(null); await mesas.reload(); });
  const add = (i: any) => setCarrinho((c) => { const k = c.findIndex((x) => x.variantId === i.variantId); if (k >= 0) { const n = [...c]; n[k] = { ...n[k], qtd: n[k].qtd + 1 }; return n; } return [...c, { variantId: i.variantId, nome: i.displayName, preco: Number(i.price), qtd: 1 }]; });
  return <div>
    <div className="row between"><h1>Salão</h1>{gerir && <button className="btn" onClick={() => setNovaMesa(true)}>Nova mesa</button>}</div>
    <div className="salao">{mesas.data?.map((m) => <div key={m.id} className={`mesa ${m.status}`} onClick={() => void abrirMesa(m)}><strong>Mesa {m.number}</strong><div className="muted">{m.area}</div>{m.comanda ? <div className="mono">{brl(m.comanda.parcial)}</div> : <div className="muted">livre</div>}</div>)}</div>
    <Modal title={`Mesa ${mesa?.number ?? ''}`} open={!!mesa} onClose={() => setMesa(null)}>
      {mesa && !mesa.comanda && <><ErrorBox error={abrirComanda.error} /><Form onSubmit={(v) => void abrirComanda.run(v)} busy={abrirComanda.busy} submitLabel="Abrir comanda"><Field label="Nº da comanda"><input className="input" name="code" defaultValue={`M${mesa.number}-${Date.now().toString().slice(-4)}`} required /></Field><Field label="Pessoas"><input className="input" name="guests" type="number" min={1} defaultValue={2} /></Field></Form>
        {gerir && <Card title="Cadastro da mesa"><ErrorBox error={editarMesa.error ?? desativarMesa.error} /><Form key={mesa.id} onSubmit={(v) => void editarMesa.run(v)} busy={editarMesa.busy} submitLabel="Salvar mesa">
          <div className="row"><Field label="Área"><input className="input" name="area" defaultValue={mesa.area ?? ''} /></Field><Field label="Lugares"><input className="input" name="seats" type="number" min={1} defaultValue={mesa.seats ?? ''} /></Field></div></Form>
          <button className="btn danger" style={{ marginTop: 8 }} onClick={() => void desativarMesa.run()}>Desativar mesa</button></Card>}</>}
      {mesa?.comanda && <div className="grid">
        <div className="row" style={{ flexWrap: 'wrap' }}><select className="input" style={{ width: 200 }} value="" aria-label="Transferir para a mesa" onChange={(e) => void transferir.run(e.target.value)}><option value="">Transferir para…</option>{mesas.data?.filter((x) => x.id !== mesa.id && !x.comanda).map((x) => <option key={x.id} value={x.id}>Mesa {x.number}</option>)}</select>
          <button className="btn danger" onClick={() => void cancelarComanda.run()}>Cancelar comanda</button><ErrorBox error={transferir.error ?? cancelarComanda.error} /></div>
        <div className="row between"><div>Comanda <strong>{mesa.comanda.code}</strong> · {mesa.comanda.guests} pessoas</div><select className="input" style={{ width: 200 }} value={menu?.id ?? ''} onChange={async (e) => setMenu(await get(`/m/food/menus/${e.target.value}`))}>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <Card title="Lançar rodada">{menu?.categories.map((c: any) => <div key={c.id}><div className="muted" style={{ margin: '6px 0' }}>{c.name}</div><div className="row">{c.items.filter((i: any) => i.isAvailable).map((i: any) => <button key={i.id} className="btn" onClick={() => add(i)}>{i.displayName} · {brl(i.price)}</button>)}</div></div>)}
          {carrinho.length > 0 && <div style={{ marginTop: 10 }}>{carrinho.map((c) => <div key={c.variantId} className="row between"><span>{c.qtd}× {c.nome}</span><Money v={c.preco * c.qtd} /></div>)}<ErrorBox error={lancar.error} /><button className="btn primary" style={{ marginTop: 8 }} onClick={() => void lancar.run()} disabled={lancar.busy}>Enviar para a cozinha</button></div>}</Card>
        {conta && <ContaComanda key={conta.tab.id} conta={conta} onAtualizada={setConta} onFechada={async () => { setMesa(null); await mesas.reload(); }} />}
      </div>}
    </Modal>
    <Modal title="Nova mesa" open={novaMesa} onClose={() => setNovaMesa(false)}><ErrorBox error={criarMesa.error} /><Form onSubmit={(v) => void criarMesa.run(v)} busy={criarMesa.busy}>
      <div className="row"><Field label="Número"><input className="input" name="number" type="number" min={1} required /></Field><Field label="Lugares"><input className="input" name="seats" type="number" min={1} defaultValue={4} /></Field></div>
      <Field label="Área"><input className="input" name="area" placeholder="Salão, Varanda…" /></Field></Form></Modal>
  </div>;
}
