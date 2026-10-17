import { useState } from 'react';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { dt } from '@/lib/format';

export function Caixa() {
  const [terminal, setTerminal] = useState(localStorage.getItem('fc.terminal') ?? 'CAIXA-1');
  const atual = useGet<any>('/m/varejo/caixa/atual', { terminal }); const sessoes = useGet<any[]>('/m/varejo/caixa');
  const resumo = useGet<any>(atual.data ? `/m/varejo/caixa/${atual.data.id}/resumo` : null);
  const [fechar, setFechar] = useState(false); const [mov, setMov] = useState(false);
  const reload = async () => { await atual.reload(); await sessoes.reload(); await resumo.reload(); };
  const abrir = useAction(async (v: Record<string, any>) => { localStorage.setItem('fc.terminal', terminal); await post('/m/varejo/caixa/abrir', { terminal, openingAmount: v.openingAmount ?? 0 }); await reload(); });
  const fecharC = useAction(async (v: Record<string, any>) => { await post(`/m/varejo/caixa/${atual.data.id}/fechar`, v); setFechar(false); await reload(); });
  const movC = useAction(async (v: Record<string, any>) => { await post(`/m/varejo/caixa/${atual.data.id}/movimentos`, v); setMov(false); await reload(); });
  return <div className="grid">
    <h1>Caixa</h1>
    <div className="row"><label className="field">Terminal<input className="input" value={terminal} onChange={(e) => setTerminal(e.target.value)} /></label></div>
    {atual.data ? <Card title={`Caixa aberto · ${atual.data.terminal}`} actions={<><button className="btn" onClick={() => setMov(true)}>Sangria / suprimento</button><button className="btn danger" onClick={() => setFechar(true)}>Fechar caixa</button></>}>
      <div className="muted">Aberto em {dt(atual.data.openedAt)} · fundo <Money v={atual.data.openingAmount} /></div>
      {resumo.data && <div className="grid" style={{ marginTop: 12 }}>{resumo.data.porMetodo.map((m: any) => <div key={m.method} className="row between"><span>{m.method} ({m.qtd})</span><Money v={m.total} /></div>)}{!resumo.data.porMetodo.length && <div className="muted">Nenhuma venda ainda.</div>}</div>}
    </Card> : <Card title="Abrir caixa"><ErrorBox error={abrir.error} /><Form onSubmit={(v) => void abrir.run(v)} busy={abrir.busy} submitLabel="Abrir"><Field label="Fundo de troco"><input className="input" name="openingAmount" type="number" step="0.01" defaultValue={0} /></Field></Form></Card>}
    <Card title="Histórico"><Table rows={sessoes.data} cols={[{ h: 'Terminal', c: (r) => r.terminal }, { h: 'Abertura', c: (r) => dt(r.openedAt) }, { h: 'Fechamento', c: (r) => dt(r.closedAt) }, { h: 'Por', c: (r) => r.openedBy.name }, { h: 'Vendas', c: (r) => r._count.sales, right: true }, { h: 'Esperado', c: (r) => r.expectedAmount ? <Money v={r.expectedAmount} /> : '—', right: true }, { h: 'Contado', c: (r) => r.closingAmount ? <Money v={r.closingAmount} /> : '—', right: true }]} /></Card>
    <Modal title="Fechar caixa" open={fechar} onClose={() => setFechar(false)}><ErrorBox error={fecharC.error} /><Form onSubmit={(v) => void fecharC.run(v)} busy={fecharC.busy} submitLabel="Fechar"><Field label="Dinheiro contado na gaveta"><input className="input" name="closingAmount" type="number" step="0.01" required /></Field><Field label="Observações"><input className="input" name="notes" /></Field></Form></Modal>
    <Modal title="Sangria / suprimento" open={mov} onClose={() => setMov(false)}><ErrorBox error={movC.error} /><Form onSubmit={(v) => void movC.run(v)} busy={movC.busy}><Field label="Tipo"><select className="input" name="kind"><option value="SANGRIA">Sangria (retirar)</option><option value="SUPRIMENTO">Suprimento (colocar)</option></select></Field><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" required /></Field><Field label="Motivo"><input className="input" name="note" /></Field></Form></Modal>
  </div>;
}
