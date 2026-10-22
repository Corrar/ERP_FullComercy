// Auditoria: quem fez o quê e quando (ações de negócio e, se ligado, as requisições HTTP).
import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Modal, Table } from '@/components/ui';
import { dt } from '@/lib/format';

const iso = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Audit() {
  const [acao, setAcao] = useState(''); const [de, setDe] = useState(iso(new Date(Date.now() - 7 * 86400000))); const [ate, setAte] = useState(iso(new Date())); const [ver, setVer] = useState<any | null>(null);
  const r = useGet<any[]>('/audit', { action: acao.trim() || undefined, from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(`${ate}T23:59:59`).toISOString(), take: 500 });
  return <div className="grid"><h1>Auditoria</h1>
    <div className="row" style={{ flexWrap: 'wrap' }}><Field label="Ação começa com"><input className="input" value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="order., retail., stock.…" /></Field>
      <Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    <ErrorBox error={r.error} />
    <Card><Table rows={r.data} empty="Nada no período." onRow={setVer} cols={[{ h: 'Quando', c: (x) => dt(x.createdAt) }, { h: 'Quem', c: (x) => x.user?.name ?? 'sistema' }, { h: 'Ação', c: (x) => <span className="mono">{x.action}</span> }, { h: 'Registro', c: (x) => x.entity ? `${x.entity}${x.entityId ? ` · ${String(x.entityId).slice(0, 8)}` : ''}` : '—' }, { h: 'IP', c: (x) => x.ip ?? '—' }]} /></Card>
    <Modal title={ver?.action ?? ''} open={!!ver} onClose={() => setVer(null)} wide>{ver && <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ quando: ver.createdAt, quem: ver.user?.email ?? 'sistema', entidade: ver.entity, id: ver.entityId, detalhes: ver.details }, null, 2)}</pre>}</Modal>
  </div>;
}
