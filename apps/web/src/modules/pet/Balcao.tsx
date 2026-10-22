// Balcão do pet shop: vendas abertas (banho cobrado, ração) e venda nova pelo primeiro produto.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Modal, Money, Table } from '@/components/ui';
import { ContaAberta } from '@/components/ContaAberta';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { dt } from '@/lib/format';

export function Balcao() {
  const [sp, setSp] = useSearchParams(); const sel = sp.get('o');
  const abertas = useGet<{ rows: any[] }>('/orders', { moduleKey: 'PET', status: 'OPEN', pageSize: 100 });
  const [nova, setNova] = useState(false);
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Balcão</h1><button className="btn primary" onClick={() => setNova(true)}>Nova venda</button></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
      <Card title="Em aberto"><Table rows={abertas.data?.rows} empty="Nenhuma venda aberta." onRow={(o) => setSp({ o: o.id })} cols={[{ h: '#', c: (o) => o.number }, { h: 'Tutor', c: (o) => o.customer?.name ?? '—' }, { h: 'Aberta', c: (o) => dt(o.createdAt) }, { h: 'Total', c: (o) => <Money v={o.total} />, right: true }]} /></Card>
      {sel ? <ContaAberta key={sel} orderId={sel} titulo="Venda" onChange={() => void abertas.reload()} /> : <Card><div className="muted">Escolha uma venda aberta ou comece uma nova.</div></Card>}
    </div>
    <Modal title="Nova venda" open={nova} onClose={() => setNova(false)}>{nova && <NovaVenda onDone={(id) => { setNova(false); setSp({ o: id }); void abertas.reload(); }} />}</Modal>
  </div>;
}

function NovaVenda({ onDone }: { onDone: (id: string) => void }) {
  const [tutor, setTutor] = useState<ClienteMin | null>(null); const [pet, setPet] = useState(''); const [codigo, setCodigo] = useState('');
  const pets = useGet<any[]>(tutor ? '/m/pet/pets' : null, { customerId: tutor?.id });
  const abrir = useAction(async () => {
    const c = codigo.trim(); if (!c) throw new Error('Bipe ou digite o primeiro produto.');
    const prods = await get<any[]>('/products', { q: c });
    const v = prods.flatMap((p) => p.variants).find((x: any) => x.sku === c || x.barcode === c) ?? prods[0]?.variants[0];
    if (!v) throw new Error(`Produto "${c}" não encontrado.`);
    const o = await post<any>('/orders', { channel: 'PETSHOP', customerId: tutor?.id ?? null, items: [{ variantId: v.id, quantity: 1 }], moduleData: { petId: pet || undefined } });
    onDone(o.id);
  });
  return <div className="grid" style={{ gap: 12 }}>
    <EscolherCliente value={tutor} onChange={(c) => { setTutor(c); setPet(''); }} rotulo="Tutor (opcional)" />
    {tutor && <Field label="Pet"><select className="input" value={pet} onChange={(e) => setPet(e.target.value)}><option value="">—</option>{pets.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    <Field label="Primeiro produto"><input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código, SKU ou nome" onKeyDown={(e) => e.key === 'Enter' && void abrir.run()} /></Field>
    <ErrorBox error={abrir.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={abrir.busy} onClick={() => void abrir.run()}>Abrir venda</button></div>
  </div>;
}
