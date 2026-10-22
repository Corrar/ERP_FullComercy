// Auditoria: quem fez o quê e quando (ações de negócio e, se ligado, as requisições HTTP).
import { useState } from 'react';
import { useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Modal, Paginador, Table } from '@/components/ui';
import { dt } from '@/lib/format';

const iso = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function Audit() {
  const [acao, setAcao] = useState(''); const [de, setDe] = useState(iso(new Date(Date.now() - 7 * 86400000))); const [ate, setAte] = useState(iso(new Date())); const [ver, setVer] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const r = useGet<{ rows: any[]; page: number; pageSize: number; total: number }>('/audit', { action: acao.trim() || undefined, from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(`${ate}T23:59:59`).toISOString(), page, pageSize: 100 });
  return <div className="grid"><h1>Auditoria</h1>
    <div className="row" style={{ flexWrap: 'wrap' }}><Field label="Ação começa com"><input className="input" value={acao} onChange={(e) => { setAcao(e.target.value); setPage(1); }} placeholder="order., retail., stock.…" /></Field>
      <Field label="De"><input className="input" type="date" value={de} onChange={(e) => { setDe(e.target.value); setPage(1); }} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPage(1); }} /></Field></div>
    <ErrorBox error={r.error} />
    <Card><Table rows={r.data?.rows} empty="Nada no período." onRow={setVer} cols={[{ h: 'Quando', c: (x) => dt(x.createdAt) }, { h: 'Quem', c: (x) => x.user?.name ?? 'sistema' }, { h: 'Ação', c: (x) => <span className="mono">{x.action}</span> }, { h: 'Registro', c: (x) => x.entity ? `${x.entity}${x.entityId ? ` · ${String(x.entityId).slice(0, 8)}` : ''}` : '—' }, { h: 'IP', c: (x) => x.ip ?? '—' }]} />{r.data && <Paginador page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} />}</Card>
    <Modal title={ver?.action ?? ''} open={!!ver} onClose={() => setVer(null)} wide>{ver && <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ quando: ver.createdAt, quem: ver.user?.email ?? 'sistema', entidade: ver.entity, id: ver.entityId, detalhes: ver.details }, null, 2)}</pre>}</Modal>
  </div>;
}
