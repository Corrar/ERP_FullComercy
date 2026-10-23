// src/core/payments/CobrarPix.tsx — "Cobrar por Pix" de um pedido (função Cobrança online): gera o
// Pix copia e cola com o valor que falta, mostra o QR para o cliente ler no balcão e o LINK para
// mandar por WhatsApp. Quem escolhe por onde cobrar é a API: com o Mercado Pago conectado, o aviso
// do pagamento baixa o pedido sozinho (a janela fecha ao vivo); só com a chave Pix, o operador
// confirma quando o dinheiro aparecer no banco.
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { brl } from '@/lib/format';
import { ErrorBox, Modal } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useSocketEvent } from '@/lib/socket';

export const imagemDoQr = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 2000); }); }}>
    <Icon name={ok ? 'check' : 'copy'} size={16} /> {ok ? 'Copiado' : rotulo}
  </button>;
}

/** Botão + janela. Some sozinho para quem não tem a função (o plano corta a permissão). */
export function CobrarPix({ orderId, falta, onPago }: { orderId: string; falta: number; onPago: () => void | Promise<void> }) {
  const { can } = useSession();
  const [it, setIt] = useState<any | null>(null);
  const [aberto, setAberto] = useState(false);
  const gerar = useAction(async () => { setIt(await post('/payments/intents', { method: 'PIX', orderId })); });
  const fechar = useCallback(async () => { setAberto(false); setIt(null); await onPago(); }, [onPago]);
  const confirmar = useAction(async () => { await post(`/payments/intents/${it.id}/confirm`); await fechar(); });
  const [pago, setPago] = useState(false);
  // Baixa automática: o aviso do gateway chegou na API → a janela mostra e fecha.
  useSocketEvent('payment.paid', useCallback((p: { intentId: string }) => {
    if (!it || p.intentId !== it.id) return;
    setPago(true); setTimeout(() => { setPago(false); void fechar(); }, 1500);
  }, [it, fechar]));
  if (!can('core.payments:manage') || !(falta > 0.009)) return null;
  const semChave = gerar.error?.includes('chave Pix');
  const automatico = it && it.provider !== 'manual';
  return <>
    <button className="btn" onClick={() => { setAberto(true); if (!it) void gerar.run(); }}><Icon name="qr" size={16} /> Cobrar por Pix</button>
    <Modal title="Cobrar por Pix" open={aberto} onClose={() => setAberto(false)}>
      <ErrorBox error={gerar.error} />
      {semChave && <Link className="btn primary" to="/cobrancas">Configurar o Pix da empresa</Link>}
      {gerar.busy && <div className="muted">Gerando o Pix…</div>}
      {it && <div className="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{brl(it.amount)}</div>
        {it.qrSvg && <img src={imagemDoQr(it.qrSvg)} alt="QR Code do Pix" width={220} height={220} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />}
        <div className="muted small">O cliente abre o app do banco, escolhe Pix → Ler QR Code ou Pix Copia e Cola.</div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Copiar texto={it.qrCode} rotulo="Copiar Pix" />
          {it.checkoutUrl && <Copiar texto={it.checkoutUrl} rotulo="Copiar link para o cliente" />}
        </div>
        {pago ? <div className="banner info" role="status" style={{ margin: 0 }}><Icon name="check" size={16} /> Pagamento recebido — entrou no pedido.</div>
          : automatico ? <div className="muted small" role="status">Aguardando o pagamento… a baixa é automática pelo Mercado Pago (pode fechar esta janela).</div>
          : <>
            <ErrorBox error={confirmar.error} />
            <div className="faint small">Confira no extrato do banco antes de confirmar: Pix pela chave não avisa o sistema sozinho.</div>
            <button className="btn primary" onClick={() => void confirmar.run()} disabled={confirmar.busy}><Icon name="check" size={16} /> Recebi o Pix — confirmar</button>
          </>}
      </div>}
    </Modal>
  </>;
}
