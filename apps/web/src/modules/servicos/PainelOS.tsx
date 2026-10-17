import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { Badge, Money } from '@/components/ui';
import { st } from '@/lib/format';

const COLS = ['RECEIVED', 'DIAGNOSING', 'AWAITING_APPROVAL', 'APPROVED', 'AWAITING_PARTS', 'IN_SERVICE', 'QUALITY_CHECK', 'READY'];
export function PainelOS() {
  const nav = useNavigate(); const os = useGet<any[]>('/m/servicos/os/painel');
  useSocketEvent('os.status', useCallback(() => { void os.reload(); }, [os]));
  return <div>
    <h1>Painel da oficina</h1>
    <div className="kanban">{COLS.map((c) => <div key={c}><div className="muted" style={{ marginBottom: 6 }}>{st(c)} ({os.data?.filter((o) => o.maintenanceStatus === c).length ?? 0})</div>
      {os.data?.filter((o) => o.maintenanceStatus === c).map((o) => <div key={o.id} className="card" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => nav(`/servicos/os/${o.id}`)}>
        <strong>#{o.order.number} · {o.vehicle?.plate ?? 'sem placa'}</strong><div className="muted">{o.vehicle?.brand} {o.vehicle?.model}</div><div>{o.order.customer?.name}</div><div className="row between"><Money v={o.order.total} /><Badge s={o.maintenanceStatus} /></div>{o.technician && <div className="muted">{o.technician.name}</div>}</div>)}</div>)}</div>
  </div>;
}
