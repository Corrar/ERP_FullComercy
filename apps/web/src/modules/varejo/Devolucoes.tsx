// Trocas e devoluções: acha a venda pelo número, escolhe o que volta e como o cliente é ressarcido.
// Dinheiro/PIX/estorno saem na hora; "Vale-compra" fica em aberto no nome do cliente e o PDV abate
// na próxima venda (botão "Usar vale"). Quanto pode voltar e o valor quem decide é a API.
import { useState } from 'react';
import { get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Money, Table, Toast } from '@/components/ui';
import { brl, dt, num } from '@/lib/format';

const MEIOS: { k: string; label: string }[] = [
  { k: 'STORE_CREDIT', label: 'Vale-compra (troca)' }, { k: 'CASH', label: 'Dinheiro' }, { k: 'PIX', label: 'PIX' }, { k: 'CARD_REVERSAL', label: 'Estorno no cartão' },
];
const MEIO_PT = Object.fromEntries(MEIOS.map((m) => [m.k, m.label]));

interface Venda { order: any; jaDevolvido: Record<string, number> }

export function Devolucoes() {
  const historico = useGet<any[]>('/m/varejo/devolucoes');
  const [numero, setNumero] = useState(''); const [venda, setVenda] = useState<Venda | null>(null);
  const [qtd, setQtd] = useState<Record<string, number>>({}); const [estoque, setEstoque] = useState<Record<string, boolean>>({});
  const [meio, setMeio] = useState('STORE_CREDIT'); const [motivo, setMotivo] = useState(''); const [msg, setMsg] = useState<string | null>(null);

  const carregar = async (n: number) => {
    const lista = await get<{ rows: any[] }>('/orders', { q: n, moduleKey: 'VAREJO' });
    const achada = lista.rows.find((o) => o.number === n);
    if (!achada) throw new Error(`Venda #${n} não encontrada no varejo.`);
    const order = await get<any>(`/orders/${achada.id}`);
    if (!order.retailSale) throw new Error(`O pedido #${n} não é uma venda do PDV.`);
    const anteriores = await get<any[]>('/m/varejo/devolucoes', { saleId: order.retailSale.id });
    const jaDevolvido: Record<string, number> = {};
    for (const r of anteriores) for (const it of r.items) jaDevolvido[it.orderItemId] = (jaDevolvido[it.orderItemId] ?? 0) + Number(it.quantity);
    setVenda({ order, jaDevolvido }); setQtd({}); setEstoque({}); setMotivo('');
    if (!order.customerId) setMeio('CASH');
  };
  const buscar = useAction(async () => { const n = Number(numero.replace(/\D/g, '')); if (!n) throw new Error('Informe o número da venda.'); setVenda(null); await carregar(n); });

  const linhas = (venda?.order.items ?? []).filter((i: any) => i.kind === 'PRODUCT' || i.kind === 'SERVICE');
  const disponivel = (i: any) => Number(i.quantity) - (venda?.jaDevolvido[i.id] ?? 0);
  const escolhidos = linhas.filter((i: any) => (qtd[i.id] ?? 0) > 0);
  const total = escolhidos.reduce((s: number, i: any) => s + (Number(i.total) / Number(i.quantity)) * qtd[i.id], 0);
  const semCliente = !!venda && !venda.order.customerId;

  const devolver = useAction(async () => {
    if (!venda) return;
    if (!escolhidos.length) throw new Error('Escolha a quantidade de pelo menos um item.');
    const r = await post<any>('/m/varejo/devolucoes', {
      saleId: venda.order.retailSale.id, refundMethod: meio, reason: motivo || undefined,
      items: escolhidos.map((i: any) => ({ orderItemId: i.id, quantity: qtd[i.id], restock: estoque[i.id] ?? true })),
    });
    setMsg(meio === 'STORE_CREDIT'
      ? `Vale de ${brl(r.totalAmount)} para ${venda.order.customer?.name}. No PDV: "Usar vale".`
      : `Devolução registrada: ${brl(r.totalAmount)} (${MEIO_PT[meio]}).`);
    await carregar(venda.order.number); await historico.reload();
  });

  return <div className="grid">
    <h1>Trocas e devoluções</h1>
    <Card title="Venda">
      <div className="row"><input className="input" inputMode="numeric" placeholder="Número da venda (ex.: 1024)" value={numero} onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void buscar.run()} style={{ maxWidth: 260 }} />
        <button className="btn primary" onClick={() => void buscar.run()} disabled={buscar.busy}>Buscar</button></div>
      <ErrorBox error={buscar.error} />
      {venda && <div className="muted" style={{ marginTop: 8 }}>Venda #{venda.order.number} · {dt(venda.order.completedAt ?? venda.order.createdAt)} · <Money v={venda.order.total} /> · {venda.order.customer?.name ?? 'sem cliente'} · <Badge s={venda.order.status} /></div>}
    </Card>

    {venda && <Card title="O que volta">
      <Table rows={linhas} empty="Venda sem itens." cols={[
        { h: 'Item', c: (i: any) => i.description },
        { h: 'Comprado', c: (i: any) => num(i.quantity, 0), right: true },
        { h: 'Já devolvido', c: (i: any) => num(venda.jaDevolvido[i.id] ?? 0, 0), right: true },
        { h: 'Devolver', c: (i: any) => <input className="input" type="number" min={0} max={disponivel(i)} step={1} disabled={disponivel(i) <= 0} aria-label={`Devolver ${i.description}`} value={qtd[i.id] ?? 0} style={{ width: 80 }} onChange={(e) => setQtd((q) => ({ ...q, [i.id]: Math.max(0, Math.min(disponivel(i), Number(e.target.value))) }))} />, right: true },
        { h: 'Volta ao estoque', c: (i: any) => <input type="checkbox" aria-label={`Voltar ${i.description} ao estoque`} checked={estoque[i.id] ?? true} onChange={(e) => setEstoque((s) => ({ ...s, [i.id]: e.target.checked }))} /> },
        { h: 'Valor', c: (i: any) => <Money v={(Number(i.total) / Number(i.quantity)) * (qtd[i.id] ?? 0)} />, right: true },
      ]} />
      <div className="row" style={{ marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Como o cliente recebe"><select className="input" value={meio} onChange={(e) => setMeio(e.target.value)}>
          {MEIOS.map((m) => <option key={m.k} value={m.k} disabled={m.k === 'STORE_CREDIT' && semCliente}>{m.label}</option>)}</select></Field>
        <Field label="Motivo (opcional)"><input className="input" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: tamanho errado" /></Field>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div className="muted">Total a devolver</div><strong className="mono">{brl(total)}</strong></div>
      </div>
      {semCliente && <div className="muted" style={{ marginTop: 6 }}>Venda sem cliente: o vale precisa de um dono para ser usado no PDV, então só há devolução em dinheiro, PIX ou estorno.</div>}
      <ErrorBox error={devolver.error} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn primary" disabled={!escolhidos.length || devolver.busy} onClick={() => void devolver.run()}>{meio === 'STORE_CREDIT' ? 'Gerar vale' : 'Registrar devolução'}</button></div>
    </Card>}

    <Card title="Últimas devoluções">
      <Table rows={historico.data} empty="Nenhuma devolução ainda." cols={[
        { h: 'Quando', c: (r) => dt(r.createdAt) }, { h: 'Venda', c: (r) => `#${r.sale.order.number}` },
        { h: 'Itens', c: (r) => r.items.map((it: any) => `${num(it.quantity, 0)}× ${it.orderItem.description}`).join(', ') },
        { h: 'Forma', c: (r) => MEIO_PT[r.refundMethod] ?? r.refundMethod }, { h: 'Motivo', c: (r) => r.reason ?? '—' },
        { h: 'Total', c: (r) => <Money v={r.totalAmount} />, right: true }, { h: 'Status', c: (r) => <Badge s={r.status} /> },
      ]} />
    </Card>
    <Toast msg={msg} />
  </div>;
}
