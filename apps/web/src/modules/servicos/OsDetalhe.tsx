import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { post, del, patch, put } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { dt, st } from '@/lib/format';

const PROX: Record<string, string[]> = { RECEIVED: ['DIAGNOSING'], DIAGNOSING: [], AWAITING_APPROVAL: [], APPROVED: ['IN_SERVICE', 'AWAITING_PARTS'], AWAITING_PARTS: ['IN_SERVICE'], IN_SERVICE: ['QUALITY_CHECK', 'READY', 'AWAITING_PARTS'], QUALITY_CHECK: ['READY', 'IN_SERVICE'], READY: ['DELIVERED'] };

export function OsDetalhe() {
  const { id } = useParams(); const os = useGet<any>(`/m/servicos/os/${id}`); const produtos = useGet<any[]>('/products'); const catalogo = useGet<any[]>('/m/servicos/catalogo');
  const [item, setItem] = useState(false); const [orc, setOrc] = useState(false); const [pag, setPag] = useState(false);
  const mover = useAction(async (to: string) => { await post(`/m/servicos/os/${id}/mover`, { to }); await os.reload(); });
  const addItem = useAction(async (v: Record<string, any>) => { const svc = catalogo.data?.find((c) => c.id === v.servicoId); await post(`/orders/${os.data.orderId}/items`, { items: svc ? [{ kind: 'SERVICE', description: svc.name, quantity: v.quantity, unitPrice: Number(svc.defaultPrice) }] : [{ variantId: v.variantId, quantity: v.quantity }] }); setItem(false); await os.reload(); });
  const remover = useAction(async (itemId: string) => { await del(`/orders/${os.data.orderId}/items/${itemId}`, { reason: 'Removido no orçamento' }); await os.reload(); });
  const orcamento = useAction(async (v: Record<string, any>) => { await post(`/m/servicos/os/${id}/orcamento`, v); setOrc(false); await os.reload(); });
  const aprovar = useAction(async () => { await post(`/m/servicos/os/${id}/aprovar`, { aprovadoPor: os.data.order.customer?.name ?? 'cliente', canal: 'balcão' }); await os.reload(); });
  const pagar = useAction(async (v: Record<string, any>) => { await post(`/orders/${os.data.orderId}/payments`, { payments: [{ method: v.method, amount: v.amount }] }); setPag(false); await os.reload(); });
  const checklist = useAction(async (phase: 'IN' | 'OUT') => { await post(`/m/servicos/os/${id}/checklist`, { phase }); await os.reload(); });
  const marcar = useAction(async (c: any) => { await patch(`/m/servicos/os/${id}/checklist/${c.id}`, { checked: !c.checked }); await os.reload(); });
  const { can } = useSession(); const usuarios = useGet<any[]>(can('core.users:view') ? '/users' : null);
  const tecnico = useAction(async (uid: string) => { await put(`/m/servicos/os/${id}/tecnico`, { technicianUserId: uid || null }); await os.reload(); });
  const [anexo, setAnexo] = useState(false);
  const anexar = useAction(async (v: Record<string, any>) => { await post(`/m/servicos/os/${id}/anexos`, { kind: v.kind, url: v.url, caption: v.caption }); setAnexo(false); await os.reload(); });
  if (!os.data) return <div className="muted">Carregando…</div>;
  const o = os.data; const pago = o.order.payments.reduce((s: number, p: any) => s + Number(p.amount), 0); const falta = Number(o.order.total) - pago;
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>OS #{o.order.number} · {o.vehicle?.plate ?? 'sem placa'} <Badge s={o.maintenanceStatus} /></h1>
      <div className="row">{o.maintenanceStatus === 'DIAGNOSING' && <button className="btn primary" onClick={() => setOrc(true)}>Enviar orçamento</button>}{o.maintenanceStatus === 'AWAITING_APPROVAL' && <button className="btn primary" onClick={() => void aprovar.run()}>Cliente aprovou</button>}
        {(PROX[o.maintenanceStatus] ?? []).map((to) => <button key={to} className="btn" onClick={() => void mover.run(to)}>{st(to)}</button>)}{falta > 0.009 && <button className="btn" onClick={() => setPag(true)}>Receber {falta.toFixed(2)}</button>}</div></div>
    <ErrorBox error={mover.error ?? aprovar.error ?? remover.error} />
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="grid">
        <Card title="Peças e serviços (orçamento)" actions={['RECEIVED', 'DIAGNOSING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_SERVICE'].includes(o.maintenanceStatus) && <button className="btn" onClick={() => setItem(true)}>Adicionar</button>}>
          <Table rows={o.order.items} cols={[{ h: 'Descrição', c: (i: any) => i.description }, { h: 'Tipo', c: (i: any) => i.kind }, { h: 'Qtd', c: (i: any) => i.quantity, right: true }, { h: 'Total', c: (i: any) => <Money v={i.total} />, right: true }, { h: '', c: (i: any) => ['DIAGNOSING', 'AWAITING_APPROVAL'].includes(o.maintenanceStatus) ? <button className="btn" onClick={() => void remover.run(i.id)}>✕</button> : null }]} />
          <div className="row between" style={{ marginTop: 8 }}><span className="muted">Pago {pago.toFixed(2)}</span><strong>Total <Money v={o.order.total} /></strong></div></Card>
        <Card title="Checklist" actions={<div className="row">{!o.checklist.some((c: any) => c.phase === 'IN') && <button className="btn" onClick={() => void checklist.run('IN')}>Gerar entrada</button>}{!o.checklist.some((c: any) => c.phase === 'OUT') && ['READY', 'QUALITY_CHECK', 'IN_SERVICE'].includes(o.maintenanceStatus) && <button className="btn" onClick={() => void checklist.run('OUT')}>Gerar saída</button>}</div>}>
          <ErrorBox error={marcar.error ?? checklist.error} />
          {o.checklist.length ? o.checklist.map((c: any) => <label key={c.id} className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={c.checked} onChange={() => void marcar.run(c)} /> <span className="muted">{c.phase === 'IN' ? 'Entrada' : 'Saída'}</span> {c.label}</label>) : <div className="muted">Sem checklist.</div>}</Card>
        <Card title="Anexos" actions={<button className="btn" onClick={() => setAnexo(true)}>Anexar</button>}>{o.attachments?.length ? o.attachments.map((a: any) => <div key={a.id}><a href={a.url} target="_blank" rel="noreferrer">{a.caption || a.url}</a> <span className="muted">· {a.kind} · {dt(a.createdAt)}</span></div>) : <div className="muted">Sem anexos (fotos da chegada, laudo, assinatura).</div>}</Card>
        <Card title="Histórico">{o.events.map((e: any) => <div key={e.id} className="row between" style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}><span>{st(e.toStatus)}{e.note && <span className="muted"> · {e.note}</span>}</span><span className="muted">{e.user?.name ?? 'sistema'} · {dt(e.createdAt)}</span></div>)}</Card>
      </div>
      <div className="grid">
        <Card title="Veículo e cliente">{o.vehicle ? <div><strong>{o.vehicle.plate}</strong> · {o.vehicle.brand} {o.vehicle.model} {o.vehicle.year}<div className="muted">km {o.mileageIn ?? '—'} · combustível {o.fuelLevel ?? '—'}</div></div> : <div className="muted">Sem veículo</div>}<div style={{ marginTop: 8 }}>{o.order.customer?.name}<div className="muted">{o.order.customer?.phone}</div></div></Card>
        <Card title="Relato e laudo"><div><strong>Relato:</strong> {o.complaint ?? '—'}</div><div style={{ marginTop: 6 }}><strong>Laudo:</strong> {o.diagnosis ?? '—'}</div><div style={{ marginTop: 8 }}>{usuarios.data ? <Field label="Técnico"><select className="input" value={o.technician?.id ?? ''} onChange={(e) => void tecnico.run(e.target.value)}><option value="">— sem técnico —</option>{usuarios.data.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field> : o.technician && <div className="muted">Técnico: {o.technician.name}</div>}<ErrorBox error={tecnico.error} /></div></Card>
      </div>
    </div>
    <Modal title="Anexar" open={anexo} onClose={() => setAnexo(false)}><ErrorBox error={anexar.error} /><Form onSubmit={(v) => void anexar.run(v)} busy={anexar.busy}>
      <Field label="Tipo"><select className="input" name="kind" defaultValue="PHOTO"><option value="PHOTO">Foto</option><option value="DOCUMENT">Documento</option><option value="SIGNATURE">Assinatura</option></select></Field>
      <Field label="Link (https)"><input className="input" name="url" type="url" required placeholder="https://…" /></Field><Field label="Legenda"><input className="input" name="caption" maxLength={160} /></Field></Form></Modal>
    <Modal title="Adicionar ao orçamento" open={item} onClose={() => setItem(false)}><ErrorBox error={addItem.error} /><Form onSubmit={(v) => void addItem.run(v)} busy={addItem.busy} submitLabel="Adicionar">
      <Field label="Serviço (catálogo)"><select className="input" name="servicoId"><option value="">— peça abaixo —</option>{catalogo.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.defaultPrice}</option>)}</select></Field>
      <Field label="Peça (variante)"><select className="input" name="variantId"><option value="">—</option>{produtos.data?.flatMap((p) => p.variants.map((v: any) => <option key={v.id} value={v.id}>{p.name}{v.name ? ` · ${v.name}` : ''} ({v.sku})</option>))}</select></Field>
      <Field label="Quantidade"><input className="input" name="quantity" type="number" step="0.001" defaultValue={1} required /></Field></Form></Modal>
    <Modal title="Enviar orçamento" open={orc} onClose={() => setOrc(false)}><ErrorBox error={orcamento.error} /><Form onSubmit={(v) => void orcamento.run(v)} busy={orcamento.busy} submitLabel="Enviar"><Field label="Laudo / diagnóstico"><textarea className="input" name="diagnosis" rows={4} required /></Field></Form></Modal>
    <Modal title="Receber" open={pag} onClose={() => setPag(false)}><ErrorBox error={pagar.error} /><Form onSubmit={(v) => void pagar.run(v)} busy={pagar.busy} submitLabel="Receber"><Field label="Meio"><select className="input" name="method" defaultValue="PIX">{['PIX', 'CASH', 'DEBIT', 'CREDIT'].map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" defaultValue={falta.toFixed(2)} required /></Field></Form></Modal>
  </div>;
}
