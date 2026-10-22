import { useCallback, useState } from 'react';
import { get, patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Form, Kpi, Modal, Money, Switch, Table, Tabs } from '@/components/ui';
import { brl } from '@/lib/format';

export function Entregas() {
  const [tab, setTab] = useState('entregas');
  return <div className="grid">
    <h1>Entregas</h1>
    <Tabs tabs={[{ k: 'entregas', label: 'Em curso' }, { k: 'entregadores', label: 'Entregadores e acerto' }, { k: 'zonas', label: 'Zonas e taxas' }]} active={tab} onChange={setTab} />
    {tab === 'entregas' && <EmCurso />}
    {tab === 'entregadores' && <Entregadores />}
    {tab === 'zonas' && <Zonas />}
  </div>;
}

function EmCurso() {
  const ent = useGet<any[]>('/m/food/entregas'); const cour = useGet<any[]>('/m/food/entregadores');
  useSocketEvent('delivery.status', useCallback(() => { void ent.reload(); }, [ent]));
  const atribuir = useAction(async (id: string, courierId: string) => { await post(`/m/food/entregas/${id}/atribuir`, { courierId }); await ent.reload(); });
  const mover = useAction(async (id: string, to: string) => { await post(`/m/food/entregas/${id}/mover`, { to }); await ent.reload(); });
  const prox: Record<string, string[]> = { ASSIGNED: ['PICKED_UP'], PICKED_UP: ['DELIVERED', 'FAILED'] };
  return <>
    <ErrorBox error={atribuir.error ?? mover.error} />
    <Card><Table rows={ent.data} empty="Nenhuma entrega em curso." cols={[
      { h: 'Pedido', c: (r) => `#${r.foodOrder.order.number}` }, { h: 'Cliente', c: (r) => <>{r.foodOrder.order.customer?.name}<div className="muted">{r.foodOrder.order.customer?.phone}</div></> }, { h: 'Endereço', c: (r) => `${r.address.street}, ${r.address.number ?? ''} ${r.address.district ?? ''}` }, { h: 'Total', c: (r) => <Money v={r.foodOrder.order.total} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      { h: 'Entregador', c: (r) => r.status === 'PENDING' ? <select className="input" defaultValue="" onChange={(e) => e.target.value && void atribuir.run(r.id, e.target.value)}><option value="">atribuir…</option>{cour.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : r.courier?.name },
      { h: '', c: (r) => <div className="row">{(prox[r.status] ?? []).map((to) => <button key={to} className={`btn ${to === 'FAILED' ? 'danger' : 'primary'}`} onClick={() => void mover.run(r.id, to)}>{to === 'PICKED_UP' ? 'Saiu' : to === 'DELIVERED' ? 'Entregue' : 'Falhou'}</button>)}</div> }]} /></Card>
  </>;
}

/** Data do <input type=date> no fuso do navegador: início e fim do dia escolhido. */
const inicioDoDia = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const fimDoDia = (s: string) => new Date(`${s}T23:59:59.999`).toISOString();
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function Entregadores() {
  const { can } = useSession(); const gerir = can('food.delivery:manage');
  const cour = useGet<any[]>('/m/food/entregadores'); const [novo, setNovo] = useState(false); const [acerto, setAcerto] = useState<any | null>(null);
  const criar = useAction(async (v: Record<string, any>) => { await post('/m/food/entregadores', v); setNovo(false); await cour.reload(); });
  const ativo = useAction(async (c: any) => { await patch(`/m/food/entregadores/${c.id}`, { isActive: !c.isActive }); await cour.reload(); });
  return <>
    <ErrorBox error={ativo.error} />
    <Card title="Entregadores" actions={gerir && <button className="btn primary" onClick={() => setNovo(true)}>Novo entregador</button>}>
      <Table rows={cour.data} empty="Nenhum entregador cadastrado." cols={[
        { h: 'Nome', c: (c) => c.name }, { h: 'Telefone', c: (c) => c.phone ?? '—' }, { h: 'Veículo', c: (c) => [c.vehicle, c.plate].filter(Boolean).join(' · ') || '—' },
        { h: 'Ativo', c: (c) => <Switch on={c.isActive} disabled={!gerir} label={`${c.name} ativo`} onChange={() => void ativo.run(c)} /> },
        { h: '', c: (c) => gerir && <button className="btn" onClick={() => setAcerto(c)}>Acerto</button> },
      ]} /></Card>
    <Modal title="Novo entregador" open={novo} onClose={() => setNovo(false)}><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
      <Field label="Nome"><input className="input" name="name" required minLength={2} /></Field><Field label="Telefone"><input className="input" name="phone" /></Field>
      <div className="row"><Field label="Veículo"><input className="input" name="vehicle" placeholder="moto, bike…" /></Field><Field label="Placa"><input className="input" name="plate" /></Field></div>
    </Form></Modal>
    <Modal title={`Acerto · ${acerto?.name ?? ''}`} open={!!acerto} onClose={() => setAcerto(null)}>{acerto && <Acerto courierId={acerto.id} />}</Modal>
  </>;
}

/** Entregas concluídas no período, taxas que ficam com o entregador e o dinheiro que ele devolve à loja. */
function Acerto({ courierId }: { courierId: string }) {
  const [de, setDe] = useState(hoje()); const [ate, setAte] = useState(hoje());
  const r = useGet<any>(de && ate ? `/m/food/entregadores/${courierId}/acerto` : null, { from: de ? inicioDoDia(de) : undefined, to: ate ? fimDoDia(ate) : undefined });
  const repassar = Number(r.data?.aRepassarParaLoja ?? 0);
  return <div className="grid" style={{ gap: 12 }}>
    <div className="row"><Field label="De"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field><Field label="Até"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field></div>
    <ErrorBox error={r.error} />
    {r.data && <>
      <div className="grid kpis"><Kpi label="Entregas" value={r.data.entregas} /><Kpi label="Taxas de entrega" value={r.data.taxasDeEntrega} money /><Kpi label="Dinheiro em mãos" value={r.data.dinheiroEmMaos} money /></div>
      <div className="row between"><span>{repassar >= 0 ? 'Entregador repassa para a loja' : 'Loja paga ao entregador'}</span><strong className="mono">{brl(Math.abs(repassar))}</strong></div>
    </>}
  </div>;
}

function Zonas() {
  const { can } = useSession(); const gerir = can('food.delivery:manage');
  const zonas = useGet<any[]>('/m/food/zonas'); const [editar, setEditar] = useState<any | null>(null); const [cep, setCep] = useState('');
  const salvar = useAction(async (v: Record<string, any>) => {
    // CEPs atendidos = prefixos (só dígitos), separados por vírgula ou espaço: "05433, 05435".
    const zipPrefixes = String(v.ceps ?? '').split(/[\s,;]+/).map((p) => p.replace(/\D/g, '')).filter(Boolean);
    const body = { name: v.name, fee: v.fee, etaMin: v.etaMin ?? (editar?.id ? null : undefined), rule: { ...(editar?.rule ?? {}), zipPrefixes } };
    if (editar?.id) await patch(`/m/food/zonas/${editar.id}`, body); else await post('/m/food/zonas', body);
    setEditar(null); await zonas.reload();
  });
  const ativa = useAction(async (z: any) => { await patch(`/m/food/zonas/${z.id}`, { isActive: !z.isActive }); await zonas.reload(); });
  const teste = useAction(async () => { const d = cep.replace(/\D/g, ''); if (d.length < 3) throw new Error('Digite o CEP.'); return (await get<any>(`/m/food/zonas/cep/${d}`)) ?? { nenhuma: true }; });
  const [achou, setAchou] = useState<any | null>(null);
  return <>
    <ErrorBox error={ativa.error} />
    <Card title="Zonas de entrega" actions={gerir && <button className="btn primary" onClick={() => setEditar({})}>Nova zona</button>}>
      <div className="muted" style={{ marginBottom: 8 }}>O pedido de entrega cai na zona cujo prefixo de CEP casa com o endereço; a taxa da zona vai para o pedido e para o acerto do entregador.</div>
      <Table rows={zonas.data} empty="Nenhuma zona: entregas saem sem taxa." cols={[
        { h: 'Zona', c: (z) => z.name }, { h: 'CEPs (prefixos)', c: (z) => ((z.rule?.zipPrefixes ?? []) as string[]).join(', ') || '—' },
        { h: 'Taxa', c: (z) => <Money v={z.fee} />, right: true }, { h: 'Prazo', c: (z) => z.etaMin ? `${z.etaMin} min` : '—', right: true },
        { h: 'Ativa', c: (z) => <Switch on={z.isActive} disabled={!gerir} label={`Zona ${z.name} ativa`} onChange={() => void ativa.run(z)} /> },
        { h: '', c: (z) => gerir && <button className="btn" onClick={() => setEditar(z)}>Editar</button> },
      ]} /></Card>
    <Card title="Qual zona atende este CEP?">
      <div className="row"><input className="input" inputMode="numeric" placeholder="CEP do cliente" value={cep} onChange={(e) => setCep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void teste.run().then(setAchou)} style={{ maxWidth: 200 }} />
        <button className="btn" onClick={() => void teste.run().then(setAchou)}>Conferir</button>
        {achou && (achou.nenhuma ? <span className="muted">Nenhuma zona ativa atende este CEP.</span> : <span><strong>{achou.name}</strong> · taxa {brl(achou.fee)}{achou.etaMin ? ` · ${achou.etaMin} min` : ''}</span>)}</div>
      <ErrorBox error={teste.error} />
    </Card>
    <Modal title={editar?.id ? `Editar zona · ${editar.name}` : 'Nova zona'} open={!!editar} onClose={() => setEditar(null)}>{editar && <><ErrorBox error={salvar.error} /><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" required defaultValue={editar.name ?? ''} placeholder="ex.: Centro" /></Field>
      <Field label="CEPs atendidos (prefixos, separados por vírgula)"><input className="input" name="ceps" required defaultValue={((editar.rule?.zipPrefixes ?? []) as string[]).join(', ')} placeholder="ex.: 05433, 05435" /></Field>
      <div className="row"><Field label="Taxa (R$)"><input className="input" name="fee" type="number" step="0.01" min={0} required defaultValue={editar.fee ?? ''} /></Field>
        <Field label="Prazo (min, opcional)"><input className="input" name="etaMin" type="number" step={1} min={1} defaultValue={editar.etaMin ?? ''} /></Field></div>
    </Form></>}</Modal>
  </>;
}
