import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Acesso() {
  const devs = useGet<any[]>('/m/academia/dispositivos'); const eventos = useGet<any[]>('/m/academia/acessos');
  const [novo, setNovo] = useState(false); const [token, setToken] = useState<any | null>(null); const [cred, setCred] = useState(false);
  const criar = useAction(async (v: Record<string, any>) => { setToken(await post('/m/academia/dispositivos', v)); setNovo(false); await devs.reload(); });
  const girar = useAction(async (id: string) => { setToken(await post(`/m/academia/dispositivos/${id}/girar-token`)); });
  const credencial = useAction(async (v: Record<string, any>) => { await post('/m/academia/credenciais', v); setCred(false); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Catraca e credenciais</h1><div className="row"><button className="btn" onClick={() => setCred(true)}>Nova credencial</button><button className="btn primary" onClick={() => setNovo(true)}>Novo dispositivo</button></div></div>
    <ErrorBox error={girar.error} />
    {token && <div className="card" style={{ borderColor: 'var(--ok)' }}>Configure no aparelho (aparece UMA vez): URL <code>POST {token.webhookUrl ?? `/public/academia/dispositivos/${token.id}/eventos`}</code> · token <code>{token.webhookToken}</code></div>}
    <Card title="Dispositivos"><Table rows={devs.data} empty="Nenhum dispositivo." cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Tipo', c: (r) => r.kind }, { h: 'Provedor', c: (r) => r.provider }, { h: 'Último sinal', c: (r) => dt(r.lastSeenAt) }, { h: '', c: (r) => <button className="btn" onClick={() => void girar.run(r.id)}>Girar token</button> }]} /></Card>
    <Card title="Últimos acessos"><Table rows={eventos.data} cols={[{ h: 'Quando', c: (r) => dt(r.occurredAt) }, { h: 'Dispositivo', c: (r) => r.device.name }, { h: 'Aluno', c: (r) => r.customer?.name ?? '—' }, { h: 'Resultado', c: (r) => <span className={`badge ${r.allowed ? 'ok' : 'danger'}`}>{r.allowed ? 'liberado' : r.reason}</span> }]} /></Card>
    <Modal title="Novo dispositivo" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}><Field label="Nome"><input className="input" name="name" required /></Field><Field label="Tipo"><select className="input" name="kind">{['TURNSTILE', 'DOOR', 'BIOMETRIC', 'QR_READER'].map((k) => <option key={k}>{k}</option>)}</select></Field><Field label="Provedor"><input className="input" name="provider" defaultValue="webhook" /></Field></Form></Modal>
    <Modal title="Nova credencial" open={cred} onClose={() => setCred(false)}><ErrorBox error={credencial.error} /><Form onSubmit={(v) => void credencial.run(v)} busy={credencial.busy}><Field label="ID do aluno (cliente)"><input className="input" name="customerId" required /></Field><Field label="Tipo"><select className="input" name="kind">{['CARD', 'QR', 'PIN', 'BIOMETRIC', 'FACE'].map((k) => <option key={k}>{k}</option>)}</select></Field><Field label="Valor (nº do cartão, código)"><input className="input" name="value" required /></Field></Form></Modal>
  </div>;
}
