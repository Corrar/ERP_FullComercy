import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Modal, Money, Switch, Table } from '@/components/ui';

export function Cadastros() {
  const { can } = useSession(); const gerir = can('cli.cadastro:manage');
  const profs = useGet<any[]>('/m/clinica/profissionais'); const [ed, setEd] = useState<any | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { const b = { name: v.name, specialty: v.specialty, registry: v.registry, defaultDurationMin: v.defaultDurationMin, defaultPrice: v.defaultPrice ?? 0 }; if (ed?.id) await patch(`/m/clinica/profissionais/${ed.id}`, b); else await post('/m/clinica/profissionais', b); setEd(null); await profs.reload(); });
  const ativo = useAction(async (r: any) => { await patch(`/m/clinica/profissionais/${r.id}`, { isActive: !r.isActive }); await profs.reload(); });
  return <div className="grid"><div className="row between"><h1 style={{ margin: 0 }}>Profissionais</h1>{gerir && <button className="btn primary" onClick={() => setEd({})}>Novo profissional</button>}</div>
    <ErrorBox error={ativo.error} />
    <Card><Table rows={profs.data} empty="Nenhum profissional." cols={[{ h: 'Nome', c: (r) => r.name }, { h: 'Especialidade', c: (r) => r.specialty ?? '—' }, { h: 'Registro', c: (r) => r.registry ?? '—' }, { h: 'Duração', c: (r) => `${r.defaultDurationMin} min`, right: true }, { h: 'Consulta', c: (r) => <Money v={r.defaultPrice} />, right: true },
      { h: 'Ativo', c: (r) => <Switch on={r.isActive} disabled={!gerir} label={`${r.name} ativo`} onChange={() => void ativo.run(r)} /> }, { h: '', c: (r) => gerir && <button className="btn" onClick={() => setEd(r)}>Editar</button> }]} /></Card>
    <Modal title={ed?.id ? `Editar · ${ed.name}` : 'Novo profissional'} open={!!ed} onClose={() => setEd(null)}>{ed && <><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} defaultValue={ed.name ?? ''} /></Field>
      <div className="row"><Field label="Especialidade"><input className="input" name="specialty" defaultValue={ed.specialty ?? ''} /></Field><Field label="Registro (CRM, CRO…)"><input className="input" name="registry" defaultValue={ed.registry ?? ''} /></Field></div>
      <div className="row"><Field label="Duração da consulta (min)"><input className="input" name="defaultDurationMin" type="number" min={5} step={5} defaultValue={ed.defaultDurationMin ?? 30} /></Field><Field label="Valor particular (R$)"><input className="input" name="defaultPrice" type="number" step="0.01" min={0} defaultValue={ed.defaultPrice ?? ''} /></Field></div>
    </Form></>}</Modal></div>;
}
