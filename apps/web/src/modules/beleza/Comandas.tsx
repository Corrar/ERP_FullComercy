// Comandas abertas do salão: escolhe uma, lança produto, recebe. Comanda avulsa (sem horário
// marcado) nasce aqui também.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Modal, Money, Table } from '@/components/ui';
import { ContaAberta } from '@/components/ContaAberta';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { dt } from '@/lib/format';

export function Comandas() {
  const [sp, setSp] = useSearchParams(); const sel = sp.get('o');
  const abertas = useGet<{ rows: any[] }>('/orders', { moduleKey: 'BELEZA', status: 'OPEN', pageSize: 100 });
  const [avulsa, setAvulsa] = useState(false);
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Comandas</h1><button className="btn primary" onClick={() => setAvulsa(true)}>Comanda avulsa</button></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
      <Card title="Abertas"><Table rows={abertas.data?.rows} empty="Nenhuma comanda aberta." onRow={(o) => setSp({ o: o.id })} cols={[{ h: '#', c: (o) => o.number }, { h: 'Cliente', c: (o) => o.customer?.name ?? '—' }, { h: 'Aberta', c: (o) => dt(o.createdAt) }, { h: 'Total', c: (o) => <Money v={o.total} />, right: true }]} /></Card>
      {sel ? <ContaAberta key={sel} orderId={sel} titulo="Comanda" onChange={() => void abertas.reload()} /> : <Card><div className="muted">Escolha uma comanda ou abra pela agenda ("Atender").</div></Card>}
    </div>
    <Modal title="Comanda avulsa" open={avulsa} onClose={() => setAvulsa(false)}>{avulsa && <Avulsa onDone={(id) => { setAvulsa(false); setSp({ o: id }); void abertas.reload(); }} />}</Modal>
  </div>;
}

function Avulsa({ onDone }: { onDone: (orderId: string) => void }) {
  const profs = useGet<any[]>('/m/beleza/profissionais'); const servs = useGet<any[]>('/m/beleza/servicos');
  const [cli, setCli] = useState<ClienteMin | null>(null); const [prof, setProf] = useState(''); const [serv, setServ] = useState('');
  const abrir = useAction(async () => {
    const s = servs.data?.find((x) => x.id === serv);
    if (!s) throw new Error('Escolha o serviço.');
    const o = await post<any>('/orders', { channel: 'SALON', customerId: cli?.id ?? null, items: [{ kind: 'SERVICE', description: s.name, unitPrice: Number(s.price), quantity: 1, metadata: { serviceId: s.id } }], moduleData: { professionalId: prof || undefined } });
    onDone(o.id);
  });
  return <div className="grid" style={{ gap: 12 }}>
    <EscolherCliente value={cli} onChange={setCli} rotulo="Cliente (opcional)" />
    <div className="row"><Field label="Profissional"><select className="input" value={prof} onChange={(e) => setProf(e.target.value)}><option value="">—</option>{profs.data?.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Serviço"><select className="input" value={serv} onChange={(e) => setServ(e.target.value)}><option value="">Escolha…</option>{servs.data?.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
    <ErrorBox error={abrir.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={abrir.busy} onClick={() => void abrir.run()}>Abrir</button></div>
  </div>;
}
