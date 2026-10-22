// src/public/Storefront.tsx — a VITRINE do cliente final: /cardapio/:tenant/:menu
// Sem login. Lê o cardápio público, monta o carrinho e faz o pedido como convidado
// (POST /public/food/pedidos/:tenant). Se a loja aceita pagamento online, mostra o QR.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { ErrorBox, Field, Money } from '@/components/ui';
import { brl } from '@/lib/format';
import { useAcompanhamento } from '@/lib/socket';

interface Linha { menuItemId: string; nome: string; preco: number; qtd: number; modifiers: { name: string; price: number }[] }

export function Storefront() {
  const { tenant, menu } = useParams(); const nav = useNavigate();
  const card = useGet<any>(`/public/food/cardapio/${tenant}/${menu}`);
  const [carrinho, setCarrinho] = useState<Linha[]>([]); const [checkout, setCheckout] = useState(false); const [tipo, setTipo] = useState<'TAKEOUT' | 'DELIVERY'>('TAKEOUT'); const [zona, setZona] = useState('');
  const total = useMemo(() => carrinho.reduce((s, l) => s + (l.preco + l.modifiers.reduce((a, m) => a + m.price, 0)) * l.qtd, 0), [carrinho]);
  const taxa = tipo === 'DELIVERY' ? Number(card.data?.zonasEntrega.find((z: any) => z.id === zona)?.fee ?? 0) : 0;
  const add = (i: any) => setCarrinho((c) => { const k = c.findIndex((x) => x.menuItemId === i.id && !x.modifiers.length); if (k >= 0) { const n = [...c]; n[k] = { ...n[k], qtd: n[k].qtd + 1 }; return n; } return [...c, { menuItemId: i.id, nome: i.nome, preco: Number(i.preco), qtd: 1, modifiers: [] }]; });
  const pedir = useAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const v = Object.fromEntries(f.entries()) as Record<string, string>;
    const r = await post(`/public/food/pedidos/${tenant}`, {
      menuSlug: menu, serviceType: tipo, cliente: { nome: v.nome, telefone: v.telefone },
      endereco: tipo === 'DELIVERY' ? { street: v.street, number: v.number, district: v.district, city: v.city, state: v.state, reference: v.reference } : undefined,
      zoneId: tipo === 'DELIVERY' && zona ? zona : undefined,
      itens: carrinho.map((l) => ({ menuItemId: l.menuItemId, quantity: l.qtd, modifiers: l.modifiers })),
      pagamentoNaEntrega: v.pagamento as never, observacoes: v.obs || undefined,
      pagarOnline: v.pagamento === 'ONLINE' ? { provider: v.provider || 'mock', method: 'PIX' } : undefined,
    });
    sessionStorage.setItem(`fc.pedido.${r.number}`, JSON.stringify({ telefone: v.telefone, pagamento: r.pagamento ?? null }));
    nav(`/pedido/${tenant}/${r.number}?tel=${encodeURIComponent(v.telefone)}`);
  });
  if (card.error) return <div className="login"><div className="card">Cardápio não encontrado ou fora do ar.</div></div>;
  if (!card.data) return <div className="login"><div className="muted">Carregando…</div></div>;
  const c = card.data;
  return <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
    <header className="row between" style={{ padding: '8px 0 16px' }}><div><h1 style={{ margin: 0 }}>{c.loja.nome}</h1><div className="muted">{c.menu.name} · {c.menu.abertoAgora ? <span className="badge ok">aberto</span> : <span className="badge danger">fechado agora</span>}</div></div>
      <button className="btn primary" onClick={() => setCheckout(true)} disabled={!carrinho.length}>Carrinho ({carrinho.reduce((s, l) => s + l.qtd, 0)}) · {brl(total)}</button></header>
    {c.categorias.map((cat: any) => <section key={cat.id} style={{ marginBottom: 20 }}><h2>{cat.name}</h2><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {cat.itens.map((i: any) => <div key={i.id} className="card row between"><div style={{ flex: 1 }}>{i.imagem && <img src={i.imagem} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 6 }} />}<strong>{i.nome}</strong>{i.descricao && <div className="muted">{i.descricao}</div>}<div className="mono" style={{ marginTop: 4 }}>{brl(i.preco)}</div></div><button className="btn primary" onClick={() => add(i)} disabled={!c.menu.abertoAgora}>+</button></div>)}</div></section>)}
    {checkout && <div className="modal-bg" onClick={() => setCheckout(false)}><form className="modal grid" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => void pedir.run(e)}>
      <h2 style={{ margin: 0 }}>Seu pedido</h2>
      {carrinho.map((l, k) => <div key={k} className="row between"><span>{l.qtd}× {l.nome}</span><span className="row"><Money v={l.preco * l.qtd} /><button type="button" className="btn" onClick={() => setCarrinho((cc) => cc.filter((_, j) => j !== k))}>✕</button></span></div>)}
      <div className="row"><button type="button" className={`btn ${tipo === 'TAKEOUT' ? 'primary' : ''}`} onClick={() => setTipo('TAKEOUT')}>Retirar</button><button type="button" className={`btn ${tipo === 'DELIVERY' ? 'primary' : ''}`} onClick={() => setTipo('DELIVERY')} disabled={!c.zonasEntrega.length}>Entrega</button></div>
      <div className="row"><Field label="Seu nome"><input className="input" name="nome" required /></Field><Field label="WhatsApp"><input className="input" name="telefone" required placeholder="11 99999-0000" /></Field></div>
      {tipo === 'DELIVERY' && <>
        <Field label="Região"><select className="input" value={zona} onChange={(e) => setZona(e.target.value)} required><option value="">escolha</option>{c.zonasEntrega.map((z: any) => <option key={z.id} value={z.id}>{z.name} · {brl(z.fee)}{z.etaMin ? ` · ~${z.etaMin} min` : ''}</option>)}</select></Field>
        <div className="row"><Field label="Rua"><input className="input" name="street" required /></Field><Field label="Nº"><input className="input" name="number" /></Field></div>
        <div className="row"><Field label="Bairro"><input className="input" name="district" /></Field><Field label="Cidade"><input className="input" name="city" required /></Field><Field label="UF"><input className="input" name="state" maxLength={2} required /></Field></div>
        <Field label="Referência"><input className="input" name="reference" /></Field></>}
      <Field label="Pagamento"><select className="input" name="pagamento" defaultValue="PIX"><option value="PIX">PIX na {tipo === 'DELIVERY' ? 'entrega' : 'retirada'}</option><option value="CASH">Dinheiro</option><option value="DEBIT">Débito</option><option value="CREDIT">Crédito</option><option value="ONLINE">Pagar agora (PIX online)</option></select></Field>
      <input type="hidden" name="provider" value="mock" />
      <Field label="Observações"><input className="input" name="obs" /></Field>
      <div className="row between"><span className="muted">Itens {brl(total)}{taxa ? ` + entrega ${brl(taxa)}` : ''}</span><strong>Total {brl(total + taxa)}</strong></div>
      <ErrorBox error={pedir.error} />
      <button className="btn primary" disabled={pedir.busy || !carrinho.length}>Confirmar pedido</button>
    </form></div>}
    <footer className="muted" style={{ textAlign: 'center', padding: 24, fontSize: 12 }}>Pedidos por FullComercy</footer>
  </div>;
}

