// Agenda do salão: o dia de cada profissional. "Atender" abre a comanda (POST /orders com o
// serviço do horário); se a cliente tem pacote daquele serviço, dá para usar uma sessão.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { Badge, Card, ErrorBox, Field, Modal } from '@/components/ui';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { brl, hhmm } from '@/lib/format';

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const diaLocal = (d: string) => ({ from: new Date(`${d}T00:00:00`).toISOString(), to: new Date(new Date(`${d}T00:00:00`).getTime() + 86400000).toISOString() });

export function Agenda() {
  const nav = useNavigate(); const { can } = useSession();
  const [dia, setDia] = useState(hojeISO()); const [novo, setNovo] = useState(false); const [atender, setAtender] = useState<any | null>(null);
  const ag = useGet<any[]>('/m/beleza/agenda', diaLocal(dia));
  const profs = useGet<any[]>('/m/beleza/profissionais'); const servs = useGet<any[]>('/m/beleza/servicos');
  const mudar = useAction(async (id: string, status: string) => { await patch(`/m/beleza/agenda/${id}`, { status }); await ag.reload(); });
  const ativos = (profs.data ?? []).filter((p) => p.isActive);
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Agenda do salão</h1>
      <div className="row"><input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia" /><button className="btn primary" onClick={() => setNovo(true)}>Agendar</button></div></div>
    <ErrorBox error={ag.error ?? mudar.error} />
    {!ativos.length && <Card><div className="muted">Cadastre profissionais e serviços em <a href="/beleza/cadastros">Cadastros</a> para começar a agenda.</div></Card>}
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, 260px), 1fr))` }}>
      {ativos.map((p) => {
        const doDia = (ag.data ?? []).filter((a) => a.professionalId === p.id);
        return <Card key={p.id} title={p.name}>
          {!doDia.length && <div className="muted">Livre o dia todo.</div>}
          {doDia.map((a) => <div key={a.id} className="card" style={{ padding: 10, marginBottom: 8, borderLeft: `4px solid ${p.color ?? 'var(--accent)'}` }}>
            <div className="row between"><strong>{hhmm(a.startsAt)}–{hhmm(a.endsAt)}</strong><Badge s={a.status} /></div>
            <div>{a.customer.name}</div><div className="muted">{a.service.name} · {brl(a.service.price)}</div>
            {['SCHEDULED', 'CONFIRMED'].includes(a.status) && <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => setAtender(a)}>Atender</button>
              {a.status === 'SCHEDULED' && <button className="btn" onClick={() => void mudar.run(a.id, 'CONFIRMED')}>Confirmar</button>}
              <button className="btn" onClick={() => void mudar.run(a.id, 'NO_SHOW')}>Faltou</button>
              <button className="btn danger" onClick={() => void mudar.run(a.id, 'CANCELLED')}>Cancelar</button></div>}
            {a.orderId && <button className="btn" style={{ marginTop: 6 }} onClick={() => nav(`/beleza/comandas?o=${a.orderId}`)}>Ver comanda</button>}
          </div>)}
        </Card>;
      })}
    </div>
    <Modal title="Agendar" open={novo} onClose={() => setNovo(false)}>{novo && <NovoHorario profs={ativos} servs={(servs.data ?? []).filter((s) => s.isActive)} dia={dia} onDone={async () => { setNovo(false); await ag.reload(); }} />}</Modal>
    <Modal title="Abrir comanda" open={!!atender} onClose={() => setAtender(null)}>{atender && <AbrirComanda a={atender} podePacote={can('bel.agenda:operate')} onDone={(orderId) => nav(`/beleza/comandas?o=${orderId}`)} />}</Modal>
  </div>;
}

function NovoHorario({ profs, servs, dia, onDone }: { profs: any[]; servs: any[]; dia: string; onDone: () => void }) {
  const [cli, setCli] = useState<ClienteMin | null>(null);
  const [prof, setProf] = useState(profs[0]?.id ?? ''); const [serv, setServ] = useState(servs[0]?.id ?? ''); const [hora, setHora] = useState('09:00'); const [obs, setObs] = useState('');
  const salvar = useAction(async () => {
    if (!cli) throw new Error('Escolha a cliente.');
    await post('/m/beleza/agenda', { customerId: cli.id, professionalId: prof, serviceId: serv, startsAt: new Date(`${dia}T${hora}:00`).toISOString(), notes: obs || undefined }); onDone();
  });
  return <div className="grid" style={{ gap: 12 }}>
    <EscolherCliente value={cli} onChange={setCli} />
    <div className="row"><Field label="Profissional"><select className="input" value={prof} onChange={(e) => setProf(e.target.value)}>{profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Serviço"><select className="input" value={serv} onChange={(e) => setServ(e.target.value)}>{servs.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min</option>)}</select></Field></div>
    <div className="row"><Field label="Dia"><input className="input" value={dia} disabled /></Field><Field label="Hora"><input className="input" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} /></Field></div>
    <Field label="Observação"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
    <ErrorBox error={salvar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy} onClick={() => void salvar.run()}>Agendar</button></div>
  </div>;
}

function AbrirComanda({ a, podePacote, onDone }: { a: any; podePacote: boolean; onDone: (orderId: string) => void }) {
  const pacotes = useGet<any[]>(podePacote ? `/m/beleza/pacotes/cliente/${a.customerId}` : null);
  const validos = (pacotes.data ?? []).filter((p) => p.package.service.id === a.serviceId && p.saldo > 0 && !p.vencido);
  const [usar, setUsar] = useState('');
  const abrir = useAction(async () => {
    const o = await post<any>('/orders', { channel: 'SALON', customerId: a.customerId, items: [{ kind: 'SERVICE', description: a.service.name, unitPrice: Number(a.service.price), quantity: 1, metadata: { serviceId: a.serviceId } }], moduleData: { appointmentId: a.id, customerPackageId: usar || undefined } });
    onDone(o.id);
  });
  return <div className="grid" style={{ gap: 12 }}>
    <div><strong>{a.customer.name}</strong> · {a.service.name} com {a.professional.name}</div>
    {validos.length > 0 && <Field label="Usar pacote"><select className="input" value={usar} onChange={(e) => setUsar(e.target.value)}><option value="">Não, cobrar {brl(a.service.price)}</option>{validos.map((p) => <option key={p.id} value={p.id}>{p.package.name} · saldo {p.saldo}</option>)}</select></Field>}
    <ErrorBox error={abrir.error ?? pacotes.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={abrir.busy} onClick={() => void abrir.run()}>Abrir comanda</button></div>
    <div className="muted">A comanda recebe produtos durante o atendimento e fecha ao receber.</div>
  </div>;
}
