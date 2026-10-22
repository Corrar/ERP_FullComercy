import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Money, Table, Toast } from '@/components/ui';
import { brl, dt } from '@/lib/format';
import { useState } from 'react';

export function Comissoes() {
  const { can } = useSession();
  const com = useGet<any[]>('/m/beleza/comissoes'); const profs = useGet<any[]>('/m/beleza/profissionais'); const [msg, setMsg] = useState<string | null>(null);
  const pagar = useAction(async (p: any) => { const r = await post<any>('/m/beleza/comissoes/pagar', { professionalId: p.id }); setMsg(r.pagas ? `${r.pagas} comissões de ${p.name}: ${brl(r.total)} viraram um título a pagar.` : `Nada pendente para ${p.name}.`); await com.reload(); });
  const pendente = (id: string) => (com.data ?? []).filter((c) => c.professionalId === id && c.status === 'PENDING').reduce((s, c) => s + Number(c.amount), 0);
  return <div className="grid">
    <h1>Comissões dos profissionais</h1><ErrorBox error={pagar.error} />
    <Card title="A pagar"><Table rows={profs.data} empty="Nenhum profissional." cols={[{ h: 'Profissional', c: (p) => p.name }, { h: 'Pendente', c: (p) => <Money v={pendente(p.id)} />, right: true }, { h: '', c: (p) => can('bel.comissoes:manage') && pendente(p.id) > 0 && <button className="btn primary" onClick={() => void pagar.run(p)}>Pagar</button> }]} /></Card>
    <Card title="Lançamentos"><Table rows={com.data} empty="Nenhuma comissão ainda." cols={[{ h: 'Quando', c: (c) => dt(c.createdAt) }, { h: 'Profissional', c: (c) => c.professional.name }, { h: 'Comanda', c: (c) => `#${c.sale.order.number}` }, { h: 'Base', c: (c) => <Money v={c.baseAmount} />, right: true }, { h: 'Taxa', c: (c) => `${c.rate}%`, right: true }, { h: 'Comissão', c: (c) => <Money v={c.amount} />, right: true }, { h: 'Status', c: (c) => <Badge s={c.status} /> }]} /></Card>
    <Toast msg={msg} />
  </div>;
}