/** /pedido/:tenant/:numero?tel= — acompanhamento público. */
export function OrderTracking() {
  const { tenant, numero } = useParams(); const tel = new URLSearchParams(location.search).get('tel') ?? '';
  const t = useGet<any>(`/public/food/pedidos/${tenant}/${numero}`, { telefone: tel });
  // Tempo real: a cozinha/entrega mexeu no pedido → relê (o GET segue exigindo o telefone).
  // O token vem novo a cada leitura; fica o primeiro, senão cada atualização reabriria a conexão.
  const [track, setTrack] = useState<string>(); useEffect(() => { if (t.data?.trackToken) setTrack((x) => x ?? t.data.trackToken); }, [t.data]);
  const { reload } = t; useAcompanhamento(track, useCallback(() => { void reload(); }, [reload]));
  const guardado = (() => { try { return JSON.parse(sessionStorage.getItem(`fc.pedido.${numero}`) ?? 'null'); } catch { return null; } })();
  const passos = ['OPEN', 'IN_PROGRESS', 'READY', 'COMPLETED'];
  const idx = t.data ? Math.max(passos.indexOf(t.data.status), t.data.cozinha === 'PREPARING' ? 1 : t.data.cozinha === 'READY' ? 2 : 0) : 0;
  return <div className="login"><div className="card" style={{ width: 460 }}>
    <h1 style={{ margin: 0 }}>Pedido #{numero}</h1>
    {t.error && <div className="muted">{t.error}</div>}
    {t.data && <>
      <div className="row" style={{ margin: '12px 0' }}>{['Recebido', 'Preparando', 'Pronto', t.data.entrega ? 'Entregue' : 'Retirado'].map((p, i) => <span key={p} className={`badge ${i <= idx ? 'ok' : ''}`}>{p}</span>)}</div>
      {t.data.entrega && <div>Entrega: <strong>{t.data.entrega.status}</strong>{t.data.entrega.courier && ` · ${t.data.entrega.courier.name}`}</div>}
      <div style={{ marginTop: 8 }}>Total <strong><Money v={t.data.total} /></strong></div>
      {guardado?.pagamento?.qrCode && t.data.status !== 'COMPLETED' && <div className="card" style={{ marginTop: 12 }}><strong>Pague agora (PIX)</strong><div className="mono" style={{ wordBreak: 'break-all', fontSize: 12, marginTop: 6 }}>{guardado.pagamento.qrCode}</div><button className="btn" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(guardado.pagamento.qrCode)}>Copiar código</button></div>}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => void t.reload()}>Atualizar</button>
    </>}
  </div></div>;
}
