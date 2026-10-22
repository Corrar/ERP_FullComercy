// Primeiros passos: a ENTREGA do sistema a quem comprou. Roteiro curto por módulo contratado; cada
// passo já vem marcado pela API olhando os dados da empresa (cadastrou produto? abriu caixa?).
// Só para quem administra a empresa; some quando tudo está feito ou o dono dispensa.
import { Link } from 'react-router-dom';
import { post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Card, ErrorBox } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Passo { key: string; modulo: string; titulo: string; descricao: string; rota: string; permissao: string; feito: boolean }
const MOD: Record<string, string> = { CORE: 'Empresa', VAREJO: 'Varejo', FOOD: 'Food', ACADEMIA: 'Academia', SERVICOS: 'Serviços', BELEZA: 'Beleza', PET: 'Pet', CLINICA: 'Clínica', HOTEL: 'Hotelaria' };

export function PrimeirosPassos() {
  const { can } = useSession(); const dono = can('core.tenant:manage');
  const r = useGet<{ dispensado: boolean; passos: Passo[] }>(dono ? '/tenant/primeiros-passos' : null);
  const dispensar = useAction(async () => { await post('/tenant/primeiros-passos/dispensar', { dispensar: true }); await r.reload(); });
  if (!r.data || r.data.dispensado) return null;
  // Só o que esta pessoa pode fazer — o plano já cortou as permissões do que não foi contratado.
  const passos = r.data.passos.filter((p) => can(p.permissao));
  const feitos = passos.filter((p) => p.feito).length;
  if (!passos.length || feitos === passos.length) return null;
  const proximo = passos.find((p) => !p.feito);
  return <Card title="Primeiros passos" actions={<button className="btn" onClick={() => void dispensar.run()} disabled={dispensar.busy}>Não mostrar mais</button>}>
    <ErrorBox error={dispensar.error} />
    <div className="passos-topo"><span>Seu sistema está pronto. Faltam <b>{passos.length - feitos}</b> de {passos.length} passos para começar a usar.</span>
      <div className="passos-barra" role="progressbar" aria-valuemin={0} aria-valuemax={passos.length} aria-valuenow={feitos} aria-label="Primeiros passos concluídos"><span style={{ width: `${(feitos / passos.length) * 100}%` }} /></div></div>
    <ol className="passos">{passos.map((p, i) => <li key={p.key} className={p.feito ? 'feito' : p === proximo ? 'proximo' : ''} data-passo={p.key}>
      <span className="passo-num" aria-hidden>{p.feito ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
      <div className="passo-texto"><strong>{p.titulo}</strong> <span className="badge">{MOD[p.modulo] ?? p.modulo}</span><div className="muted">{p.descricao}</div></div>
      {p.feito ? <span className="muted small">Feito</span> : <Link className={`btn ${p === proximo ? 'primary' : ''}`} to={p.rota}>Fazer agora</Link>}
    </li>)}</ol>
  </Card>;
}
