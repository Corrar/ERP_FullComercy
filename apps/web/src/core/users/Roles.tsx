import { useState } from 'react';
import { post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal } from '@/components/ui';

export function Roles() {
  const { data, reload } = useGet<{ roles: any[]; catalog: { key: string; label: string; module: string | null }[] }>('/roles');
  const [sel, setSel] = useState<any | null>(null); const [novo, setNovo] = useState(false);
  const salvar = useAction(async (v: Record<string, any>) => { await put(`/roles/${sel.id}/permissions`, { permissions: Object.keys(v).filter((k) => v[k]) }); setSel(null); await reload(); });
  const criar = useAction(async (v: Record<string, any>) => { await post('/roles', { key: v.key, name: v.name, permissions: [] }); setNovo(false); await reload(); });
  if (!data) return <div className="muted">Carregando…</div>;
  const grupos = data.catalog.reduce<Record<string, typeof data.catalog>>((acc, p) => { (acc[p.module ?? 'Núcleo'] ??= []).push(p); return acc; }, {});
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Perfis e permissões</h1><button className="btn primary" onClick={() => setNovo(true)}>Novo perfil</button></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {data.roles.map((r) => <Card key={r.id} title={r.name} actions={!r.isSystem && <button className="btn" onClick={() => setSel(r)}>Editar</button>}>
        <div className="muted">{r.key}{r.isSystem && ' · sistema (acesso total)'}</div><div style={{ marginTop: 6 }}>{r.isSystem ? 'Todas as permissões' : `${r.permissions.length} permissões`}</div></Card>)}
    </div>
    <Modal title={`Permissões de ${sel?.name ?? ''}`} open={!!sel} onClose={() => setSel(null)}><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      {Object.entries(grupos).map(([g, ps]) => <div key={g}><h2>{g}</h2>{ps.map((p) => <label key={p.key} className="row"><input type="checkbox" name={p.key} defaultChecked={sel?.permissions.some((x: any) => x.permissionKey === p.key)} /> {p.label} <span className="muted">{p.key}</span></label>)}</div>)}</Form></Modal>
    <Modal title="Novo perfil" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Chave (a-z, 0-9, _)"><input className="input" name="key" pattern="[a-z0-9_]{2,40}" required /></Field><Field label="Nome"><input className="input" name="name" required /></Field></Form></Modal>
  </div>;
}
