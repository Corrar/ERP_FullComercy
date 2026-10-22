// modules/food/ContaComanda.tsx — a conta da comanda no salão: consumo, taxa de serviço, o que já
// foi pago e o que falta, com DIVISÃO entre as pessoas da mesa. Cada parte é recebida sem fechar
// (POST /comandas/:id/partes); a última fecha a conta. Quem decide o rateio entre as rodadas e a
// taxa é a API — a tela só sugere o valor de cada pessoa.
import { useEffect, useState } from 'react';
import { post } from '@/lib/api';
import { useAction } from '@/lib/use-api';
import { brl } from '@/lib/format';
import { Card, ErrorBox, Field, Money } from '@/components/ui';

const MEIOS: [string, string][] = [['PIX', 'Pix'], ['CASH', 'Dinheiro'], ['DEBIT', 'Débito'], ['CREDIT', 'Crédito']];
const cent = (v: number) => Math.round(v * 100) / 100;

export function ContaComanda({ conta, onAtualizada, onFechada }: { conta: any; onAtualizada: (c: any) => void; onFechada: () => void | Promise<void> }) {
  const tabId = conta.tab.id;
  const [taxa, setTaxa] = useState(true);
  const [pessoas, setPessoas] = useState<number>(Math.max(1, conta.tab.guests ?? 1));
  const [meio, setMeio] = useState('PIX');
  const total = Number(taxa || conta.taxaMaterializada ? conta.total : conta.subtotal);
  const falta = cent(Math.max(0, total - Number(conta.pago)));
  const porPessoa = pessoas > 1 ? cent(falta / pessoas) : falta;
  const [valor, setValor] = useState(porPessoa.toFixed(2));
  useEffect(() => { setValor(porPessoa.toFixed(2)); }, [porPessoa]);

  const cobrarTaxa = taxa || conta.taxaMaterializada;
  const parte = useAction(async () => {
    const r = await post(`/m/food/comandas/${tabId}/partes`, { payments: [{ method: meio, amount: Number(valor) }], cobrarTaxa });
    setPessoas((n) => Math.max(1, n - 1)); onAtualizada(r);
  });
  const fechar = useAction(async (comPagamento: boolean) => {
    await post(`/m/food/comandas/${tabId}/fechar`, { payments: comPagamento ? [{ method: meio, amount: Number(valor) }] : [], cobrarTaxa });
    await onFechada();
  });
  const v = Number(valor);
  const ultimo = cent(v) >= falta;

  return <Card title="Conta">
    <div className="row between"><span>Consumo</span><Money v={conta.subtotal} /></div>
    <div className="row between"><label className="row" style={{ gap: 6 }}>
      <input type="checkbox" checked={cobrarTaxa} disabled={conta.taxaMaterializada} onChange={(e) => setTaxa(e.target.checked)} /> Taxa de serviço
    </label><Money v={cobrarTaxa ? conta.taxaServico : 0} /></div>
    <div className="row between"><strong>Total</strong><strong>{brl(total)}</strong></div>
    <div className="row between muted"><span>Pago</span><Money v={conta.pago} /></div>
    <div className="row between"><strong>Falta</strong><strong data-testid="conta-falta">{brl(falta)}</strong></div>
    <ErrorBox error={parte.error ?? fechar.error} />
    {falta > 0 ? <div className="stack" style={{ marginTop: 10 }}>
      <div className="row">
        <Field label="Dividir entre"><input className="input" type="number" min={1} max={50} value={pessoas} onChange={(e) => setPessoas(Math.max(1, Number(e.target.value) || 1))} style={{ width: 90 }} aria-label="Pessoas que ainda vão pagar" /></Field>
        {pessoas > 1 && <div className="muted" data-testid="por-pessoa">{brl(porPessoa)} por pessoa</div>}
      </div>
      <div className="row">
        <Field label="Meio"><select className="input" value={meio} onChange={(e) => setMeio(e.target.value)}>{MEIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Valor"><input className="input" type="number" step="0.01" min={0.01} value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor a receber" /></Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {ultimo
          ? <button className="btn primary" disabled={fechar.busy || !(v > 0)} onClick={() => void fechar.run(true)}>Receber e fechar conta</button>
          : <button className="btn primary" disabled={parte.busy || !(v > 0)} onClick={() => void parte.run()}>Receber parte</button>}
      </div>
    </div> : <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
      <button className="btn primary" disabled={fechar.busy} onClick={() => void fechar.run(false)}>Fechar conta</button>
    </div>}
  </Card>;
}
