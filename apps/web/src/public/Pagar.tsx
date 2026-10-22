// src/public/Pagar.tsx — /pagar/:token: o LINK DE PAGAMENTO que a empresa manda ao cliente (WhatsApp,
// e-mail). Sem login: mostra a marca da empresa, o valor e o Pix (QR + copia e cola). Depois de pago,
// cancelado ou vencido, o Pix some — a API já não manda.
import { useParams } from 'react-router-dom';
import { useGet } from '@/lib/use-api';
import { estiloDaMarca, srcDoLogo } from '@/lib/marca';
import { brl, dt } from '@/lib/format';
import { Copiar, imagemDoQr } from '@/core/payments/CobrarPix';
import { Icon } from '@/components/icons';

const SITUACAO: Record<string, string> = { PAID: 'Pagamento confirmado. Obrigado!', CANCELLED: 'Esta cobrança foi cancelada.', EXPIRED: 'Esta cobrança venceu. Peça um novo link.', FAILED: 'O pagamento não foi aprovado. Peça um novo link.' };

export function Pagar() {
  const { token = '' } = useParams();
  const p = useGet<any>(`/public/payments/link/${encodeURIComponent(token)}`);
  const m = p.data?.empresa;
  const logo = srcDoLogo(m);
  return <div className="login" style={estiloDaMarca(m?.cor, true)}><div className="card stack" style={{ width: 420, maxWidth: '100%', textAlign: 'center', justifyItems: 'center' }}>
    {p.error && <><h1 style={{ margin: 0 }}>Link inválido</h1><div className="muted">Este link de pagamento não existe ou expirou. Peça um novo a quem enviou.</div></>}
    {p.data && <>
      {logo ? <img className="auth-logo" src={logo} alt={`Logo de ${m.nome}`} /> : <strong>{m.nome}</strong>}
      <div className="muted">{logo ? `${m.nome} · ` : ''}{p.data.descricao}</div>
      <div style={{ fontSize: 34, fontWeight: 800 }}>{brl(p.data.valor)}</div>
      {p.data.pix ? <>
        {p.data.qrSvg && <img src={imagemDoQr(p.data.qrSvg)} alt="QR Code do Pix" width={240} height={240} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />}
        <div className="muted small">Abra o app do seu banco e escolha <strong>Pix → Ler QR Code</strong>. No celular, use <strong>Pix Copia e Cola</strong>:</div>
        <div className="mono" style={{ wordBreak: 'break-all', fontSize: 11, background: 'var(--hover)', padding: 10, borderRadius: 10, textAlign: 'left' }}>{p.data.pix}</div>
        <Copiar texto={p.data.pix} rotulo="Copiar código Pix" />
        <div className="faint small">{p.data.baixaAutomatica ? 'O pagamento é reconhecido na hora.' : 'Depois de pagar, a empresa confirma o recebimento.'}{p.data.expiraEm ? ` Vence em ${dt(p.data.expiraEm)}.` : ''}</div>
        <button className="btn" onClick={() => void p.reload()}><Icon name="refresh" size={16} /> Já paguei — atualizar</button>
      </> : <div className={`banner ${p.data.status === 'PAID' ? 'info' : 'warn'}`} style={{ margin: 0 }}>{SITUACAO[p.data.status] ?? p.data.status}{p.data.pagoEm ? ` (${dt(p.data.pagoEm)})` : ''}</div>}
    </>}
    {!p.data && !p.error && <div className="muted">Carregando…</div>}
  </div></div>;
}
