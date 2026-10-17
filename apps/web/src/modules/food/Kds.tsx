// KDS: fila por estação, em tempo real.
import { useCallback, useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { Badge, ErrorBox } from '@/components/ui';
import { hhmm } from '@/lib/format';

export function Kds() {
  const [station, setStation] = useState(''); const fila = useGet<any[]>('/m/food/cozinha/fila', { station }); const est = useGet<any[]>('/m/food/cozinha/estacoes');
  useSocketEvent('kitchen.ticket', useCallback(() => { void fila.reload(); void est.reload(); }, [fila, est]));
  const mover = useAction(async (id: string, to: string) => { await post(`/m/food/cozinha/tickets/${id}/mover`, { to }); await fila.reload(); });
  return <div>
    <div className="row between"><h1>Cozinha</h1><div className="row"><button className={`btn ${!station ? 'primary' : ''}`} onClick={() => setStation('')}>Todas</button>{est.data?.map((e) => <button key={e.station} className={`btn ${station === e.station ? 'primary' : ''}`} onClick={() => setStation(e.station)}>{e.station} ({e.fila + e.preparando}){e.tempoMedioMin !== null && <span className="muted"> · {e.tempoMedioMin} min</span>}</button>)}</div></div>
    <ErrorBox error={mover.error} />
    <div className="kds">{fila.data?.map((t) => <div key={t.id} className={`card ticket ${t.status}`}>
      <div className="row between"><strong>#{t.foodOrder.order.number} {t.foodOrder.table ? `· Mesa ${t.foodOrder.table.number}` : t.foodOrder.tab ? `· ${t.foodOrder.tab.code}` : ''}</strong><span className="muted">{hhmm(t.createdAt)}</span></div>
      <div className="muted">{t.station} · <Badge s={t.status} /></div>
      <ul style={{ paddingLeft: 18, margin: '8px 0' }}>{t.items.map((i: any) => <li key={i.id}><strong>{String(i.display.qtd)}×</strong> {i.display.nome}{i.display.modifiers?.length ? <div className="muted">+ {i.display.modifiers.map((m: any) => m.name).join(', ')}</div> : null}{i.display.obs && <div className="muted">obs: {i.display.obs}</div>}</li>)}</ul>
      {t.status === 'QUEUED' && <button className="btn primary" style={{ width: '100%' }} onClick={() => void mover.run(t.id, 'PREPARING')}>Iniciar</button>}
      {t.status === 'PREPARING' && <button className="btn primary" style={{ width: '100%' }} onClick={() => void mover.run(t.id, 'READY')}>Pronto</button>}
    </div>)}{fila.data && !fila.data.length && <div className="empty">Fila vazia.</div>}</div>
  </div>;
}
