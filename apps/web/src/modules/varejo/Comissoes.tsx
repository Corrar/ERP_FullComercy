import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Comissoes() {
  const vend = useGet<any[]>('/m/varejo/vendedores'); const com = useGet<any[]>('/m/varejo/comissoes'); const [novo, setNovo] = useState(false);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/varejo/vendedores', v); setNovo(false); await vend.reload(); });
  const aprovar = useAction(async () => { const ids = (com.data ?? []).filter((c) => c.status === 'PENDING').map((c) => c.id); if (ids.length) await post('/m/varejo/comissoes/aprovar', { ids }); await com.reload(); });
  const pagar = useAction(async (salespersonId: string) => { await post('/m/varejo/comissoes/pagar', { salespersonId, until: new Date().toISOString() }); await com.reload(); });
  return <div className="grid">
    <h1>Comissões</h1><ErrorBox error={aprovar.error ?? pagar.error} />
    <Card title="Vendedores" actions={<button className="btn primary" onClick={() => setNovo(true)}>Novo vendedor</button>}><Table rows={vend.data} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Taxa padrão', c: (r) => `${r.defaultCommissionRate}%`, right: true }, { h: '', c: (r) => <button className="btn" onClick={() => void pagar.run(r.id)}>Pagar aprovadas</button> }]} /></Card>
    <Card title="Comissões" actions={<button className="btn" onClick={() => void aprovar.run()}>Aprovar pendentes</button>}><Table rows={com.data} cols={[{ h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Vendedor', c: (r) => r.salesperson.name }, { h: 'Venda', c: (r) => `#${r.sale.order.number}` }, { h: 'Base', c: (r) => <Money v={r.baseAmount} />, right: true }, { h: 'Taxa', c: (r) => `${r.rate}%`, right: true }, { h: 'Comissão', c: (r) => <Money v={r.amount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> }]} /></Card>
    <Modal title="Novo vendedor" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}><Field label="Nome"><input className="input" name="name" required /></Field><Field label="Taxa padrão (%)"><input className="input" name="defaultCommissionRate" type="number" step="0.1" defaultValue={0} /></Field></Form></Modal>
  </div>;
}
