export const brl = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v: unknown, d = 0) => Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: 3 });
export const dt = (v: unknown) => (v ? new Date(v as string).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const d = (v: unknown) => (v ? new Date(v as string).toLocaleDateString('pt-BR') : '—');
export const hhmm = (v: unknown) => (v ? new Date(v as string).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const STATUS_PT: Record<string, string> = {
  DRAFT: 'Rascunho', OPEN: 'Aberto', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em andamento', READY: 'Pronto', COMPLETED: 'Concluído', CANCELLED: 'Cancelado',
  QUEUED: 'Na fila', PREPARING: 'Preparando', SERVED: 'Servido', PENDING: 'Pendente', ASSIGNED: 'Atribuída', PICKED_UP: 'Saiu', DELIVERED: 'Entregue', FAILED: 'Falhou',
  RECEIVED: 'Recebido', DIAGNOSING: 'Diagnóstico', AWAITING_APPROVAL: 'Aguardando aprovação', APPROVED: 'Aprovado', AWAITING_PARTS: 'Aguardando peça', IN_SERVICE: 'Em serviço', QUALITY_CHECK: 'Qualidade',
  ACTIVE: 'Ativa', PAUSED: 'Pausada', OVERDUE: 'Inadimplente', EXPIRED: 'Expirada', PAID: 'Pago', PARTIAL: 'Parcial', ORDERED: 'Enviado', FREE: 'Livre', OCCUPIED: 'Ocupada', RESERVED: 'Reservada', CLOSING: 'Fechando',
};
export const st = (s: string) => STATUS_PT[s] ?? s;
export const tone = (s: string): 'ok' | 'warn' | 'danger' | 'info' | '' =>
  ['COMPLETED', 'PAID', 'ACTIVE', 'DELIVERED', 'SERVED', 'RECEIVED', 'FREE', 'SENT'].includes(s) ? 'ok'
  : ['CANCELLED', 'FAILED', 'OVERDUE', 'EXPIRED'].includes(s) ? 'danger'
  : ['PREPARING', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'OCCUPIED', 'PARTIAL', 'PAUSED'].includes(s) ? 'warn'
  : ['OPEN', 'READY', 'CONFIRMED', 'QUEUED', 'PENDING', 'ASSIGNED', 'PICKED_UP'].includes(s) ? 'info' : '';
