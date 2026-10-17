import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Table, Tabs } from '@/components/ui';
import { dt } from '@/lib/format';

export function Integrations() {
  const [tab, setTab] = useState('webhooks'); const [novo, setNovo] = useState(false); const [segredo, setSegredo] = useState<string | null>(null);
  const hooks = useGet<{ tipos: string[]; webhooks: any[] }>('/webhooks');
  const eventos = useGet<any[]>(tab === 'eventos' ? '/webhooks/events/list' : null);
  const intents = useGet<any[]>(tab === 'pagamentos' ? '/payments/intents' : null);
  const criar = useAction(async (v: Record<string, any>) => { const r = await post('/webhooks', { url: v.url, events: Object.keys(v).filter((k) => k.includes('.') || k === '*').filter((k) => v[k]) }); setNovo(false); setSegredo(r.secret); await hooks.reload(); });
  const despachar = useAction(async () => { await post('/webhooks/events/dispatch'); await eventos.reload(); });
  return <div className="grid">
    <h1>Integrações</h1>
    <Tabs tabs={[{ k: 'webhooks', label: 'Webhooks' }, { k: 'eventos', label: 'Eventos' }, { k: 'pagamentos', label: 'Pagamentos online' }]} active={tab} onChange={setTab} />
    {tab === 'webhooks' && <Card title="Webhooks" actions={<button className="btn primary" onClick={() => setNovo(true)}>Novo webhook</button>}>
      {segredo && <div className="card" style={{ marginBottom: 12, borderColor: 'var(--ok)' }}>Segredo do HMAC (aparece UMA vez): <code>{segredo}</code></div>}
      <Table rows={hooks.data?.webhooks} empty="Nenhum webhook." cols={[{ h: 'URL', c: (r) => r.url }, { h: 'Eventos', c: (r) => r.events.join(', ') }, { h: 'Entregas', c: (r) => r._count.deliveries, right: true }, { h: 'Ativo', c: (r) => r.isActive ? 'sim' : 'não' }]} /></Card>}
    {tab === 'eventos' && <Card title="Eventos" actions={<button className="btn" onClick={() => void despachar.run()}>Despachar agora</button>}><ErrorBox error={despachar.error} />
      <Table rows={eventos.data} cols={[{ h: 'Quando', c: (r) => dt(r.occurredAt) }, { h: 'Tipo', c: (r) => r.eventType }, { h: 'Tentativas', c: (r) => r.attempts, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }, { h: 'Erro', c: (r) => r.lastError ?? '' }]} /></Card>}
    {tab === 'pagamentos' && <Card title="Intenções de pagamento"><Table rows={intents.data} cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Provedor', c: (r) => r.provider }, { h: 'Meio', c: (r) => r.method }, { h: 'Valor', c: (r) => r.amount, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }]} /></Card>}
    <Modal title="Novo webhook" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="URL (https)"><input className="input" name="url" type="url" required /></Field>
      {hooks.data?.tipos.map((t) => <label key={t} className="row"><input type="checkbox" name={t} /> {t}</label>)}</Form></Modal>
  </div>;
}
