import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Switch, Table, Tabs, Toast } from '@/components/ui';
import { EscolherProduto, type VarianteMin } from '@/components/EscolherProduto';
import { dt, num } from '@/lib/format';
import { useSession } from '@/lib/session';

export function Stock() {
  const { can } = useSession(); const mover = can('core.stock:move');
  const [tab, setTab] = useState('saldos'); const [mov, setMov] = useState(false); const [transf, setTransf] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [contagem, setContagem] = useState<string | null>(null); const [novaContagem, setNovaContagem] = useState(false);
  const saldos = useGet<any[]>(tab === 'saldos' ? '/stock/balances' : null);
  const baixo = useGet<any[]>(tab === 'baixo' ? '/stock/low' : null);
  const razao = useGet<any[]>(tab === 'razao' ? '/stock/ledger' : null, { take: 200 });
  const contagens = useGet<any[]>(tab === 'inventario' ? '/stock/counts' : null);
  const armazens = useGet<any[]>('/stock/warehouses');
  if (contagem) return <Contagem id={contagem} voltar={() => { setContagem(null); void contagens.reload(); }} />;
  return <div>
    <div className="row between"><h1>Estoque</h1><div className="row">{mover && <><button className="btn" onClick={() => setTransf(true)}>Transferir</button><button className="btn primary" onClick={() => setMov(true)}>Movimentar</button></>}</div></div>
    <Tabs tabs={[{ k: 'saldos', label: 'Saldos' }, { k: 'baixo', label: 'Abaixo do mínimo' }, { k: 'razao', label: 'Razão' }, { k: 'inventario', label: 'Inventário' }, { k: 'armazens', label: 'Armazéns' }]} active={tab} onChange={setTab} />
    {tab === 'saldos' && <Table rows={saldos.data} cols={[{ h: 'Produto', c: (r) => r.variant.product.name }, { h: 'SKU', c: (r) => r.variant.sku }, { h: 'Armazém', c: (r) => r.warehouse.code }, { h: 'Saldo', c: (r) => num(r.onHand, 0), right: true }, { h: 'Reservado', c: (r) => num(r.reserved, 0), right: true }, { h: 'Mínimo', c: (r) => r.minLevel ?? '—', right: true }]} />}
    {tab === 'baixo' && <Table rows={baixo.data} empty="Nenhum item abaixo do mínimo." cols={[{ h: 'Produto', c: (r) => r.product }, { h: 'SKU', c: (r) => r.sku }, { h: 'Armazém', c: (r) => r.warehouse }, { h: 'Saldo', c: (r) => r.on_hand, right: true }, { h: 'Mínimo', c: (r) => r.min_level, right: true }]} />}
    {tab === 'razao' && <Table rows={razao.data} cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'SKU', c: (r) => r.variant.sku }, { h: 'Tipo', c: (r) => r.kind }, { h: 'Δ saldo', c: (r) => r.deltaOnHand, right: true }, { h: 'Δ reserva', c: (r) => r.deltaReserved, right: true }, { h: 'Ref', c: (r) => r.refType ?? '—' }, { h: 'Quem', c: (r) => r.user?.name ?? 'sistema' }]} />}
    {tab === 'inventario' && <div>{mover && <div className="row" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setNovaContagem(true)}>Abrir contagem</button></div>}
      <Table rows={contagens.data} empty="Nenhuma contagem." onRow={(r) => setContagem(r.id)} cols={[{ h: 'Aberta em', c: (r) => dt(r.openedAt) }, { h: 'Armazém', c: (r) => r.warehouse.code }, { h: 'Itens', c: (r) => r._count.items, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }]} /></div>}
    {tab === 'armazens' && <Armazens lista={armazens} podeMover={mover} />}
    <Modal title="Movimento manual" open={mov} onClose={() => setMov(false)}>{mov && <Movimento onDone={async () => { setMov(false); setMsg('Movimento lançado.'); await saldos.reload(); }} />}</Modal>
    <Modal title="Transferir entre armazéns" open={transf} onClose={() => setTransf(false)}>{transf && <Transferencia armazens={armazens.data ?? []} onDone={async () => { setTransf(false); setMsg('Transferência feita.'); await saldos.reload(); }} />}</Modal>
    <Modal title="Abrir contagem" open={novaContagem} onClose={() => setNovaContagem(false)}>{novaContagem && <AbrirContagem armazens={armazens.data ?? []} onDone={(id) => { setNovaContagem(false); setContagem(id); }} />}</Modal>
    <Toast msg={msg} />
  </div>;
}

