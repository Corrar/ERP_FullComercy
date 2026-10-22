// src/components/EscolherProduto.tsx — busca de produto por nome/SKU/código e escolha da variante.
// Telas que pediam "ID da variante" (que não aparece em lugar nenhum) usam este seletor.
import { useState } from 'react';
import { useGet } from '@/lib/use-api';

export interface VarianteMin { id: string; sku: string; nome: string }

export function EscolherProduto({ value, onChange, rotulo = 'Produto' }: { value: VarianteMin | null; onChange: (v: VarianteMin | null) => void; rotulo?: string }) {
  const [q, setQ] = useState('');
  const r = useGet<any[]>(!value && q.trim().length >= 2 ? '/products' : null, { q: q.trim() });
  if (value) return <div className="field"><span>{rotulo}</span><div className="row between"><strong>{value.nome}</strong><span className="row"><span className="muted mono">{value.sku}</span><button type="button" className="btn" onClick={() => onChange(null)}>Trocar</button></span></div></div>;
  const vs = (r.data ?? []).flatMap((p) => p.variants.map((v: any) => ({ id: v.id, sku: v.sku, nome: [p.name, v.name].filter(Boolean).join(' · ') })));
  return <div className="field"><span>{rotulo}</span>
    <input className="input" placeholder="Nome, SKU ou código de barras" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${rotulo.toLowerCase()}`} />
    {q.trim().length >= 2 && <div className="grid" style={{ gap: 4, marginTop: 6 }}>
      {vs.slice(0, 8).map((v) => <button type="button" key={v.id} className="btn" style={{ justifyContent: 'space-between' }} onClick={() => { onChange(v); setQ(''); }}><span>{v.nome}</span><span className="muted mono">{v.sku}</span></button>)}
      {r.data && !vs.length && <div className="muted">Nenhum produto.</div>}</div>}
  </div>;
}
