// Pacotes de sessões: cria o pacote, vende para uma cliente (vira comanda a receber) e consulta
// o saldo dela. O uso acontece ao abrir a comanda pela agenda.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { d } from '@/lib/format';

export function Pacotes() {
  const nav = useNavigate(); const { can } = useSession(); const gerir = can('bel.pacotes:manage');
  const pacs = useGet<any[]>('/m/beleza/pacotes'); const servs = useGet<any[]>('/m/beleza/servicos');
  const [novo, setNovo] = useState(false); const [vender, setVender] = useState<any | null>(null); const [cli, setCli] = useState<ClienteMin | null>(null);
  const saldo = useGet<any[]>(cli ? `/m/beleza/pacotes/cliente/${cli.id}` : null);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/beleza/pacotes', { name: v.name, serviceId: v.serviceId, sessions: v.sessions, price: v.price, validityDays: v.validityDays }); setNovo(false); await pacs.reload(); });
  const venda = useAction(async (p: any, c: ClienteMin) => { const o = await post<any>('/orders', { channel: 'SALON', customerId: c.id, items: [{ kind: 'SERVICE', description: p.name, unitPrice: Number(p.price), quantity: 1, metadata: { packageId: p.id } }] }); nav(`/beleza/comandas?o=${o.id}`); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Pacotes</h1>{gerir && <button className="btn primary" onClick={() => setNovo(true)}>Novo pacote</button>}</div>
    <Card><Table rows={pacs.data} empty="Nenhum pacote." cols={[{ h: 'Pacote', c: (p) => p.name }, { h: 'Serviço', c: (p) => p.service.name }, { h: 'Sessões', c: (p) => p.sessions, right: true }, { h: 'Preço', c: (p) => <Money v={p.price} />, right: true }, { h: 'Validade', c: (p) => `${p.validityDays} dias`, right: true }, { h: '', c: (p) => p.isActive && <button className="btn" onClick={() => setVender(p)}>Vender</button> }]} /></Card>
    <Card title="Saldo de uma cliente"><EscolherCliente value={cli} onChange={setCli} />
      {cli && <Table rows={saldo.data} empty="Sem pacotes." cols={[{ h: 'Pacote', c: (p) => p.package.name }, { h: 'Saldo', c: (p) => `${p.saldo} de ${p.sessionsTotal}`, right: true }, { h: 'Vence', c: (p) => <>{d(p.expiresAt)}{p.vencido && <span className="muted"> (vencido)</span>}</> }]} />}</Card>
    <Modal title="Novo pacote" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required placeholder="ex.: 10 escovas" /></Field>
      <Field label="Serviço"><select className="input" name="serviceId" required>{servs.data?.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <div className="row"><Field label="Sessões"><input className="input" name="sessions" type="number" min={2} required defaultValue={10} /></Field><Field label="Preço (R$)"><input className="input" name="price" type="number" step="0.01" min={0.01} required /></Field><Field label="Validade (dias)"><input className="input" name="validityDays" type="number" min={1} defaultValue={180} /></Field></div>
    </Form></Modal>
    <Modal title={`Vender · ${vender?.name ?? ''}`} open={!!vender} onClose={() => setVender(null)}>{vender && <VenderPacote p={vender} onVender={(c) => void venda.run(vender, c)} erro={venda.error} busy={venda.busy} />}</Modal>
  </div>;
}

function VenderPacote({ p, onVender, erro, busy }: { p: any; onVender: (c: ClienteMin) => void; erro: string | null; busy: boolean }) {
  const [c, setC] = useState<ClienteMin | null>(null);
  return <div className="grid" style={{ gap: 12 }}><div>{p.sessions}× {p.service.name} por <Money v={p.price} /></div><EscolherCliente value={c} onChange={setC} /><ErrorBox error={erro} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!c || busy} onClick={() => c && onVender(c)}>Abrir comanda do pacote</button></div></div>;
}
