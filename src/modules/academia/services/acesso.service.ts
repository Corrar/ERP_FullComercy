// modules/academia/services/acesso.service.ts — frequência e integração de acesso.
// `decidirAcesso` é a regra ÚNICA: o check-in manual da recepção e o webhook da catraca passam
// pelos mesmos critérios (matrícula ativa, horário do plano, limite diário). Os PROVIDERS
// (controlid, hikvision, webhook genérico) só traduzem o payload do aparelho para
// `{ deviceId, credencial }` e entregam aqui.
import { CheckInSource, CredentialKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma, prismaForTenant } from '../../../infra/prisma';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

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
  if (!device?.isActive || !cfg.webhookToken || cfg.webhookToken !== input.token) throw new AppError('UNAUTHENTICATED', 'Dispositivo não autorizado.');
  const db = prismaForTenant(device.tenantId);
  await db.gymAccessDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  const cred = await db.gymAccessCredential.findFirst({ where: { kind: input.kind, valueHash: hashCredencial(input.value), isActive: true } });
  if (!cred) {
    await db.gymAccessEvent.create({ data: { tenantId: device.tenantId, deviceId: device.id, allowed: false, reason: 'CREDENCIAL_DESCONHECIDA', raw: input.raw as never } });
    return { allowed: false, reason: 'CREDENCIAL_DESCONHECIDA' };
  }
  const d = await decidirAcesso(db, device.tenantId, cred.customerId);
  await db.gymAccessEvent.create({ data: { tenantId: device.tenantId, deviceId: device.id, credentialId: cred.id, customerId: cred.customerId, allowed: d.allowed, reason: d.reason, raw: input.raw as never } });
  if (d.allowed) await db.gymCheckIn.create({ data: { tenantId: device.tenantId, customerId: cred.customerId, membershipId: d.membershipId, deviceId: device.id, source: CheckInSource.TURNSTILE } });
  return d;
}

export async function frequencia(customerId: string, dias = 30) {
  const desde = new Date(); desde.setDate(desde.getDate() - dias);
  return ctx().db.gymCheckIn.findMany({ where: { customerId, checkedInAt: { gte: desde } }, orderBy: { checkedInAt: 'desc' } });
}
