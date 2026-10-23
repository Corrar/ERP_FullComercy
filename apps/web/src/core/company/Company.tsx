import { useEffect, useState } from 'react';
import { api, del, post, put } from '@/lib/api';
import { avisarMarcaMudou, contraste, estiloDaMarca, srcDoLogo, type Marca } from '@/lib/marca';
import { Icon } from '@/components/icons';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Field, Form, Toast } from '@/components/ui';

export function Company() {
  const { refresh } = useSession(); const [msg, setMsg] = useState<string | null>(null);
  const mods = useGet<any[]>('/tenant/modules'); const cfg = useGet<any>('/tenant/settings');
  const toggle = useAction(async (m: any) => { await put(`/tenant/modules/${m.key}`, { enabled: !m.enabled }); await mods.reload(); await refresh(); setMsg(`${m.name} ${m.enabled ? 'desligado' : 'ligado'}.`); });
  const salvar = useAction(async (v: Record<string, any>) => { await put('/tenant/settings', { name: v.name, document: v.document, defaultSalesModule: v.defaultSalesModule || null }); await cfg.reload(); await refresh(); setMsg('Configurações salvas.'); });
  const reverGuia = useAction(async () => { await post('/tenant/primeiros-passos/dispensar', { dispensar: false }); await cfg.reload(); setMsg('O guia de primeiros passos voltou para o painel.'); });
  return <div className="grid">
    <h1>Empresa e módulos</h1>
    <ErrorBox error={toggle.error ?? salvar.error ?? reverGuia.error} />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {mods.data?.map((m) => <Card key={m.key} title={m.name} actions={<button className={`btn ${m.enabled ? '' : 'primary'}`} onClick={() => void toggle.run(m)} disabled={toggle.busy}>{m.enabled ? 'Desligar' : 'Ligar'}</button>}><div className="muted">{m.description}</div><div style={{ marginTop: 8 }}>{m.enabled ? <span className="badge ok">ativo</span> : <span className="badge">inativo</span>}</div></Card>)}
    </div>
    {cfg.data && <Card title="Dados e preferências"><Form onSubmit={(v) => void salvar.run(v)} busy={salvar.busy}>
      <Field label="Nome"><input className="input" name="name" defaultValue={cfg.data.name} /></Field><Field label="CNPJ"><input className="input" name="document" defaultValue={cfg.data.document ?? ''} /></Field>
      <Field label="Módulo de venda padrão (desempate quando há mais de um)"><select className="input" name="defaultSalesModule" defaultValue={cfg.data.settings?.defaultSalesModule ?? ''}><option value="">— automático —</option>{mods.data?.filter((m) => m.enabled).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select></Field>
      <div className="muted">Identificador de login: <code>{cfg.data.slug}</code></div></Form></Card>}
    <MarcaDaEmpresa onMsg={setMsg} />
    {cfg.data?.settings?.primeirosPassos?.dispensadoEm && <Card title="Primeiros passos"><div className="row between"><span className="muted">O guia do painel foi dispensado.</span><button className="btn" onClick={() => void reverGuia.run()} disabled={reverGuia.busy}>Mostrar de novo</button></div></Card>}
    <Toast msg={msg} />
  </div>;
}

const LOGO_MAX = 256 * 1024;

/** Logo e cor da empresa: no menu de todos, na página de acesso da equipe e nos e-mails. */
function MarcaDaEmpresa({ onMsg }: { onMsg: (m: string) => void }) {
  const marca = useGet<Marca>('/tenant/marca');
  const [cor, setCor] = useState('#2563eb');
  const [noSistema, setNoSistema] = useState(true);
  useEffect(() => { if (marca.data) { setCor(marca.data.cor ?? '#2563eb'); setNoSistema(marca.data.cor ? !!marca.data.corNoSistema : true); } }, [marca.data]);
  const mudou = async (m: string) => { await marca.reload(); avisarMarcaMudou(); onMsg(m); };

  const enviar = useAction(async (f: File) => {
    if (f.size > LOGO_MAX) throw new Error('O logo pode ter até 256 KB. Exporte menor (uns 400 px de largura bastam).');
    await api('/tenant/marca/logo', { method: 'PUT', file: f });
    await mudou('Logo salvo.');
  });
  const remover = useAction(async () => { await del('/tenant/marca/logo'); await mudou('Logo removido.'); });
  const salvarCor = useAction(async () => { await put('/tenant/settings', { marca: { cor, corNoSistema: noSistema } }); await mudou('Cor salva.'); });
  const [copiado, setCopiado] = useState(false);

  if (!marca.data) return null;
  const link = `${window.location.origin}${marca.data.linkEquipe}`;
  const logo = srcDoLogo(marca.data);
  const clara = contraste(cor, '#ffffff') < 3;
  return <Card title="Marca da empresa">
    <div className="muted" style={{ marginBottom: 12 }}>A logo e a cor aparecem no menu do sistema para toda a equipe, na página de entrada da empresa e nos e-mails (convite, senha, boas-vindas).</div>
    <ErrorBox error={enviar.error ?? remover.error ?? salvarCor.error} />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
      <div className="stack" style={{ gap: 10 }}>
        <strong>Logo</strong>
        <div className="marca-logo-box">{logo ? <img src={logo} alt="Logo atual" data-testid="logo-atual" /> : <span className="faint small">Sem logo</span>}</div>
        <div className="row">
          <label className="btn">
            <Icon name="upload" size={16} /> {logo ? 'Trocar logo' : 'Enviar logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Arquivo do logo" disabled={enviar.busy}
              onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void enviar.run(f); }} />
          </label>
          {marca.data.logoUrl && <button className="btn" onClick={() => void remover.run()} disabled={remover.busy}>Remover</button>}
        </div>
        <div className="faint small">PNG, JPEG ou WebP até 256 KB. De preferência com fundo transparente ou branco.</div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <strong>Cor</strong>
        <div className="row">
          <input className="input" type="color" aria-label="Cor da empresa" value={cor} onChange={(e) => setCor(e.target.value)} style={{ width: 64, padding: 2 }} />
          <code>{cor}</code>
        </div>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <input type="checkbox" checked={noSistema} onChange={(e) => setNoSistema(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Usar esta cor no menu e nos botões do sistema <span className="faint small">(sem marcar, ela vale só para os e-mails e a página de entrada; o sistema segue com a cor de cada módulo)</span></span>
        </label>
        {clara && <div className="banner warn" style={{ margin: 0 }}><Icon name="alert" size={16} /><span className="grow">Cor clara: textos e links nessa cor ficam difíceis de ler no fundo branco. Prefira um tom mais escuro.</span></div>}
        <div className="row marca-previa" style={estiloDaMarca(cor, true)} aria-hidden>
          <span className="btn primary">Botão</span><span className="sb-item active" style={{ padding: '6px 12px' }}>Item do menu</span><a>Link</a>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => void salvarCor.run()} disabled={salvarCor.busy}>{salvarCor.busy ? '…' : 'Salvar cor'}</button></div>
      </div>
    </div>
    <div className="stack" style={{ gap: 6, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <strong>Link de acesso da equipe</strong>
      <div className="muted small">Mande para quem trabalha com você ou salve como favorito no computador do caixa. Abre a tela de entrada com a sua logo, já na sua empresa: a pessoa só digita e-mail e senha.</div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input grow" readOnly value={link} aria-label="Link de acesso da equipe" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }}><Icon name={copiado ? 'check' : 'copy'} size={16} /> {copiado ? 'Copiado' : 'Copiar'}</button>
        <a className="btn" href={link} target="_blank" rel="noreferrer"><Icon name="eye" size={16} /> Ver</a>
      </div>
    </div>
  </Card>;
}
