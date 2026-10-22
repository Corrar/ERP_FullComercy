import { useState } from 'react';
import { baixarArquivo, patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Kpi, Modal, Money, Table, Tabs } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { d } from '@/lib/format';

const MEIOS = ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'OTHER'];
const iso = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function Finance() {
  const { can } = useSession(); const gerir = can('core.finance:manage');
  const [tab, setTab] = useState('RECEIVABLE'); const [abertos, setAbertos] = useState(true);
  const [novo, setNovo] = useState(false); const [baixa, setBaixa] = useState<any | null>(null); const [editar, setEditar] = useState<any | null>(null); const [cancelar, setCancelar] = useState<any | null>(null);
  const titulos = tab === 'RECEIVABLE' || tab === 'PAYABLE';
  const resumo = useGet<any>('/finance/summary');
  const entries = useGet<any[]>(titulos ? '/finance/entries' : null, { kind: tab });
  const contas = useGet<any[]>('/finance/accounts'); const cats = useGet<any[]>('/finance/categories');
  const recarregar = async () => { await entries.reload(); await resumo.reload(); };
  const baixar = useAction(async (v: Record<string, any>) => { await post(`/finance/entries/${baixa.id}/settle`, { amount: v.amount, method: v.method, accountId: v.accountId || undefined, reference: v.reference }); setBaixa(null); await recarregar(); });
  const salvarEdicao = useAction(async (v: Record<string, any>) => { await patch(`/finance/entries/${editar.id}`, { description: v.description, dueDate: v.dueDate, categoryId: v.categoryId || null, amount: v.amount, notes: v.notes }); setEditar(null); await recarregar(); });
  const cancelarTitulo = useAction(async (v: Record<string, any>) => { await post(`/finance/entries/${cancelar.id}/cancel`, { reason: v.reason }); setCancelar(null); await recarregar(); });
  const linhas = (entries.data ?? []).filter((r) => !abertos || ['OPEN', 'PARTIAL'].includes(r.status));
  const catsDoTipo = (cats.data ?? []).filter((c) => c.kind === tab);
  return <div className="grid">
    <h1>Financeiro</h1>
    {resumo.data && <div className="grid kpis"><Kpi label="Recebido no mês" value={resumo.data.recebido} money /><Kpi label="Pago no mês" value={resumo.data.pago} money /><Kpi label="Saldo do mês" value={resumo.data.saldo} money /><Kpi label="Títulos vencidos" value={resumo.data.vencidos.length} /></div>}
    <Tabs tabs={[{ k: 'RECEIVABLE', label: 'A receber' }, { k: 'PAYABLE', label: 'A pagar' }, { k: 'dre', label: 'DRE' }, { k: 'cadastros', label: 'Contas e categorias' }]} active={tab} onChange={setTab} />
    {titulos && <Card actions={<><label className="row muted"><input type="checkbox" checked={abertos} onChange={(e) => setAbertos(e.target.checked)} /> Só em aberto</label>{gerir && <button className="btn primary" onClick={() => setNovo(true)}>Novo título</button>}</>}>
      <ErrorBox error={entries.error} />
      <Table rows={entries.data ? linhas : null} empty="Nenhum título." cols={[{ h: 'Vencimento', c: (r) => d(r.dueDate) }, { h: 'Descrição', c: (r) => <>{r.description}{r.category && <div className="muted">{r.category.name}</div>}</> }, { h: 'Cliente', c: (r) => r.customer?.name ?? '—' }, { h: 'Valor', c: (r) => <Money v={r.amount} />, right: true }, { h: 'Pago', c: (r) => <Money v={r.paidAmount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
        { h: '', c: (r) => gerir && ['OPEN', 'PARTIAL'].includes(r.status) ? <div className="row"><button className="btn" onClick={() => setBaixa(r)}>Baixar</button><button className="btn" onClick={() => setEditar(r)}>Editar</button>{r.status === 'OPEN' && <button className="btn danger" onClick={() => setCancelar(r)}>Cancelar</button>}</div> : null }]} /></Card>}
    {tab === 'dre' && <Dre />}
    {tab === 'cadastros' && <Cadastros contas={contas} cats={cats} gerir={gerir} />}
    <Modal title={tab === 'PAYABLE' ? 'Nova conta a pagar' : 'Nova conta a receber'} open={novo} onClose={() => setNovo(false)}>{novo && <NovoTitulo kind={tab} cats={catsDoTipo} onDone={async () => { setNovo(false); await recarregar(); }} />}</Modal>
    <Modal title={`Baixar: ${baixa?.description ?? ''}`} open={!!baixa} onClose={() => setBaixa(null)}><ErrorBox error={baixar.error} /><Form onSubmit={(v) => void baixar.run(v)} busy={baixar.busy} submitLabel="Baixar">
      <div className="row"><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" defaultValue={baixa ? (Number(baixa.amount) - Number(baixa.paidAmount)).toFixed(2) : ''} required /></Field><Field label="Meio"><select className="input" name="method" defaultValue="PIX">{MEIOS.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
      <div className="row"><Field label="Conta"><select className="input" name="accountId" defaultValue="">{<option value="">Padrão</option>}{contas.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Referência (NSU, txid)"><input className="input" name="reference" /></Field></div></Form></Modal>
    <Modal title={`Editar: ${editar?.description ?? ''}`} open={!!editar} onClose={() => setEditar(null)}>{editar && <><ErrorBox error={salvarEdicao.error} /><Form onSubmit={(v) => void salvarEdicao.run(v)} busy={salvarEdicao.busy}>
      <Field label="Descrição"><input className="input" name="description" required defaultValue={editar.description} /></Field>
      <div className="row"><Field label="Vencimento"><input className="input" name="dueDate" type="date" required defaultValue={editar.dueDate.slice(0, 10)} /></Field><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" min={0.01} required defaultValue={editar.amount} /></Field></div>
      <Field label="Categoria"><select className="input" name="categoryId" defaultValue={editar.categoryId ?? ''}><option value="">Sem categoria</option>{(cats.data ?? []).filter((c) => c.kind === editar.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Observações"><input className="input" name="notes" defaultValue={editar.notes ?? ''} /></Field></Form></>}</Modal>
    <Modal title={`Cancelar: ${cancelar?.description ?? ''}`} open={!!cancelar} onClose={() => setCancelar(null)}><ErrorBox error={cancelarTitulo.error} /><Form onSubmit={(v) => void cancelarTitulo.run(v)} busy={cancelarTitulo.busy} submitLabel="Cancelar título">
      <Field label="Motivo"><input className="input" name="reason" required minLength={3} /></Field></Form></Modal>
  </div>;
}

function NovoTitulo({ kind, cats, onDone }: { kind: string; cats: any[]; onDone: () => void }) {
  const [cli, setCli] = useState<ClienteMin | null>(null);
  const criar = useAction(async (v: Record<string, any>) => { await post('/finance/entries', { kind, description: v.description, amount: v.amount, dueDate: v.dueDate, categoryId: v.categoryId || undefined, customerId: cli?.id }); onDone(); });
  return <div className="grid" style={{ gap: 12 }}>{kind === 'RECEIVABLE' && <EscolherCliente value={cli} onChange={setCli} rotulo="Cliente (opcional)" />}<ErrorBox error={criar.error} />
    <Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Descrição"><input className="input" name="description" required /></Field>
      <div className="row"><Field label="Valor"><input className="input" name="amount" type="number" step="0.01" min={0.01} required /></Field><Field label="Vencimento"><input className="input" name="dueDate" type="date" required defaultValue={iso(new Date())} /></Field></div>
      <Field label="Categoria"><select className="input" name="categoryId" defaultValue=""><option value="">Sem categoria</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></Form></div>;
}

function Dre() {
  const hoje = new Date();
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))); const [ate, setAte] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
  const q = { from: new Date(`${de}T00:00:00`).toISOString(), to: new Date(new Date(`${ate}T00:00:00`).getTime() + 86400000).toISOString() };
  const r = useGet<any>('/finance/dre', q);
  const pdf = useAction(async () => baixarArquivo('/finance/dre', { ...q, format: 'pdf' }, `dre-${de}-a-${ate}.pdf`));
  const bloco = (titulo: string, linhas: any[], total: string) => <Card title={titulo}><Table<any> rows={linhas} empty="Nada no período." cols={[{ h: 'Grupo', c: (l) => l.grupo }, { h: 'Valor', c: (l) => <Money v={l.total} />, right: true }]} /><div className="row between" style={{ marginTop: 8 }}><strong>Total</strong><strong><Money v={total} /></strong></div></Card>;
  return <div className="grid">
    <div className="row between"><div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
      <button className="btn" onClick={() => void pdf.run()} disabled={pdf.busy}>Baixar PDF</button></div>
    <ErrorBox error={r.error ?? pdf.error} />
    <div className="muted">Regime de caixa: o que foi efetivamente recebido e pago no período, por categoria (sem categoria, pela origem). Vale-troca não entra.</div>
    {r.data && <><div className="grid kpis"><Kpi label="Receitas" value={r.data.totalReceitas} money /><Kpi label="Despesas" value={r.data.totalDespesas} money /><Kpi label="Resultado" value={r.data.resultado} money /></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>{bloco('Receitas', r.data.receitas, r.data.totalReceitas)}{bloco('Despesas', r.data.despesas, r.data.totalDespesas)}</div></>}
  </div>;
}

function Cadastros({ contas, cats, gerir }: { contas: { data: any[] | null; reload: () => Promise<void> }; cats: { data: any[] | null; reload: () => Promise<void> }; gerir: boolean }) {
  const [novaConta, setNovaConta] = useState(false); const [novaCat, setNovaCat] = useState(false);
  const criarConta = useAction(async (v: Record<string, any>) => { await post('/finance/accounts', { name: v.name, kind: v.kind, isDefault: !!v.isDefault }); setNovaConta(false); await contas.reload(); });
  const criarCat = useAction(async (v: Record<string, any>) => { await post('/finance/categories', { name: v.name, kind: v.kind }); setNovaCat(false); await cats.reload(); });
  const TIPO: Record<string, string> = { CASH: 'Caixa', BANK: 'Banco', DIGITAL: 'Conta digital' };
  return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
    <Card title="Contas" actions={gerir && <button className="btn" onClick={() => setNovaConta(true)}>Nova conta</button>}><Table rows={contas.data} cols={[{ h: 'Conta', c: (c) => c.name }, { h: 'Tipo', c: (c) => TIPO[c.kind] ?? c.kind }, { h: 'Padrão', c: (c) => c.isDefault ? 'sim' : '' }]} /></Card>
    <Card title="Categorias" actions={gerir && <button className="btn" onClick={() => setNovaCat(true)}>Nova categoria</button>}><Table rows={cats.data} empty="Sem categorias: o DRE agrupa pela origem." cols={[{ h: 'Categoria', c: (c) => c.name }, { h: 'Tipo', c: (c) => c.kind === 'RECEIVABLE' ? 'Receita' : 'Despesa' }]} /></Card>
    <Modal title="Nova conta" open={novaConta} onClose={() => setNovaConta(false)}><ErrorBox error={criarConta.error} /><Form onSubmit={(v) => void criarConta.run(v)} busy={criarConta.busy}>
      <Field label="Nome"><input className="input" name="name" required placeholder="Banco do Brasil, Caixa da loja…" /></Field><Field label="Tipo"><select className="input" name="kind" defaultValue="BANK">{Object.entries(TIPO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <label className="row"><input type="checkbox" name="isDefault" /> Conta padrão das baixas</label></Form></Modal>
    <Modal title="Nova categoria" open={novaCat} onClose={() => setNovaCat(false)}><ErrorBox error={criarCat.error} /><Form onSubmit={(v) => void criarCat.run(v)} busy={criarCat.busy}>
      <Field label="Nome"><input className="input" name="name" required placeholder="Aluguel, Energia, Serviços…" /></Field><Field label="Tipo"><select className="input" name="kind" defaultValue="PAYABLE"><option value="RECEIVABLE">Receita</option><option value="PAYABLE">Despesa</option></select></Field></Form></Modal>
  </div>;
}
