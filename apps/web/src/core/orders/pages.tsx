import { useState } from 'react';
import { CobrarPix } from '@/core/payments/CobrarPix';
import { useNavigate, useParams } from 'react-router-dom';
import { baixarArquivo, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Paginador, Table } from '@/components/ui';
import { dt, st } from '@/lib/format';
import { useSession } from '@/lib/session';

const STATUS = ['', 'OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'];
export function Orders() {
  const nav = useNavigate(); const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const { data } = useGet<{ rows: any[]; page: number; pageSize: number; total: number }>('/orders', { status, q, page, pageSize: 50 });
  // CSV pelo cliente da API (Bearer): o link direto para /api ia sem token e voltava 401.
  const csv = useAction(() => baixarArquivo('/orders', { format: 'csv', status: status || undefined, q: q || undefined, pageSize: 200 }, 'pedidos.csv'));
  return <div>
    <div className="row between"><h1>Pedidos</h1><div className="row"><input className="input" placeholder="nº ou cliente" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: 200 }} />
      <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 180 }}>{STATUS.map((s) => <option key={s} value={s}>{s ? st(s) : 'Todos os status'}</option>)}</select>
      <button className="btn" onClick={() => void csv.run()} disabled={csv.busy}>CSV</button></div></div>
    <ErrorBox error={csv.error} />
    <Table rows={data?.rows} onRow={(r) => nav(`/pedidos/${r.id}`)} cols={[
      { h: '#', c: (r) => <span className="mono">{r.number}</span> }, { h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Cliente', c: (r) => r.customer?.name ?? '—' },
      { h: 'Módulo', c: (r) => r.moduleKey ?? 'Core' }, { h: 'Canal', c: (r) => r.channel }, { h: 'Itens', c: (r) => r._count.items, right: true }, { h: 'Total', c: (r) => <Money v={r.total} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
    ]} />
    {data && <Paginador page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
  </div>;
}

export function OrderDetail() {
  const { id } = useParams(); const { can } = useSession();
  const { data: o, reload } = useGet<any>(`/orders/${id}`);
  const [pay, setPay] = useState(false); const [cancel, setCancel] = useState(false);
  const pagar = useAction(async (v: Record<string, any>) => { await post(`/orders/${id}/payments`, { payments: [{ method: v.method, amount: v.amount }] }); setPay(false); await reload(); });
  const cancelar = useAction(async (v: Record<string, any>) => { await post(`/orders/${id}/cancel`, { reason: v.reason }); setCancel(false); await reload(); });
  const transitar = useAction(async (to: string) => { await post(`/orders/${id}/transition`, { to }); await reload(); });
  if (!o) return <div className="muted">Carregando…</div>;
  const pago = o.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const falta = Number(o.total) - pago;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Pedido #{o.number} <Badge s={o.status} /></h1><div className="row">
      {falta > 0.009 && o.status !== 'CANCELLED' && can('core.orders:create') && <button className="btn primary" onClick={() => setPay(true)}>Receber {falta.toFixed(2)}</button>}
      {o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && <CobrarPix orderId={o.id} falta={falta} onPago={reload} />}
      {['OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY'].includes(o.status) && can('core.orders:create') && !o.serviceOrder && <button className="btn" onClick={() => void transitar.run('COMPLETED')}>Concluir</button>}
      {o.status !== 'CANCELLED' && can('core.orders:cancel') && <button className="btn danger" onClick={() => setCancel(true)}>Cancelar</button>}
      {o.serviceOrder && <a className="btn" href={`/servicos/os/${o.serviceOrder.id}`}>Abrir OS</a>}</div></div>
    <ErrorBox error={transitar.error} />
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <Card title="Itens"><Table rows={o.items} cols={[{ h: 'Descrição', c: (i: any) => i.description }, { h: 'Qtd', c: (i: any) => i.quantity, right: true }, { h: 'Unit.', c: (i: any) => <Money v={i.unitPrice} />, right: true }, { h: 'Total', c: (i: any) => <Money v={i.total} />, right: true }]} />
        <div className="row between" style={{ marginTop: 12 }}><span className="muted">Subtotal {o.subtotal} · desconto {o.discount} · acréscimo {o.surcharge}</span><strong>Total <Money v={o.total} /></strong></div></Card>
      <div className="grid">
        <Card title="Cliente">{o.customer ? <div>{o.customer.name}<div className="muted">{o.customer.phone}</div></div> : <div className="muted">Sem cliente</div>}<div className="muted" style={{ marginTop: 8 }}>{o.moduleKey ?? 'Core'} · {o.channel} · {dt(o.createdAt)}</div></Card>
        <Card title="Pagamentos">{o.payments.length ? o.payments.map((p: any) => <div key={p.id} className="row between"><span>{p.method}</span><Money v={p.amount} /></div>) : <div className="muted">Nenhum</div>}<div className="row between" style={{ marginTop: 8 }}><span>Falta</span><strong><Money v={falta} /></strong></div></Card>
        {o.foodOrder && <Card title="Food">Tipo {o.foodOrder.serviceType} · cozinha <Badge s={o.foodOrder.kitchenStatus} />{o.foodOrder.table && <div>Mesa {o.foodOrder.table.number}</div>}{o.foodOrder.delivery && <div>Entrega <Badge s={o.foodOrder.delivery.status} /></div>}</Card>}
      </div>
    </div>
    <Modal title="Receber" open={pay} onClose={() => setPay(false)}><ErrorBox error={pagar.error} /><Form onSubmit={(v) => void pagar.run(v)} busy={pagar.busy} submitLabel="Receber">
      <Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT', 'VOUCHER', 'TRANSFER', 'STORE_CREDIT'].map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Valor"><input className="input" name="amount" type="number" step="0.01" defaultValue={falta.toFixed(2)} required /></Field></Form></Modal>
    <Modal title="Cancelar pedido" open={cancel} onClose={() => setCancel(false)}><ErrorBox error={cancelar.error} /><Form onSubmit={(v) => void cancelar.run(v)} busy={cancelar.busy} submitLabel="Cancelar pedido">
      <Field label="Motivo"><input className="input" name="reason" minLength={3} required /></Field></Form></Modal>
  </div>;
}
