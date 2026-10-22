// Profissionais (taxa de comissão, cor na agenda) e serviços (duração ocupa a agenda; comissão
// própria vale sobre a do profissional).
import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Switch, Table } from '@/components/ui';

export function Cadastros() {
  const { can } = useSession(); const gerir = can('bel.cadastro:manage');
  const profs = useGet<any[]>('/m/beleza/profissionais'); const servs = useGet<any[]>('/m/beleza/servicos');
  const [prof, setProf] = useState<any | null>(null); const [serv, setServ] = useState<any | null>(null);
  const salvarProf = useAction(async (v: Record<string, any>) => { const body = { name: v.name, commissionRate: v.commissionRate ?? 0, color: v.color || undefined }; if (prof?.id) await patch(`/m/beleza/profissionais/${prof.id}`, body); else await post('/m/beleza/profissionais', body); setProf(null); await profs.reload(); });
  const salvarServ = useAction(async (v: Record<string, any>) => { const body = { name: v.name, durationMin: v.durationMin, price: v.price, commissionRate: v.commissionRate ?? null }; if (serv?.id) await patch(`/m/beleza/servicos/${serv.id}`, body); else await post('/m/beleza/servicos', body); setServ(null); await servs.reload(); });
  const ativo = useAction(async (tipo: 'profissionais' | 'servicos', r: any) => { await patch(`/m/beleza/${tipo}/${r.id}`, { isActive: !r.isActive }); await (tipo === 'profissionais' ? profs : servs).reload(); });
  return <div className="grid">
    <h1>Cadastros do salão</h1><ErrorBox error={ativo.error} />
    <Card title="Profissionais" actions={gerir && <button className="btn primary" onClick={() => setProf({})}>Novo profissional</button>}>
      <Table rows={profs.data} empty="Nenhum profissional." cols={[
        { h: 'Nome', c: (r) => <span className="row"><span style={{ width: 12, height: 12, borderRadius: 99, background: r.color ?? 'var(--accent)' }} />{r.name}</span> },
        { h: 'Comissão', c: (r) => `${r.commissionRate}%`, right: true },
        { h: 'Ativo', c: (r) => <Switch on={r.isActive} disabled={!gerir} label={`${r.name} ativo`} onChange={() => void ativo.run('profissionais', r)} /> },
        { h: '', c: (r) => gerir && <button className="btn" onClick={() => setProf(r)}>Editar</button> }]} /></Card>
    <Card title="Serviços" actions={gerir && <button className="btn primary" onClick={() => setServ({})}>Novo serviço</button>}>
      <Table rows={servs.data} empty="Nenhum serviço." cols={[
        { h: 'Serviço', c: (r) => r.name }, { h: 'Duração', c: (r) => `${r.durationMin} min`, right: true }, { h: 'Preço', c: (r) => <Money v={r.price} />, right: true },
        { h: 'Comissão própria', c: (r) => r.commissionRate != null ? `${r.commissionRate}%` : 'a do profissional', right: true },
        { h: 'Ativo', c: (r) => <Switch on={r.isActive} disabled={!gerir} label={`${r.name} ativo`} onChange={() => void ativo.run('servicos', r)} /> },
        { h: '', c: (r) => gerir && <button className="btn" onClick={() => setServ(r)}>Editar</button> }]} /></Card>
    <Modal title={prof?.id ? `Editar · ${prof.name}` : 'Novo profissional'} open={!!prof} onClose={() => setProf(null)}>{prof && <><ErrorBox error={salvarProf.error} /><Form onSubmit={(v) => void salvarProf.run(v)} busy={salvarProf.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} defaultValue={prof.name ?? ''} /></Field>
      <div className="row"><Field label="Comissão (%)"><input className="input" name="commissionRate" type="number" step="0.5" min={0} max={100} defaultValue={prof.commissionRate ?? 40} /></Field><Field label="Cor na agenda"><input className="input" name="color" type="color" defaultValue={prof.color ?? '#db2777'} /></Field></div>
    </Form></>}</Modal>
    <Modal title={serv?.id ? `Editar · ${serv.name}` : 'Novo serviço'} open={!!serv} onClose={() => setServ(null)}>{serv && <><ErrorBox error={salvarServ.error} /><Form onSubmit={(v) => void salvarServ.run(v)} busy={salvarServ.busy}>
      <Field label="Serviço"><input className="input" name="name" required minLength={2} defaultValue={serv.name ?? ''} /></Field>
      <div className="row"><Field label="Duração (min)"><input className="input" name="durationMin" type="number" min={5} step={5} required defaultValue={serv.durationMin ?? 30} /></Field><Field label="Preço (R$)"><input className="input" name="price" type="number" step="0.01" min={0} required defaultValue={serv.price ?? ''} /></Field></div>
      <Field label="Comissão própria (%) — vazio = a do profissional"><input className="input" name="commissionRate" type="number" step="0.5" min={0} max={100} defaultValue={serv.commissionRate ?? ''} /></Field>
    </Form></>}</Modal>
  </div>;
}
