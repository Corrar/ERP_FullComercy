import { useEffect, useState } from 'react';
import { patch, post, put } from '@/lib/api';
import { EscolherProduto, type VarianteMin } from '@/components/EscolherProduto';
import { useAction, useGet } from '@/lib/use-api';
import { Card, ErrorBox, Field, Form, Modal, Money, Table } from '@/components/ui';
import { useSession } from '@/lib/session';

export function Cardapio() {
  const { s } = useSession(); const menus = useGet<any[]>('/m/food/menus'); const [sel, setSel] = useState('');
  // Abre já no primeiro cardápio (quase sempre há um só).
  useEffect(() => { if (!sel && menus.data?.length) setSel(menus.data[0].id); }, [sel, menus.data]);
  const menu = useGet<any>(sel ? `/m/food/menus/${sel}` : null); const produtos = useGet<any[]>('/products');
  const [ficha, setFicha] = useState<any | null>(null); const [adic, setAdic] = useState<any | null>(null); const grupos = useGet<any[]>('/m/food/adicionais'); const [novoGrupo, setNovoGrupo] = useState(false);
  const [novoMenu, setNovoMenu] = useState(false); const [novoItem, setNovoItem] = useState(false); const [novaCat, setNovaCat] = useState(false);
  // O endereço do cardápio online sai do nome ("Almoço Executivo" → almoco-executivo) se ficar vazio.
  const criarMenu = useAction(async (v: Record<string, any>) => { const slug = v.slug || String(v.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); const m = await post('/m/food/menus', { ...v, slug }); setNovoMenu(false); await menus.reload(); setSel(m.id); });
  const criarCat = useAction(async (v: Record<string, any>) => { await post(`/m/food/menus/${sel}/categorias`, v); setNovaCat(false); await menu.reload(); });
  const criarItem = useAction(async (v: Record<string, any>) => { await post(`/m/food/menus/${sel}/itens`, v); setNovoItem(false); await menu.reload(); });
  const publicar = useAction(async () => { await patch(`/m/food/menus/${sel}`, { isPublished: !menu.data.isPublished }); await menu.reload(); });
  const disponivel = useAction(async (i: any) => { await patch(`/m/food/menus/${sel}/itens/${i.id}`, { isAvailable: !i.isAvailable }); await menu.reload(); });
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Cardápio</h1><div className="row"><select className="input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: 240 }}><option value="">escolha</option>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="btn primary" onClick={() => setNovoMenu(true)}>Novo cardápio</button></div></div>
    <ErrorBox error={publicar.error ?? disponivel.error} />
    {menus.data && !menus.data.length && <div className="empty">Nenhum cardápio ainda. Crie o primeiro em <strong>Novo cardápio</strong>: depois, categorias (Lanches, Bebidas…) e os pratos com preço.</div>}
    {menu.data && <Card title={menu.data.name} actions={<><button className="btn" onClick={() => setNovaCat(true)}>Categoria</button><button className="btn" onClick={() => setNovoItem(true)}>Item</button><button className={`btn ${menu.data.isPublished ? '' : 'primary'}`} onClick={() => void publicar.run()}>{menu.data.isPublished ? 'Despublicar' : 'Publicar online'}</button></>}>
      {menu.data.isPublished && <div className="muted" style={{ marginBottom: 8 }}>Link público: <code>/cardapio/{s?.tenant.slug}/{menu.data.slug}</code> (API: <code>/public/food/cardapio/{s?.tenant.slug}/{menu.data.slug}</code>)</div>}
      {menu.data.categories.map((c: any) => <div key={c.id}><h2>{c.name}</h2>{c.items.map((i: any) => <div key={i.id} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}><span>{i.displayName} <span className="muted">{i.variant.sku} · {i.station}</span></span><span className="row"><Money v={i.price} /><button className="btn" onClick={() => setFicha(i)}>Ficha</button><button className="btn" onClick={() => setAdic(i)}>Adicionais{i.modifierGroups?.length ? ` (${i.modifierGroups.length})` : ''}</button><button className="btn" onClick={() => void disponivel.run(i)}>{i.isAvailable ? 'Esgotar' : 'Disponível'}</button></span></div>)}</div>)}
      {!menu.data.categories.length && <div className="empty">Crie uma categoria e adicione itens.</div>}</Card>}
    <Card title="Grupos de adicionais" actions={<button className="btn" onClick={() => setNovoGrupo(true)}>Novo grupo</button>}>
      <Table rows={grupos.data} empty="Nenhum grupo (ex.: Ponto da carne, Extras)." cols={[{ h: 'Grupo', c: (g) => g.name }, { h: 'Escolha', c: (g) => `${g.minSelect ?? 0} a ${g.maxSelect ?? '∞'}` }, { h: 'Opções', c: (g) => g.modifiers.map((m: any) => `${m.name}${Number(m.price) ? ` +${Number(m.price).toFixed(2)}` : ''}`).join(', ') }]} /></Card>
    <Modal title={`Ficha técnica · ${ficha?.displayName ?? ''}`} open={!!ficha} onClose={() => setFicha(null)} wide>{ficha && <FichaTecnica menuId={sel} item={ficha} />}</Modal>
    <Modal title={`Adicionais · ${adic?.displayName ?? ''}`} open={!!adic} onClose={() => setAdic(null)}>{adic && <Adicionais menuId={sel} item={adic} grupos={grupos.data ?? []} onDone={async () => { setAdic(null); await menu.reload(); }} />}</Modal>
    <Modal title="Novo grupo de adicionais" open={novoGrupo} onClose={() => setNovoGrupo(false)}>{novoGrupo && <NovoGrupo onDone={async () => { setNovoGrupo(false); await grupos.reload(); }} />}</Modal>
    <Modal title="Novo cardápio" open={novoMenu} onClose={() => setNovoMenu(false)}><ErrorBox error={criarMenu.error} /><Form onSubmit={(v) => void criarMenu.run(v)} busy={criarMenu.busy}><Field label="Nome"><input className="input" name="name" required /></Field><Field label="Endereço online (opcional)"><input className="input" name="slug" pattern="[a-z0-9-]{2,60}" placeholder="sai do nome: almoco-executivo" /></Field></Form></Modal>
    <Modal title="Nova categoria" open={novaCat} onClose={() => setNovaCat(false)}><ErrorBox error={criarCat.error} /><Form onSubmit={(v) => void criarCat.run(v)} busy={criarCat.busy}><Field label="Nome"><input className="input" name="name" required /></Field></Form></Modal>
    <Modal title="Novo item" open={novoItem} onClose={() => setNovoItem(false)}><ErrorBox error={criarItem.error} /><Form onSubmit={(v) => void criarItem.run(v)} busy={criarItem.busy}>
      <Field label="Categoria"><select className="input" name="categoryId">{menu.data?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Produto"><select className="input" name="variantId"><option value="">Novo: criar o produto com o nome do prato</option>{produtos.data?.flatMap((p) => p.variants.map((v: any) => <option key={v.id} value={v.id}>{p.name}{v.name ? ` · ${v.name}` : ''}</option>))}</select></Field>
      <Field label="Nome no cardápio"><input className="input" name="displayName" required /></Field><Field label="Preço"><input className="input" name="price" type="number" step="0.01" required /></Field><Field label="Estação"><input className="input" name="station" defaultValue="COZINHA" /></Field></Form></Modal>
  </div>;
}

