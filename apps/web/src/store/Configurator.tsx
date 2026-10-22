// src/store/Configurator.tsx — "monte o seu ERP": as funções do módulo + núcleo, cada uma com
// preço e interruptor, e o total do SERVIDOR ao lado (no celular, numa barra fixa embaixo).
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorBox, Steps } from '@/components/ui';
import { cart, useCart } from '@/lib/cart';
import { useAccount } from '@/lib/account';
import { useCatalog, useQuote } from '@/lib/billing';
import { BackLink, FeatureList, MobileBar, slugToModule, StoreLayout, Summary } from './shared';

export function Configurator() {
  const { modulo } = useParams();
  const m = slugToModule(modulo);
  const { data: catalog, error } = useCatalog();
  const c = useCart();
  const account = useAccount();
  const nav = useNavigate();
  useEffect(() => { if (m) cart.chooseModule(m); }, [m]);
  const { quote, error: qErr } = useQuote(c);
  if (!m) return <Navigate to="/comecar" replace />;
  const off = catalog?.modules.find((x) => x.key === m);
  const trial = account ? account.account.trialAvailable : true;

  const actions = <>
    <button className="btn primary lg block" onClick={() => nav('/carrinho')} disabled={!quote}><Icon name="cart" /> Ir para o carrinho</button>
    <button className="btn lg block" onClick={() => nav('/previa')} disabled={!quote}><Icon name="eye" /> Visualizar meu ERP</button>
  </>;

  return (
    <StoreLayout module={m} step={<Steps current={1} />}>
      <div className="row between" style={{ marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <BackLink to="/comecar">Trocar de comércio</BackLink>
          <h1 style={{ margin: 0 }}>Monte o seu ERP de {off?.name ?? '…'}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Ligue as funções que você quer. O essencial já vem marcado; o valor atualiza na hora.</p>
        </div>
      </div>
      <ErrorBox error={error ?? qErr} />
      {!catalog ? <div className="stack">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 76 }} />)}</div> : (
        <div className="cfg">
          <FeatureList catalog={catalog} modules={[m]} quote={quote} selected={c.features} onToggle={(k) => cart.toggle(k)} />
          <Summary catalog={catalog} quote={quote} trialAvailable={trial} actions={actions} />
        </div>
      )}
      <MobileBar quote={quote}>
        <button className="btn icon lg" onClick={() => nav('/previa')} aria-label="Visualizar meu ERP" disabled={!quote}><Icon name="eye" /></button>
        <button className="btn primary lg" onClick={() => nav('/carrinho')} disabled={!quote}>Carrinho <Icon name="arrowRight" /></button>
      </MobileBar>
    </StoreLayout>
  );
}
