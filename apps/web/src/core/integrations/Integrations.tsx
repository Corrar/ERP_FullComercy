import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Switch, Table, Tabs } from '@/components/ui';
import { dt } from '@/lib/format';

export function Integrations() {
  const [tab, setTab] = useState('webhooks'); const [novo, setNovo] = useState(false); const [segredo, setSegredo] = useState<string | null>(null);
  const hooks = useGet<{ tipos: string[]; webhooks: any[] }>('/webhooks');
  const eventos = useGet<any[]>(tab === 'eventos' ? '/webhooks/events/list' : null);
  const intents = useGet<any[]>(tab === 'pagamentos' ? '/payments/intents' : null);
  const criar = useAction(async (v: Record<string, any>) => { const r = await post('/webhooks', { url: v.url, events: Object.keys(v).filter((k) => k.includes('.') || k === '*').filter((k) => v[k]) }); setNovo(false); setSegredo(r.secret); await hooks.reload(); });
  const despachar = useAction(async () => { await post('/webhooks/events/dispatch'); await eventos.reload(); });
  const [entregas, setEntregas] = useState<any | null>(null);
  const ativo = useAction(async (w: any) => { await patch(`/webhooks/${w.id}`, { isActive: !w.isActive }); await hooks.reload(); });
  const reenviar = useAction(async (id: string) => { await post(`/webhooks/events/${id}/retry`); await eventos.reload(); });
  const provedores = useGet<any[]>(tab === 'pagamentos' ? '/payments/providers' : null);
  const confirmar = useAction(async (id: string) => { await post(`/payments/intents/${id}/confirm`); await intents.reload(); });
  const cancelarIntent = useAction(async (id: string) => { await post(`/payments/intents/${id}/cancel`); await intents.reload(); });
  return <div className="grid">
    <h1>Integrações</h1>
    <Tabs tabs={[{ k: 'webhooks', label: 'Webhooks' }, { k: 'eventos', label: 'Eventos' }, { k: 'pagamentos', label: 'Pagamentos online' }]} active={tab} onChange={setTab} />
    {tab === 'webhooks' && <Card title="Webhooks" actions={<button className="btn primary" onClick={() => setNovo(true)}>Novo webhook</button>}>
      {segredo && <div className="card" style={{ marginBottom: 12, borderColor: 'var(--ok)' }}>Segredo do HMAC (aparece UMA vez): <code>{segredo}</code></div>}
      <ErrorBox error={ativo.error} /><Table rows={hooks.data?.webhooks} empty="Nenhum webhook." cols={[{ h: 'URL', c: (r) => r.url }, { h: 'Eventos', c: (r) => r.events.join(', ') }, { h: 'Entregas', c: (r) => <button className="btn" onClick={() => setEntregas(r)}>{r._count.deliveries}</button>, right: true }, { h: 'Ativo', c: (r) => <Switch on={r.isActive} label={`Webhook ${r.url} ativo`} onChange={() => void ativo.run(r)} /> }]} /></Card>}
    {tab === 'eventos' && <Card title="Eventos" actions={<button className="btn" onClick={() => void despachar.run()}>Despachar agora</button>}><ErrorBox error={despachar.error} />
      <ErrorBox error={reenviar.error} /><Table rows={eventos.data} cols={[{ h: 'Quando', c: (r) => dt(r.occurredAt) }, { h: 'Tipo', c: (r) => r.eventType }, { h: 'Tentativas', c: (r) => r.attempts, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }, { h: 'Erro', c: (r) => r.lastError ?? '' }, { h: '', c: (r) => r.status !== 'SENT' && <button className="btn" onClick={() => void reenviar.run(r.id)}>Reenviar</button> }]} /></Card>}
    {tab === 'pagamentos' && <Card title="Intenções de pagamento">{provedores.data && <div className="muted" style={{ marginBottom: 8 }}>Provedores disponíveis: {provedores.data.map((p: any) => p.name ?? p.key ?? String(p)).join(', ')}</div>}<ErrorBox error={confirmar.error ?? cancelarIntent.error} /><Table rows={intents.data} empty="Nenhuma intenção." cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Provedor', c: (r) => r.provider }, { h: 'Meio', c: (r) => r.method }, { h: 'Valor', c: (r) => <Money v={r.amount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }, { h: '', c: (r) => r.status === 'PENDING' && <div className="row">{r.provider === 'manual' && <button className="btn primary" onClick={() => void confirmar.run(r.id)}>Confirmar recebimento</button>}<button className="btn danger" onClick={() => void cancelarIntent.run(r.id)}>Cancelar</button></div> }]} /></Card>}
    <Modal title="Novo webhook" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="URL (https)"><input className="input" name="url" type="url" required /></Field>
      {hooks.data?.tipos.map((t) => <label key={t} className="row"><input type="checkbox" name={t} /> {t}</label>)}</Form></Modal>
    <Modal title={`Entregas · ${entregas?.url ?? ''}`} open={!!entregas} onClose={() => setEntregas(null)} wide>{entregas && <Entregas id={entregas.id} />}</Modal>
  </div>;
}

function Entregas({ id }: { id: string }) {
  const r = useGet<any[]>(`/webhooks/${id}/deliveries`);
  return <><ErrorBox error={r.error} /><Table rows={r.data} empty="Nenhuma entrega." cols={[{ h: 'Quando', c: (x) => dt(x.createdAt) }, { h: 'Evento', c: (x) => x.event?.eventType }, { h: 'HTTP', c: (x) => x.responseStatus ?? '—', right: true }, { h: 'Tentativas', c: (x) => x.attempts, right: true }, { h: 'Status', c: (x) => <Badge s={x.status} /> }, { h: 'Erro', c: (x) => x.lastError ?? '' }]} /></>;
}