/** Ficha técnica: insumos (produto do estoque) por porção. A cozinha baixa os insumos ao concluir o
 *  prato; o CMV teórico sai do custo médio de cada insumo. */
function FichaTecnica({ menuId, item }: { menuId: string; item: any }) {
  const base = `/m/food/menus/${menuId}/itens/${item.id}/ficha`;
  const f = useGet<any>(base);
  const [linhas, setLinhas] = useState<{ id: string; nome: string; unidade: string; quantity: number }[] | null>(null);
  const [novo, setNovo] = useState<VarianteMin | null>(null);
  const atuais = linhas ?? (f.data?.ficha ?? []).map((x: any) => ({ id: x.ingredientVariantId, nome: x.ingredient.product.name, unidade: x.ingredient.product.unit ?? 'un', quantity: Number(x.quantity) }));
  const salvar = useAction(async () => { await put(base, { insumos: atuais.map((l: any) => ({ ingredientVariantId: l.id, quantity: l.quantity })) }); setLinhas(null); await f.reload(); });
  return <div className="grid" style={{ gap: 12 }}>
    {f.data && <div className="row" style={{ gap: 24 }}><span>CMV <strong><Money v={f.data.cmv.custo} /></strong></span><span>Preço <strong><Money v={f.data.cmv.preco} /></strong></span><span>Margem <strong>{f.data.cmv.margem === null ? '—' : `${f.data.cmv.margem}%`}</strong></span></div>}
    <table className="table"><thead><tr><th>Insumo</th><th className="right">Qtd por porção</th><th /></tr></thead><tbody>
      {atuais.map((l: any, i: number) => <tr key={l.id}><td>{l.nome}</td><td className="right"><input className="input" type="number" min={0.0001} step="0.0001" value={l.quantity} style={{ width: 110 }} aria-label={`Quantidade ${l.nome}`} onChange={(e) => setLinhas(atuais.map((x: any, j: number) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} /> <span className="muted">{l.unidade}</span></td><td><button className="btn" onClick={() => setLinhas(atuais.filter((_: any, j: number) => j !== i))}>✕</button></td></tr>)}
      {!atuais.length && <tr><td colSpan={3} className="muted">Sem insumos: o prato não baixa estoque.</td></tr>}</tbody></table>
    <div className="row" style={{ alignItems: 'flex-end' }}><div className="grow"><EscolherProduto value={novo} onChange={setNovo} rotulo="Adicionar insumo" /></div><button className="btn" disabled={!novo} onClick={() => { if (novo) { setLinhas([...atuais.filter((x: any) => x.id !== novo.id), { id: novo.id, nome: novo.nome, unidade: '', quantity: 1 }]); setNovo(null); } }}>Adicionar</button></div>
    <ErrorBox error={salvar.error ?? f.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy || !linhas} onClick={() => void salvar.run()}>Salvar ficha</button></div>
  </div>;
}

function Adicionais({ menuId, item, grupos, onDone }: { menuId: string; item: any; grupos: any[]; onDone: () => void }) {
  const ligados = new Set((item.modifierGroups ?? []).map((m: any) => m.groupId ?? m.group?.id));
  const [g, setG] = useState('');
  const ligar = useAction(async () => { if (!g) throw new Error('Escolha o grupo.'); await post(`/m/food/menus/${menuId}/itens/${item.id}/adicionais`, { groupId: g }); onDone(); });
  return <div className="grid" style={{ gap: 12 }}>
    <div>{item.modifierGroups?.length ? item.modifierGroups.map((m: any) => <div key={m.group.id}>• {m.group.name}</div>) : <span className="muted">Nenhum grupo ligado.</span>}</div>
    <Field label="Ligar grupo"><select className="input" value={g} onChange={(e) => setG(e.target.value)}><option value="">Escolha…</option>{grupos.filter((x) => !ligados.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    <ErrorBox error={ligar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={ligar.busy} onClick={() => void ligar.run()}>Ligar</button></div>
  </div>;
}

/** Opções uma por linha: "Bacon; 4,00" (preço opcional). */
function NovoGrupo({ onDone }: { onDone: () => void }) {
  const criar = useAction(async (v: Record<string, any>) => {
    const modifiers = String(v.opcoes ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, preco] = l.split(';').map((x) => x.trim()); return { name, price: preco ? Number(preco.replace(',', '.')) : 0 }; });
    if (!modifiers.length) throw new Error('Informe ao menos uma opção.');
    await post('/m/food/adicionais', { name: v.name, minSelect: v.minSelect, maxSelect: v.maxSelect, modifiers }); onDone();
  });
  return <><ErrorBox error={criar.error} /><Form onSubmit={(v) => void criar.run(v)} busy={criar.busy}>
    <Field label="Nome do grupo"><input className="input" name="name" required placeholder="Extras, Ponto da carne…" /></Field>
    <div className="row"><Field label="Mínimo"><input className="input" name="minSelect" type="number" min={0} defaultValue={0} /></Field><Field label="Máximo"><input className="input" name="maxSelect" type="number" min={1} defaultValue={3} /></Field></div>
    <Field label="Opções (uma por linha: nome; preço)"><textarea className="input" name="opcoes" rows={5} placeholder={'Bacon; 4,00\nCheddar; 3,50\nSem cebola'} /></Field></Form></>;
}
