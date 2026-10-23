import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useState } from 'react';
import { Card, ErrorBox, Field, Form } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';

export function NovaOS() {
  const nav = useNavigate(); const [cli, setCli] = useState<ClienteMin | null>(null); const catalogo = useGet<any[]>('/m/servicos/catalogo');
  const abrir = useAction(async (v: Record<string, any>) => {
    if (!cli) throw new Error('Escolha ou cadastre o cliente.');
    const servico = catalogo.data?.find((c) => c.id === v.servicoId);
    const o = await post('/orders', { customerId: cli.id, channel: 'WORKSHOP', items: servico ? [{ kind: 'SERVICE', description: servico.name, quantity: 1, unitPrice: Number(servico.defaultPrice) }] : [{ kind: 'SERVICE', description: 'Diagnóstico', quantity: 1, unitPrice: 0 }], moduleData: { plate: v.plate, mileageIn: v.mileageIn, fuelLevel: v.fuelLevel, complaint: v.complaint } });
    nav(`/servicos/os/${o.serviceOrder.id}`);
  });
  return <div className="grid" style={{ maxWidth: 640 }}>
    <h1>Abrir ordem de serviço</h1>
    <Card><ErrorBox error={abrir.error} /><Form onSubmit={(v) => void abrir.run(v)} busy={abrir.busy} submitLabel="Abrir OS">
      <EscolherCliente value={cli} onChange={setCli} />
      <div className="row"><Field label="Placa"><input className="input" name="plate" placeholder="ABC1D23" required /></Field><Field label="Km"><input className="input" name="mileageIn" type="number" /></Field><Field label="Combustível"><select className="input" name="fuelLevel">{['', '1/4', '1/2', '3/4', 'cheio'].map((f) => <option key={f} value={f}>{f || '—'}</option>)}</select></Field></div>
      <Field label="Serviço solicitado"><select className="input" name="servicoId"><option value="">Só diagnóstico</option>{catalogo.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.defaultPrice}</option>)}</select></Field>
      <Field label="Relato do cliente"><textarea className="input" name="complaint" rows={3} /></Field></Form></Card>
  </div>;
}
