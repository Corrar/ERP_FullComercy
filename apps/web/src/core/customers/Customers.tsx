import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Form, Modal, Paginador, Table } from '@/components/ui';
import { useSession } from '@/lib/session';

export function Customers() {
  const { can } = useSession(); const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const nav = useNavigate();
  const [page, setPage] = useState(1);
  const { data, reload } = useGet<{ rows: any[]; page: number; pageSize: number; total: number }>('/customers', { q, page, pageSize: 50 });
  const criar = useAction(async (v: Record<string, any>) => { await post('/customers', v); setOpen(false); await reload(); });
  return <div>
    <div className="row between"><h1>Clientes</h1><div className="row"><input className="input" placeholder="nome, telefone, documento" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: 260 }} />{can('core.customers:manage') && <button className="btn primary" onClick={() => setOpen(true)}>Novo cliente</button>}</div></div>
    <Table rows={data?.rows} onRow={(r) => nav(`/clientes/${r.id}`)} cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Telefone', c: (r) => r.phone ?? '—' }, { h: 'Documento', c: (r) => r.document ?? '—' }, { h: 'E-mail', c: (r) => r.email ?? '—' }, { h: 'Tags', c: (r) => (r.tags ?? []).join(', ') }]} />
    {data && <Paginador page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    <Modal title="Novo cliente" open={open} onClose={() => setOpen(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required /></Field><Field label="Telefone"><input className="input" name="phone" /></Field>
      <Field label="CPF/CNPJ"><input className="input" name="document" /></Field><Field label="E-mail"><input className="input" name="email" type="email" /></Field></Form></Modal>
  </div>;
}
