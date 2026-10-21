import { useCallback, useState } from 'react';
import { ApiError, get, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSocketEvent } from '@/lib/socket';
import { Card, ErrorBox, Table, Toast } from '@/components/ui';
import { hhmm } from '@/lib/format';

/** Motivo da recusa (`decidirAcesso` na API) em português para a recepção — sem o `details` cru. */
const MOTIVO: Record<string, string> = {
  INADIMPLENTE: 'mensalidade em atraso', SEM_MATRICULA: 'sem matrícula ativa', MATRICULA_PAUSADA: 'matrícula pausada', CONTRATO_ENCERRADO: 'contrato encerrado',
  FORA_DOS_DIAS: 'fora dos dias do plano', FORA_DO_HORARIO: 'fora do horário do plano', LIMITE_DIARIO: 'limite de check-ins do dia atingido',
};

export function Recepcao() {
  const [q, setQ] = useState(''); const alunos = useGet<any[]>(q.length >= 2 ? '/customers' : null, { q }); const presentes = useGet<any[]>('/m/academia/presentes');
  const [msg, setMsg] = useState<string | null>(null); const [ultimo, setUltimo] = useState<any | null>(null);
  useSocketEvent('gym.access', useCallback((p: any) => { setUltimo(p); void presentes.reload(); }, [presentes]));
  const checkin = useAction(async (c: any) => {
    try { await post('/m/academia/checkins', { customerId: c.id }); } catch (e) {
      const reason = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      if (reason) throw new Error(`${c.name}: acesso negado — ${MOTIVO[reason] ?? reason}`);
      throw e;
    }
    setMsg(`${c.name}: acesso liberado`); setQ(''); await presentes.reload();
  });
  const checkout = useAction(async (id: string) => { await post(`/m/academia/checkins/${id}/checkout`); await presentes.reload(); });
  const resumo = useAction(async (c: any) => get(`/customers/${c.id}/summary`));
  return <div className="grid">
    <h1>Recepção</h1>
    {ultimo && <div className={`card`} style={{ borderColor: ultimo.allowed ? 'var(--ok)' : 'var(--danger)' }}>Catraca: {ultimo.allowed ? 'liberado' : `negado (${ultimo.reason})`}</div>}
    <Card title="Check-in manual"><input className="input" placeholder="nome ou telefone do aluno" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /><ErrorBox error={checkin.error} />
      <Table rows={q.length >= 2 ? alunos.data : []} empty="Digite para buscar." cols={[{ h: 'Aluno', c: (r) => r.name }, { h: 'Telefone', c: (r) => r.phone ?? '—' }, { h: '', c: (r) => <div className="row"><button className="btn primary" onClick={() => void checkin.run(r)}>Check-in</button><button className="btn" onClick={() => void resumo.run(r)}>Resumo</button></div> }]} /></Card>
    <Card title={`Presentes agora (${presentes.data?.length ?? 0})`}><Table rows={presentes.data} empty="Ninguém na academia." cols={[{ h: 'Aluno', c: (r) => r.customer.name }, { h: 'Entrou', c: (r) => hhmm(r.checkedInAt) }, { h: 'Origem', c: (r) => r.source }, { h: '', c: (r) => <button className="btn" onClick={() => void checkout.run(r.id)}>Saída</button> }]} /></Card>
    <Toast msg={msg} />
  </div>;
}
