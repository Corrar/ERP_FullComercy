// Recibo da consulta para imprimir (o navegador gera o PDF em "Salvar como PDF").
import { useParams } from 'react-router-dom';
import { useGet } from '@/lib/use-api';
import { Card, ErrorBox } from '@/components/ui';
import { brl, d, num } from '@/lib/format';

export function Recibo() {
  const { orderId } = useParams(); const r = useGet<any>(`/m/clinica/recibos/${orderId}`);
  if (!r.data) return <Card><ErrorBox error={r.error} />{!r.error && 'Carregando…'}</Card>;
  const x = r.data;
  return <div className="grid">
    <div className="row between no-print"><h1 style={{ margin: 0 }}>Recibo</h1><button className="btn primary" onClick={() => window.print()}>Imprimir / salvar PDF</button></div>
    <Card className="recibo">
      <h2 style={{ marginTop: 0 }}>{x.clinica?.name}</h2>{x.clinica?.document && <div className="muted">CNPJ/CPF {x.clinica.document}</div>}
      <p style={{ marginTop: 16 }}>Recebi de <strong>{x.paciente?.name}</strong>{x.paciente?.document ? ` (CPF ${x.paciente.document})` : ''} a importância de <strong>{brl(x.pago)}</strong>{x.pagador === 'CONVENIO' ? `, por meio do convênio ${x.convenio}` : ''}, referente a:</p>
      <table className="table"><tbody>{x.itens.map((i: any, k: number) => <tr key={k}><td>{i.descricao}</td><td className="right">{num(i.quantidade)}</td><td className="right">{brl(i.total)}</td></tr>)}</tbody></table>
      <p>Atendimento em {d(x.data)}{x.profissional ? ` por ${x.profissional.nome}${x.profissional.especialidade ? `, ${x.profissional.especialidade}` : ''}${x.profissional.registro ? ` — ${x.profissional.registro}` : ''}` : ''}.</p>
      {Number(x.pago) < Number(x.total) && <p className="muted">Total {brl(x.total)}; em aberto {brl(Number(x.total) - Number(x.pago))}.</p>}
      <p className="muted">Recibo nº {x.numero} · emitido em {d(x.emitidoEm)}</p>
      <div style={{ marginTop: 48, borderTop: '1px solid var(--line)', width: 280, paddingTop: 6 }}>{x.profissional?.nome ?? x.clinica?.name}</div>
    </Card>
  </div>;
}
