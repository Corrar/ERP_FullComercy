// Painel da recepção: o mapa dos quartos (livre, ocupado, limpeza, manutenção), quem chega e quem
// sai hoje. Check-in abre a conta (POST /orders com a reserva); check-out só com a conta paga.
import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Modal, Table, Toast } from '@/components/ui';
import { ContaAberta } from '@/components/ContaAberta';
import { brl, d } from '@/lib/format';

export const STATUS_QUARTO: Record<string, { label: string; cor: string }> = {
  AVAILABLE: { label: 'Livre', cor: 'var(--ok, #16a34a)' }, OCCUPIED: { label: 'Ocupado', cor: 'var(--accent)' },
  CLEANING: { label: 'Limpeza', cor: 'var(--warn, #d97706)' }, MAINTENANCE: { label: 'Manutenção', cor: 'var(--danger, #dc2626)' },
};

export function checkIn(r: { id: string; customerId?: string; customer?: { id: string } }) {
  return post<any>('/orders', { channel: 'LODGING', customerId: r.customerId ?? r.customer?.id, items: [], moduleData: { reservationId: r.id } });
}

export function Painel() {
  const { can } = useSession(); const gov = can('hot.governanca:operate');
  const p = useGet<any>('/m/hotel/painel'); const [conta, setConta] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const entrar = useAction(async (r: any) => { const o = await checkIn(r); setMsg(`Check-in feito: conta #${o.number} com ${brl(o.total)} de diárias.`); await p.reload(); setConta(o.id); });
  const sair = useAction(async (reservaId: string) => { await post(`/m/hotel/reservas/${reservaId}/checkout`); setMsg('Check-out feito. Quarto foi para a limpeza.'); setConta(null); await p.reload(); });
  const status = useAction(async (id: string, s: string) => { await post(`/m/hotel/quartos/${id}/status`, { status: s }); await p.reload(); });
  const ocupadoPorConta = (orderId: string) => p.data?.quartos.find((q: any) => q.orderId === orderId);
  return <div className="grid">
    <h1>Recepção</h1><ErrorBox error={p.error ?? entrar.error ?? sair.error ?? status.error} />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))' }}>
      {p.data?.quartos.map((q: any) => <div key={q.id} className="card" style={{ padding: 12, borderTop: `4px solid ${STATUS_QUARTO[q.status]?.cor}` }}>
        <div className="row between"><strong>{q.number}</strong><span className="muted">{q.type}</span></div>
        <div style={{ color: STATUS_QUARTO[q.status]?.cor, fontWeight: 700 }}>{STATUS_QUARTO[q.status]?.label}</div>
        {q.hospede && <div>{q.hospede}<div className="muted">sai {d(q.saida)}</div></div>}
        <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {q.orderId && <button className="btn" onClick={() => setConta(q.orderId)}>Conta</button>}
          {gov && q.status === 'CLEANING' && <button className="btn" onClick={() => void status.run(q.id, 'AVAILABLE')}>Limpo</button>}
          {gov && q.status === 'AVAILABLE' && <button className="btn" onClick={() => void status.run(q.id, 'MAINTENANCE')}>Manutenção</button>}
          {gov && q.status === 'MAINTENANCE' && <button className="btn" onClick={() => void status.run(q.id, 'AVAILABLE')}>Liberar</button>}
        </div></div>)}
    </div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
      <Card title="Chegam hoje"><Table<any> rows={p.data?.chegam} empty="Ninguém." cols={[{ h: 'Hóspede', c: (r) => <>{r.customer.name}<div className="muted">{r.customer.phone}</div></> }, { h: 'Quarto', c: (r) => r.room.number }, { h: '', c: (r) => <button className="btn primary" onClick={() => void entrar.run(r)}>Check-in</button> }]} /></Card>
      <Card title="Saem hoje"><Table<any> rows={p.data?.saem} empty="Ninguém." cols={[{ h: 'Hóspede', c: (r) => r.customer.name }, { h: 'Quarto', c: (r) => r.room.number }, { h: '', c: (r) => <button className="btn" onClick={() => setConta(r.orderId)}>Conta e saída</button> }]} /></Card>
    </div>
    <Modal title="Conta do hóspede" open={!!conta} onClose={() => { setConta(null); void p.reload(); }}>{conta && <>
      <ContaAberta orderId={conta} titulo="Conta" />
      {ocupadoPorConta(conta) && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn primary" onClick={() => void sair.run(ocupadoPorConta(conta).reservaId)}>Fazer check-out</button></div>}
      <ErrorBox error={sair.error} /></>}</Modal>
    <Toast msg={msg} />
  </div>;
}
