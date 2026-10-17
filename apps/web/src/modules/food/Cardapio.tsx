import { useState } from 'react';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Money } from '@/components/ui';
import { useSession } from '@/lib/session';

export function Cardapio() {
  const { s } = useSession(); const menus = useGet<any[]>('/m/food/menus'); const [sel, setSel] = useState('');
  const menu = useGet<any>(sel ? `/m/food/menus/${sel}` : null); const produtos = useGet<any[]>('/products');
  const [novoMenu, setNovoMenu] = useState(false); const [novoItem, setNovoItem] = useState(false); const [novaCat, setNovaCat] = useState(false);
  const criarMenu = useAction(async (v: Record<string, any>) => { const m = await post('/m/food/menus', v); setNovoMenu(false); await menus.reload(); setSel(m.id); });
  const criarCat = useAction(async (v: Record<string, any>) => { await post(`/m/food/menus/${sel}/categorias`, v); setNovaCat(false); await menu.reload(); });
  const criarItem = useAction(async (v: Record<string, any>) => { await post(`/m/food/menus/${sel}/itens`, v); setNovoItem(false); await menu.reload(); });
  const publicar = useAction(async () => { await patch(`/m/food/menus/${sel}`, { isPublished: !menu.data.isPublished }); await menu.reload(); });
  const disponivel = useAction(async (i: any) => { await patch(`/m/food/menus/${sel}/itens/${i.id}`, { isAvailable: !i.isAvailable }); await menu.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Cardápio</h1><div className="row"><select className="input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: 240 }}><option value="">escolha</option>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="btn primary" onClick={() => setNovoMenu(true)}>Novo cardápio</button></div></div>
    <ErrorBox error={publicar.error ?? disponivel.error} />
    {menu.data && <Card title={menu.data.name} actions={<><button className="btn" onClick={() => setNovaCat(true)}>Categoria</button><button className="btn" onClick={() => setNovoItem(true)}>Item</button><button className={`btn ${menu.data.isPublished ? '' : 'primary'}`} onClick={() => void publicar.run()}>{menu.data.isPublished ? 'Despublicar' : 'Publicar online'}</button></>}>
      {menu.data.isPublished && <div className="muted" style={{ marginBottom: 8 }}>Link público: <code>/cardapio/{s?.tenant.slug}/{menu.data.slug}</code> (API: <code>/public/food/cardapio/{s?.tenant.slug}/{menu.data.slug}</code>)</div>}
      {menu.data.categories.map((c: any) => <div key={c.id}><h2>{c.name}</h2>{c.items.map((i: any) => <div key={i.id} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}><span>{i.displayName} <span className="muted">{i.variant.sku} · {i.station}</span></span><span className="row"><Money v={i.price} /><button className="btn" onClick={() => void disponivel.run(i)}>{i.isAvailable ? 'Esgotar' : 'Disponível'}</button></span></div>)}</div>)}
      {!menu.data.categories.length && <div className="empty">Crie uma categoria e adicione itens.</div>}</Card>}
    <Modal title="Novo cardápio" open={novoMenu} onClose={() => setNovoMenu(false)}><ErrorBox error={criarMenu.error} /><Form onSubmit={(v) => void criarMenu.run(v)} busy={criarMenu.busy}><Field label="Nome"><input className="input" name="name" required /></Field><Field label="Slug (URL)"><input className="input" name="slug" pattern="[a-z0-9-]{2,60}" required /></Field></Form></Modal>
    <Modal title="Nova categoria" open={novaCat} onClose={() => setNovaCat(false)}><ErrorBox error={criarCat.error} /><Form onSubmit={(v) => void criarCat.run(v)} busy={criarCat.busy}><Field label="Nome"><input className="input" name="name" required /></Field></Form></Modal>
    <Modal title="Novo item" open={novoItem} onClose={() => setNovoItem(false)}><ErrorBox error={criarItem.error} /><Form onSubmit={(v) => void criarItem.run(v)} busy={criarItem.busy}>
      <Field label="Categoria"><select className="input" name="categoryId">{menu.data?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Produto (variante)"><select className="input" name="variantId" required>{produtos.data?.flatMap((p) => p.variants.map((v: any) => <option key={v.id} value={v.id}>{p.name}{v.name ? ` · ${v.name}` : ''}</option>))}</select></Field>
      <Field label="Nome no cardápio"><input className="input" name="displayName" required /></Field><Field label="Preço"><input className="input" name="price" type="number" step="0.01" required /></Field><Field label="Estação"><input className="input" name="station" defaultValue="COZINHA" /></Field></Form></Modal>
  </div>;
}
