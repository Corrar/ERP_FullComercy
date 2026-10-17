// modules/academia/services/acesso.service.ts — frequência e integração de acesso.
// `decidirAcesso` é a regra ÚNICA: o check-in manual da recepção e o webhook da catraca passam
// pelos mesmos critérios (matrícula ativa, horário do plano, limite diário). Os PROVIDERS
// (controlid, hikvision, webhook genérico) só traduzem o payload do aparelho para
// `{ deviceId, credencial }` e entregam aqui.
import { CheckInSource, CredentialKind } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { prisma, prismaForTenant } from '../../../infra/prisma';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { seal, open, safeEqual } from '../../../shared/crypto';
import { events } from '../../../shared/events';

interface AccessRules { weekdays?: number[]; from?: string; to?: string; maxCheckInsPerDay?: number }
export const hashCredencial = (v: string) => createHash('sha256').update(v).digest('hex');

type Db = ReturnType<typeof prismaForTenant>;

export async function decidirAcesso(db: Db, tenantId: string, customerId: string, agora = new Date()): Promise<{ allowed: boolean; reason: string; membershipId?: string }> {
  const m = await db.gymMembership.findFirst({ where: { customerId, status: { in: ['ACTIVE', 'OVERDUE', 'PAUSED'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  if (!m) return { allowed: false, reason: 'SEM_MATRICULA' };
  if (m.status === 'OVERDUE') return { allowed: false, reason: 'INADIMPLENTE', membershipId: m.id };
  if (m.status === 'PAUSED') return { allowed: false, reason: 'MATRICULA_PAUSADA', membershipId: m.id };
  if (m.endDate && m.endDate < agora) return { allowed: false, reason: 'CONTRATO_ENCERRADO', membershipId: m.id };

  const r = (m.plan.accessRules ?? {}) as AccessRules;
  if (r.weekdays && !r.weekdays.includes(agora.getDay())) return { allowed: false, reason: 'FORA_DOS_DIAS', membershipId: m.id };
  const hhmm = agora.toTimeString().slice(0, 5);
  if ((r.from && hhmm < r.from) || (r.to && hhmm > r.to)) return { allowed: false, reason: 'FORA_DO_HORARIO', membershipId: m.id };
  if (r.maxCheckInsPerDay) {
    const inicio = new Date(agora); inicio.setHours(0, 0, 0, 0);
    const n = await db.gymCheckIn.count({ where: { customerId, checkedInAt: { gte: inicio } } });
    if (n >= r.maxCheckInsPerDay) return { allowed: false, reason: 'LIMITE_DIARIO', membershipId: m.id };
  }
  void tenantId;
  return { allowed: true, reason: 'OK', membershipId: m.id };
}

/** Check-in pela recepção (logado). */
export async function checkInManual(customerId: string) {
  const { db, tenantId } = ctx();
  const d = await decidirAcesso(db, tenantId, customerId);
  if (!d.allowed) throw new AppError('FORBIDDEN', `Acesso negado: ${d.reason}`, d);
  return db.gymCheckIn.create({ data: { tenantId, customerId, membershipId: d.membershipId, source: CheckInSource.MANUAL } });
}

/** Webhook do aparelho (SEM login de usuário): autentica pelo token do dispositivo. */
export async function eventoDoDispositivo(input: { deviceId: string; token: string; kind: CredentialKind; value: string; raw?: unknown }) {
  const device = await prisma.gymAccessDevice.findUnique({ where: { id: input.deviceId } });
  const cfg = (device?.config ?? {}) as { webhookToken?: string };
  if (!device?.isActive || !cfg.webhookToken || !safeEqual(open(cfg.webhookToken), input.token)) throw new AppError('UNAUTHENTICATED', 'Dispositivo não autorizado.');
  const db = prismaForTenant(device.tenantId);
  await db.gymAccessDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  const cred = await db.gymAccessCredential.findFirst({ where: { kind: input.kind, valueHash: hashCredencial(input.value), isActive: true } });
  if (!cred) {
    await db.gymAccessEvent.create({ data: { tenantId: device.tenantId, deviceId: device.id, allowed: false, reason: 'CREDENCIAL_DESCONHECIDA', raw: input.raw as never } });
    return { allowed: false, reason: 'CREDENCIAL_DESCONHECIDA' };
  }
  const d = await decidirAcesso(db, device.tenantId, cred.customerId);
  events.emit('gym.access', { tenantId: device.tenantId, customerId: cred.customerId, allowed: d.allowed, reason: d.reason });
  await db.gymAccessEvent.create({ data: { tenantId: device.tenantId, deviceId: device.id, credentialId: cred.id, customerId: cred.customerId, allowed: d.allowed, reason: d.reason, raw: input.raw as never } });
  if (d.allowed) await db.gymCheckIn.create({ data: { tenantId: device.tenantId, customerId: cred.customerId, membershipId: d.membershipId, deviceId: device.id, source: CheckInSource.TURNSTILE } });
  return d;
}

export async function frequencia(customerId: string, dias = 30) {
  const desde = new Date(); desde.setDate(desde.getDate() - dias);
  return ctx().db.gymCheckIn.findMany({ where: { customerId, checkedInAt: { gte: desde } }, orderBy: { checkedInAt: 'desc' } });
}

export async function checkOut(checkInId: string) {
  return ctx().db.gymCheckIn.update({ where: { id: checkInId }, data: { checkedOutAt: new Date() } });
}

export const presentesAgora = () => ctx().db.gymCheckIn.findMany({ where: { checkedOutAt: null, checkedInAt: { gte: new Date(Date.now() - 6 * 3_600_000) } }, include: { customer: { select: { name: true } } }, orderBy: { checkedInAt: 'desc' } });

// ── Dispositivos ──
export const listarDispositivos = () => ctx().db.gymAccessDevice.findMany({ select: { id: true, name: true, kind: true, provider: true, isActive: true, lastSeenAt: true, createdAt: true } });
/** Cria o aparelho e devolve o token UMA vez. No banco fica CIFRADO (shared/crypto.ts). */
export async function criarDispositivo(input: { name: string; kind: 'TURNSTILE' | 'DOOR' | 'BIOMETRIC' | 'QR_READER'; provider: string; config?: Record<string, unknown> }) {
  const webhookToken = randomBytes(24).toString('base64url');
  const d = await ctx().db.gymAccessDevice.create({ data: { ...input, tenantId: ctx().tenantId, config: { ...(input.config ?? {}), webhookToken: seal(webhookToken) } as never } });
  return { id: d.id, name: d.name, webhookUrl: `/public/academia/dispositivos/${d.id}/eventos`, webhookToken };
}
export const atualizarDispositivo = (id: string, input: { name?: string; isActive?: boolean }) => ctx().db.gymAccessDevice.update({ where: { id }, data: input });
/** Gira o token do aparelho (perdeu-se, vazou, trocou o integrador). Devolve o novo uma vez. */
export async function girarToken(id: string) {
  const d = await ctx().db.gymAccessDevice.findUnique({ where: { id } });
  if (!d) throw AppError.notFound('Dispositivo');
  const webhookToken = randomBytes(24).toString('base64url');
  await ctx().db.gymAccessDevice.update({ where: { id }, data: { config: { ...(d.config as object), webhookToken: seal(webhookToken) } as never } });
  return { id, webhookToken };
}
export const revogarCredencial = (id: string) => ctx().db.gymAccessCredential.update({ where: { id }, data: { isActive: false, revokedAt: new Date() } });
export const credenciaisDoAluno = (customerId: string) => ctx().db.gymAccessCredential.findMany({ where: { customerId }, select: { id: true, kind: true, isActive: true, createdAt: true, revokedAt: true } });
export const eventosDeAcesso = (filter: { deviceId?: string; customerId?: string; allowed?: boolean; take?: number }) =>
  ctx().db.gymAccessEvent.findMany({ where: filter, include: { customer: { select: { name: true } }, device: { select: { name: true } } }, orderBy: { occurredAt: 'desc' }, take: Math.min(filter.take ?? 100, 500) }).then((rows) => rows.map((r) => ({ ...r, id: r.id.toString() })));
