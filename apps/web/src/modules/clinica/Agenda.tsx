// Agenda da clínica: o dia por profissional. "Cobrar" gera a cobrança da consulta (POST /orders):
// particular recebe na hora; convênio fica a receber até o repasse.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Modal } from '@/components/ui';
import { ContaAberta } from '@/components/ContaAberta';
import { EscolherCliente, type ClienteMin } from '@/components/EscolherCliente';
import { brl, hhmm } from '@/lib/format';

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const TIPO: Record<string, string> = { CONSULTA: 'Consulta', RETORNO: 'Retorno', EXAME: 'Exame', PROCEDIMENTO: 'Procedimento' };

export function Agenda() {
  const nav = useNavigate();
  const [dia, setDia] = useState(hojeISO()); const [novo, setNovo] = useState(false); const [conta, setConta] = useState<string | null>(null);
  const ag = useGet<any[]>('/m/clinica/agenda', { from: new Date(`${dia}T00:00:00`).toISOString(), to: new Date(new Date(`${dia}T00:00:00`).getTime() + 86400000).toISOString() });
  const profs = useGet<any[]>('/m/clinica/profissionais');
  const mudar = useAction(async (id: string, status: string) => { await patch(`/m/clinica/agenda/${id}`, { status }); await ag.reload(); });
  const cobrar = useAction(async (a: any) => {
    const o = await post<any>('/orders', { channel: 'CLINIC', customerId: a.customer.id, items: [{ kind: 'SERVICE', description: TIPO[a.kind] ?? a.kind, unitPrice: Number(a.price), quantity: 1, metadata: { appointmentId: a.id } }], moduleData: { appointmentId: a.id } });
    await ag.reload();
    if (a.payer === 'PARTICULAR' && o.status !== 'COMPLETED') setConta(o.id);
  });
  const ativos = (profs.data ?? []).filter((p) => p.isActive);
  return <div className="grid">
    <div className="row between"><h1 style={{ margin: 0 }}>Agenda da clínica</h1>
      <div className="row"><input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia" /><button className="btn primary" onClick={() => setNovo(true)}>Agendar</button></div></div>
    <ErrorBox error={ag.error ?? mudar.error ?? cobrar.error} />
    {!ativos.length && <Card><div className="muted">Cadastre os profissionais em <a href="/clinica/cadastros">Profissionais</a>.</div></Card>}
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
      {ativos.map((p) => {
        const doDia = (ag.data ?? []).filter((a) => a.professional.id === p.id);
        return <Card key={p.id} title={`${p.name}${p.specialty ? ` · ${p.specialty}` : ''}`}>
          {!doDia.length && <div className="muted">Sem consultas.</div>}
          {doDia.map((a) => <div key={a.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div className="row between"><strong>{hhmm(a.startsAt)}</strong><Badge s={a.status} /></div>
            <div>{a.customer.name} <span className="muted">{a.customer.phone ?? ''}</span></div>
            <div className="muted">{TIPO[a.kind] ?? a.kind} · {a.payer === 'CONVENIO' ? a.insurance?.name : 'Particular'} · {brl(a.price)}</div>
            <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {a.status === 'SCHEDULED' && <button className="btn" onClick={() => void mudar.run(a.id, 'CONFIRMED')}>Confirmar</button>}
              {['SCHEDULED', 'CONFIRMED'].includes(a.status) && <button className="btn" onClick={() => void mudar.run(a.id, 'ARRIVED')}>Chegou</button>}
              {['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(a.status) && <button className="btn primary" onClick={() => void cobrar.run(a)}>Cobrar</button>}
              {['SCHEDULED', 'CONFIRMED'].includes(a.status) && <><button className="btn" onClick={() => void mudar.run(a.id, 'NO_SHOW')}>Faltou</button><button className="btn danger" onClick={() => void mudar.run(a.id, 'CANCELLED')}>Cancelar</button></>}
              {a.orderId && <><button className="btn" onClick={() => setConta(a.orderId)}>Cobrança</button><button className="btn" onClick={() => nav(`/clinica/recibo/${a.orderId}`)}>Recibo</button></>}
              <button className="btn" onClick={() => nav(`/clinica/pacientes/${a.customer.id}`)}>Ficha</button>
            </div>
          </div>)}
        </Card>;
      })}
    </div>
    <Modal title="Agendar consulta" open={novo} onClose={() => setNovo(false)}>{novo && <NovaConsulta profs={ativos} dia={dia} onDone={async () => { setNovo(false); await ag.reload(); }} />}</Modal>
    <Modal title="Cobrança" open={!!conta} onClose={() => { setConta(null); void ag.reload(); }}>{conta && <ContaAberta orderId={conta} titulo="Cobrança" podeLancar={false} />}</Modal>
  </div>;
}

function NovaConsulta({ profs, dia, onDone }: { profs: any[]; dia: string; onDone: () => void }) {
  const convs = useGet<any[]>('/m/clinica/convenios');
  const [pac, setPac] = useState<ClienteMin | null>(null); const [prof, setProf] = useState(profs[0]?.id ?? ''); const [hora, setHora] = useState('08:00');
  const [tipo, setTipo] = useState('CONSULTA'); const [payer, setPayer] = useState('PARTICULAR'); const [conv, setConv] = useState(''); const [valor, setValor] = useState('');
  const salvar = useAction(async () => {
    if (!pac) throw new Error('Escolha o paciente.');
    await post('/m/clinica/agenda', { customerId: pac.id, professionalId: prof, startsAt: new Date(`${dia}T${hora}:00`).toISOString(), kind: tipo, payer, insuranceId: payer === 'CONVENIO' && conv ? conv : undefined, price: valor === '' ? undefined : Number(valor) }); onDone();
  });
  return <div className="grid" style={{ gap: 12 }}>
    <EscolherCliente value={pac} onChange={setPac} rotulo="Paciente" />
    <div className="row"><Field label="Profissional"><select className="input" value={prof} onChange={(e) => setProf(e.target.value)}>{profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Hora"><input className="input" type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} /></Field></div>
    <div className="row"><Field label="Tipo"><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(TIPO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Quem paga"><select className="input" value={payer} onChange={(e) => setPayer(e.target.value)}><option value="PARTICULAR">Particular</option><option value="CONVENIO">Convênio</option></select></Field></div>
    {payer === 'CONVENIO' && <Field label="Convênio (vazio = o da ficha)"><select className="input" value={conv} onChange={(e) => setConv(e.target.value)}><option value="">Da ficha do paciente</option>{convs.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name} · {brl(c.price)}</option>)}</select></Field>}
    <Field label="Valor (vazio = do profissional ou do convênio)"><input className="input" type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
    <ErrorBox error={salvar.error} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={salvar.busy} onClick={() => void salvar.run()}>Agendar</button></div>
  </div>;
}
