// src/components/EscolherCliente.tsx — busca de cliente (nome, telefone, documento) com cadastro
// rápido quando não acha: o tutor do pet, o paciente, o hóspede e a cliente do salão são todos
// clientes do núcleo.
import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox } from './ui';

export interface ClienteMin { id: string; name: string; phone?: string | null }

export function EscolherCliente({ value, onChange, rotulo = 'Cliente' }: { value: ClienteMin | null; onChange: (c: ClienteMin | null) => void; rotulo?: string }) {
  const [q, setQ] = useState('');
  const busca = useGet<any[]>(!value && q.trim().length >= 2 ? '/customers' : null, { q: q.trim() });
  const criar = useAction(async () => { const c = await post<any>('/customers', { name: q.trim() }); onChange({ id: c.id, name: c.name, phone: c.phone }); setQ(''); });
  if (value) return <div className="field"><span>{rotulo}</span><div className="row between"><strong>{value.name}</strong><button type="button" className="btn" onClick={() => onChange(null)}>Trocar</button></div></div>;
  const achados = busca.data ?? [];
  return <div className="field"><span>{rotulo}</span>
    <input className="input" placeholder="Nome, telefone ou documento" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${rotulo.toLowerCase()}`} />
    {q.trim().length >= 2 && <div className="grid" style={{ gap: 4, marginTop: 6 }}>
      {achados.slice(0, 6).map((c) => <button type="button" key={c.id} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => { onChange({ id: c.id, name: c.name, phone: c.phone }); setQ(''); }}><span>{c.name}</span><span className="muted">{c.phone ?? ''}</span></button>)}
      {busca.data && <button type="button" className="btn soft" onClick={() => void criar.run()} disabled={criar.busy}>+ Cadastrar "{q.trim()}"</button>}
    </div>}
    <ErrorBox error={criar.error ?? busca.error} />
  </div>;
}
