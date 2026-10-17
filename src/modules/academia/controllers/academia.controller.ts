import { Request, Response } from 'express';
import { BillingCycle, CredentialKind, MembershipStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as assin from '../services/assinaturas.service';
import * as acesso from '../services/acesso.service';

export const getPlanos = async (_req: Request, res: Response) => res.json(await ctx().db.gymPlan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } }));
export const postPlano = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2), description: z.string().optional(), price: z.number().positive(), billingCycle: z.nativeEnum(BillingCycle).default('MONTHLY'), contractCycles: z.number().int().positive().optional(), enrollmentFee: z.number().nonnegative().default(0), accessRules: z.record(z.unknown()).default({}) }), req.body);
  res.status(201).json(await ctx().db.gymPlan.create({ data: { ...b, tenantId: ctx().tenantId, accessRules: b.accessRules as never } }));
};
export const getMatriculas = async (req: Request, res: Response) => res.json(await assin.listarMatriculas(parse(z.object({ status: z.nativeEnum(MembershipStatus).optional(), customerId: z.string().uuid().optional() }), req.query)));
export const postCancelarMatricula = async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().min(3) }), req.body);
  res.json(await assin.cancelarMatricula(String(req.params.id), b.reason));
};
export const postCheckIn = async (req: Request, res: Response) => {
  const b = parse(z.object({ customerId: z.string().uuid() }), req.body);
  res.status(201).json(await acesso.checkInManual(b.customerId));
};
export const getFrequencia = async (req: Request, res: Response) => res.json(await acesso.frequencia(String(req.params.customerId), Number(req.query.dias ?? 30)));
export const postCredencial = async (req: Request, res: Response) => {
  const b = parse(z.object({ customerId: z.string().uuid(), kind: z.nativeEnum(CredentialKind), value: z.string().min(3) }), req.body);
  res.status(201).json(await ctx().db.gymAccessCredential.create({ data: { tenantId: ctx().tenantId, customerId: b.customerId, kind: b.kind, valueHash: acesso.hashCredencial(b.value) }, select: { id: true, kind: true, customerId: true } }));
};
export const getDispositivos = async (_req: Request, res: Response) => res.json(await ctx().db.gymAccessDevice.findMany({ select: { id: true, name: true, kind: true, provider: true, isActive: true, lastSeenAt: true } }));
/** Público (chamado pela catraca). O token do aparelho é a autenticação. */
export const postEventoDispositivo = async (req: Request, res: Response) => {
  const b = parse(z.object({ token: z.string().min(8), kind: z.nativeEnum(CredentialKind), value: z.string().min(1) }), req.body);
  res.json(await acesso.eventoDoDispositivo({ deviceId: String(req.params.deviceId), ...b, raw: req.body }));
};
