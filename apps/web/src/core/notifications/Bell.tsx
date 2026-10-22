import { useCallback, useState } from 'react';
import { get, post } from '@/lib/api';
import { useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { dt } from '@/lib/format';
import { Icon } from '@/components/icons';

export function Bell() {
  const [open, setOpen] = useState(false);
  const count = useGet<{ count: number }>('/notifications/unread-count');
  const list = useGet<any[]>(open ? '/notifications' : null, { unread: '1' });
  useSocketEvent('notification', useCallback(() => { void count.reload(); if (open) void list.reload(); }, [count, list, open]));
  const lerTudo = async () => { await post('/notifications/read', { ids: 'all' }); await count.reload(); await list.reload(); };
  return <div className="bell">
    <button className="btn icon" onClick={() => setOpen((o) => !o)} aria-label="Avisos"><Icon name="bell" />{(count.data?.count ?? 0) > 0 && <span className="dot">{count.data!.count}</span>}</button>
    {open && <div className="card panel">
      <div className="row between" style={{ marginBottom: 8 }}><strong>Avisos</strong><button className="btn" onClick={() => void lerTudo()}>Marcar lidos</button></div>
      {!list.data?.length ? <div className="muted">Nenhum aviso novo.</div> : list.data.map((n) => <div key={n.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
        <div><strong>{n.title}</strong></div>{n.body && <div className="muted">{n.body}</div>}<div className="muted" style={{ fontSize: 11 }}>{dt(n.createdAt)}</div></div>)}
      <button className="btn" style={{ marginTop: 8 }} onClick={() => void get('/notifications').then((r) => list.setData(r))}>Ver todos</button>
    </div>}
  </div>;
}
