import { useCallback } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { Badge, Card, ErrorBox, Money, Table } from '@/components/ui';

export function Entregas() {
  const ent = useGet<any[]>('/m/food/entregas'); const cour = useGet<any[]>('/m/food/entregadores');
  useSocketEvent('delivery.status', useCallback(() => { void ent.reload(); }, [ent]));
  const atribuir = useAction(async (id: string, courierId: string) => { await post(`/m/food/entregas/${id}/atribuir`, { courierId }); await ent.reload(); });
  const mover = useAction(async (id: string, to: string) => { await post(`/m/food/entregas/${id}/mover`, { to }); await ent.reload(); });
  const prox: Record<string, string[]> = { ASSIGNED: ['PICKED_UP'], PICKED_UP: ['DELIVERED', 'FAILED'] };
  return <div className="grid">
    <h1>Entregas</h1><ErrorBox error={atribuir.error ?? mover.error} />
    <Card><Table rows={ent.data} empty="Nenhuma entrega em curso." cols={[
      { h: 'Pedido', c: (r) => `#${r.foodOrder.order.number}` }, { h: 'Cliente', c: (r) => <>{r.foodOrder.order.customer?.name}<div className="muted">{r.foodOrder.order.customer?.phone}</div></> }, { h: 'Endereço', c: (r) => `${r.address.street}, ${r.address.number ?? ''} ${r.address.district ?? ''}` }, { h: 'Total', c: (r) => <Money v={r.foodOrder.order.total} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: 'Entregador', c: (r) => r.status === 'PENDING' ? <select className="input" defaultValue="" onChange={(e) => e.target.value && void atribuir.run(r.id, e.target.value)}><option value="">atribuir…</option>{cour.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : r.courier?.name },
      { h: '', c: (r) => <div className="row">{(prox[r.status] ?? []).map((to) => <button key={to} className={`btn ${to === 'FAILED' ? 'danger' : 'primary'}`} onClick={() => void mover.run(r.id, to)}>{to === 'PICKED_UP' ? 'Saiu' : to === 'DELIVERED' ? 'Entregue' : 'Falhou'}</button>)}</div> }]} /></Card>
  </div>;
}