function Movimento({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState<VarianteMin | null>(null);
  const salvar = useAction(async (f: Record<string, any>) => { if (!v) throw new Error('Escolha o produto.'); await post('/stock/movements', { variantId: v.id, kind: f.kind, quantity: f.quantity, note: f.note }); onDone(); });
  return <div className="grid" style={{ gap: 12 }}><EscolherProduto value={v} onChange={setV} /><ErrorBox error={salvar.error} />
    <Form onSubmit={(f) => void salvar.run(f)} busy={salvar.busy}>
      <Field label="Tipo"><select className="input" name="kind"><option value="RECEIVE">Entrada</option><option value="CONSUME">Saída</option><option value="ADJUST">Ajustar saldo para</option></select></Field>
      <Field label="Quantidade"><input className="input" name="quantity" type="number" step="0.001" min={0} required /></Field><Field label="Observação"><input className="input" name="note" /></Field></Form></div>;
}

function Transferencia({ armazens, onDone }: { armazens: any[]; onDone: () => void }) {
  const [v, setV] = useState<VarianteMin | null>(null); const ativos = armazens.filter((a) => a.isActive);
  const salvar = useAction(async (f: Record<string, any>) => { if (!v) throw new Error('Escolha o produto.'); await post('/stock/transfers', { variantId: v.id, fromWarehouseId: f.from, toWarehouseId: f.to, quantity: f.quantity, note: f.note }); onDone(); });
  if (ativos.length < 2) return <div className="muted">Para transferir é preciso ter pelo menos dois armazéns ativos (aba Armazéns).</div>;
  return <div className="grid" style={{ gap: 12 }}><EscolherProduto value={v} onChange={setV} /><ErrorBox error={salvar.error} />
    <Form onSubmit={(f) => void salvar.run(f)} busy={salvar.busy}>
      <div className="row"><Field label="De"><select className="input" name="from" defaultValue={ativos[0].id}>{ativos.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="Para"><select className="input" name="to" defaultValue={ativos[1].id}>{ativos.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field></div>
      <Field label="Quantidade"><input className="input" name="quantity" type="number" step="0.001" min={0.001} required /></Field><Field label="Observação"><input className="input" name="note" /></Field></Form></div>;
}

function Armazens({ lista, podeMover }: { lista: { data: any[] | null; reload: () => Promise<void> }; podeMover: boolean }) {
  const [novo, setNovo] = useState(false);
  const criar = useAction(async (f: Record<string, any>) => { await post('/stock/warehouses', { code: f.code, name: f.name }); setNovo(false); await lista.reload(); });
  const mudar = useAction(async (a: any, body: Record<string, unknown>) => { await patch(`/stock/warehouses/${a.id}`, body); await lista.reload(); });
  return <Card title="Armazéns" actions={podeMover && <button className="btn primary" onClick={() => setNovo(true)}>Novo armazém</button>}><ErrorBox error={mudar.error} />
    <Table rows={lista.data} cols={[{ h: 'Código', c: (a) => a.code }, { h: 'Nome', c: (a) => a.name }, { h: 'Padrão', c: (a) => a.isDefault ? 'sim' : (podeMover && a.isActive ? <button className="btn" onClick={() => void mudar.run(a, { isDefault: true })}>Tornar padrão</button> : 'não') },
      { h: 'Ativo', c: (a) => <Switch on={a.isActive} disabled={!podeMover || a.isDefault} label={`Armazém ${a.code} ativo`} onChange={() => void mudar.run(a, { isActive: !a.isActive })} /> }]} />
    <Modal title="Novo armazém" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(f) => void criar.run(f)} busy={criar.busy}>
      <div className="row"><Field label="Código"><input className="input" name="code" required maxLength={20} placeholder="LOJA2" /></Field><Field label="Nome"><input className="input" name="name" required /></Field></div></Form></Modal></Card>;
}

function AbrirContagem({ armazens, onDone }: { armazens: any[]; onDone: (id: string) => void }) {
  const cats = useGet<any[]>('/products/categories');
  const abrir = useAction(async (f: Record<string, any>) => { const c = await post<any>('/stock/counts', { warehouseId: f.warehouseId || undefined, categoryId: f.categoryId || undefined, notes: f.notes }); onDone(c.id); });
  return <><div className="muted" style={{ marginBottom: 8 }}>A contagem tira um retrato do saldo agora; ao aplicar, só a diferença vira ajuste (reserva pendente é respeitada).</div><ErrorBox error={abrir.error} />
    <Form onSubmit={(f) => void abrir.run(f)} busy={abrir.busy} submitLabel="Abrir">
      <Field label="Armazém"><select className="input" name="warehouseId" defaultValue="">{<option value="">Padrão</option>}{armazens.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
      <Field label="Só uma categoria (opcional)"><select className="input" name="categoryId" defaultValue=""><option value="">Todas</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Observação"><input className="input" name="notes" /></Field></Form></>;
}

/** A contagem em si: bipa/digita o código e a quantidade (repetir SOMA: duas prateleiras), vê a
 *  divergência item a item e aplica (ou cancela). */
function Contagem({ id, voltar }: { id: string; voltar: () => void }) {
  const { can } = useSession();
  const c = useGet<any>(`/stock/counts/${id}`); const [codigo, setCodigo] = useState(''); const [qtd, setQtd] = useState('1'); const [zerar, setZerar] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const lancar = useAction(async () => { const code = codigo.trim(); if (!code) return; await post(`/stock/counts/${id}/items`, { lancamentos: [{ code, quantity: Number(qtd), somar: true }] }); setCodigo(''); setQtd('1'); await c.reload(); });
  const corrigir = useAction(async (itemId: string, quantity: number) => { await post(`/stock/counts/${id}/items`, { lancamentos: [{ itemId, quantity, somar: false }] }); await c.reload(); });
  const aplicar = useAction(async () => { const r = await post<any>(`/stock/counts/${id}/apply`, { tratarNaoContadosComoZero: zerar }); setMsg(`Contagem aplicada${r?.ajustes !== undefined ? `: ${r.ajustes} ajuste(s)` : ''}.`); await c.reload(); });
  const cancelar = useAction(async () => { await post(`/stock/counts/${id}/cancel`); await c.reload(); });
  if (!c.data) return <Card><ErrorBox error={c.error} />{!c.error && 'Carregando…'}</Card>;
  const aberta = c.data.status === 'OPEN' && can('core.stock:move');
  return <div className="grid">
    <div className="row between"><div><button className="btn" onClick={voltar}>← Inventário</button><h1 style={{ margin: '8px 0 0' }}>Contagem · {c.data.warehouse.code}</h1><div className="muted">Aberta em {dt(c.data.openedAt)} · {c.data.resumo.contados} de {c.data.resumo.total} contados · {c.data.resumo.divergentes} com diferença</div></div><Badge s={c.data.status} /></div>
    {aberta && <Card><div className="row"><input className="input" placeholder="Bipe ou digite o SKU/código" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void lancar.run()} autoFocus />
      <input className="input" type="number" min={0} step="0.001" value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ width: 110 }} aria-label="Quantidade contada" /><button className="btn primary" onClick={() => void lancar.run()}>Somar</button></div>
      <ErrorBox error={lancar.error ?? corrigir.error} /></Card>}
    <Card><Table<any> rows={c.data.items} cols={[{ h: 'SKU', c: (i) => i.variant.sku }, { h: 'Produto', c: (i) => [i.variant.product.name, i.variant.name].filter(Boolean).join(' · ') }, { h: 'Sistema', c: (i) => num(i.snapshotQty), right: true },
      { h: 'Contado', c: (i) => aberta ? <input className="input" type="number" min={0} step="0.001" defaultValue={i.countedQty ?? ''} placeholder="—" style={{ width: 90 }} aria-label={`Contado ${i.variant.sku}`} onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== Number(i.countedQty) && void corrigir.run(i.id, Number(e.target.value))} /> : (i.countedQty === null ? '—' : num(i.countedQty)), right: true },
      { h: 'Diferença', c: (i) => i.divergencia === null ? '—' : <span style={{ color: Number(i.divergencia) === 0 ? undefined : 'var(--danger)', fontWeight: 700 }}>{Number(i.divergencia) > 0 ? '+' : ''}{num(i.divergencia)}</span>, right: true }]} /></Card>
    {aberta && <Card><label className="row"><input type="checkbox" checked={zerar} onChange={(e) => setZerar(e.target.checked)} /> Item não contado = zero (senão fica como está)</label>
      <ErrorBox error={aplicar.error ?? cancelar.error} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn danger" onClick={() => void cancelar.run()}>Cancelar contagem</button><button className="btn primary" onClick={() => void aplicar.run()}>Aplicar ajustes</button></div></Card>}
    <Toast msg={msg} />
  </div>;
}
