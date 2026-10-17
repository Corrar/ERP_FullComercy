import { Request, Response } from 'express';
import { BillingCycle, CredentialKind, MembershipStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as assin from '../services/assinaturas.service';
import * as acesso from '../services/acesso.service';
import * as turmas from '../services/turmas.service';
import * as rel from '../services/relatorios.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => [q.from ?? new Date(Date.now() - 30 * 86_400_000), q.to ?? new Date()] as const;

// ── Planos ──
export const getPlanos = async (_req: Request, res: Response) => res.json(await ctx().db.gymPlan.findMany({ orderBy: { price: 'asc' }, include: { _count: { select: { memberships: { where: { status: 'ACTIVE' } } } } } }));
const planoSchema = z.object({ name: z.string().min(2), description: z.string().optional(), price: z.number().positive(), billingCycle: z.nativeEnum(BillingCycle).default('MONTHLY'), contractCycles: z.number().int().positive().nullable().optional(), enrollmentFee: z.number().nonnegative().default(0), accessRules: z.record(z.unknown()).default({}), isActive: z.boolean().optional() });
export const postPlano = async (req: Request, res: Response) => { const b = parse(planoSchema, req.body); res.status(201).json(await ctx().db.gymPlan.create({ data: { ...b, tenantId: ctx().tenantId, accessRules: b.accessRules as never } })); };
export const patchPlano = async (req: Request, res: Response) => { const b = parse(planoSchema.partial(), req.body); res.json(await ctx().db.gymPlan.update({ where: { id: String(req.params.id) }, data: { ...b, accessRules: b.accessRules as never } })); };

// ── Matrículas ──
export const getMatriculas = async (req: Request, res: Response) => res.json(await assin.listarMatriculas(parse(z.object({ status: z.nativeEnum(MembershipStatus).optional(), customerId: z.string().uuid().optional() }), req.query)));
export const getCobrancas = async (req: Request, res: Response) => res.json(await assin.cobrancasDaMatricula(String(req.params.id)));
export const postCancelarMatricula = async (req: Request, res: Response) => res.json(await assin.cancelarMatricula(String(req.params.id), parse(z.object({ reason: z.string().min(3) }), req.body).reason));
export const postPausar = async (req: Request, res: Response) => res.json(await assin.pausarMatricula(String(req.params.id), parse(z.object({ until: z.coerce.date() }), req.body).until));
export const postRetomar = async (req: Request, res: Response) => res.json(await assin.retomarMatricula(String(req.params.id)));
export const postTrocarPlano = async (req: Request, res: Response) => res.json(await assin.trocarPlano(String(req.params.id), parse(z.object({ planId: z.string().uuid() }), req.body).planId));
export const getInadimplentes = async (_req: Request, res: Response) => res.json(await assin.inadimplentes());
export const getAVencer = async (req: Request, res: Response) => res.json(await assin.aVencer(Number(req.query.dias ?? 7)));
export const postRodarCobranca = async (_req: Request, res: Response) => res.json(await assin.gerarCobrancasVencidas());

// ── Acesso ──
export const postCheckIn = async (req: Request, res: Response) => res.status(201).json(await acesso.checkInManual(parse(z.object({ customerId: z.string().uuid() }), req.body).customerId));
export const postCheckOut = async (req: Request, res: Response) => res.json(await acesso.checkOut(String(req.params.id)));
export const getPresentes = async (_req: Request, res: Response) => res.json(await acesso.presentesAgora());
export const getFrequencia = async (req: Request, res: Response) => res.json(await acesso.frequencia(String(req.params.customerId), Number(req.query.dias ?? 30)));
export const postCredencial = async (req: Request, res: Response) => {
  const b = parse(z.object({ customerId: z.string().uuid(), kind: z.nativeEnum(CredentialKind), value: z.string().min(3) }), req.body);
  res.status(201).json(await ctx().db.gymAccessCredential.create({ data: { tenantId: ctx().tenantId, customerId: b.customerId, kind: b.kind, valueHash: acesso.hashCredencial(b.value) }, select: { id: true, kind: true, customerId: true } }));
};
export const getCredenciais = async (req: Request, res: Response) => res.json(await acesso.credenciaisDoAluno(String(req.params.customerId)));
export const deleteCredencial = async (req: Request, res: Response) => res.json(await acesso.revogarCredencial(String(req.params.id)));
export const getDispositivos = async (_req: Request, res: Response) => res.json(await acesso.listarDispositivos());
export const postDispositivo = async (req: Request, res: Response) => res.status(201).json(await acesso.criarDispositivo(parse(z.object({ name: z.string().min(2), kind: z.enum(['TURNSTILE', 'DOOR', 'BIOMETRIC', 'QR_READER']).default('TURNSTILE'), provider: z.string().min(2).max(40).default('webhook'), config: z.record(z.unknown()).optional() }), req.body)));
export const postGirarToken = async (req: Request, res: Response) => res.json(await acesso.girarToken(String(req.params.id)));
export const patchDispositivo = async (req: Request, res: Response) => res.json(await acesso.atualizarDispositivo(String(req.params.id), parse(z.object({ name: z.string().optional(), isActive: z.boolean().optional() }), req.body)));
export const getEventosAcesso = async (req: Request, res: Response) => res.json(await acesso.eventosDeAcesso(parse(z.object({ deviceId: z.string().uuid().optional(), customerId: z.string().uuid().optional(), allowed: z.coerce.boolean().optional(), take: z.coerce.number().int().optional() }), req.query)));
/** Público (chamado pela catraca). O token do aparelho é a autenticação. */
export const postEventoDispositivo = async (req: Request, res: Response) => {
  const b = parse(z.object({ token: z.string().min(8), kind: z.nativeEnum(CredentialKind), value: z.string().min(1) }), req.body);
  res.json(await acesso.eventoDoDispositivo({ deviceId: String(req.params.deviceId), ...b, raw: req.body }));
};

// ── Turmas ──
const slot = z.object({ weekday: z.number().int().min(0).max(6), time: z.string().regex(/^\d{2}:\d{2}$/) });
export const getTurmas = async (_req: Request, res: Response) => res.json(await turmas.listarTurmas());
export const postTurma = async (req: Request, res: Response) => res.status(201).json(await turmas.criarTurma(parse(z.object({ name: z.string().min(2), instructorUserId: z.string().uuid().optional(), capacity: z.number().int().positive().optional(), durationMin: z.number().int().positive().optional(), schedule: z.array(slot).optional() }), req.body)));
export const patchTurma = async (req: Request, res: Response) => res.json(await turmas.atualizarTurma(String(req.params.id), parse(z.object({ name: z.string().optional(), instructorUserId: z.string().uuid().nullable().optional(), capacity: z.number().int().positive().optional(), durationMin: z.number().int().positive().optional(), schedule: z.array(slot).optional(), isActive: z.boolean().optional() }), req.body)));
export const postGerarSessoes = async (req: Request, res: Response) => res.json(await turmas.gerarSessoes(Number(req.query.dias ?? 14)));
export const getAgenda = async (req: Request, res: Response) => { const q = parse(periodo, req.query); res.json(await turmas.agenda(q.from ?? new Date(), q.to ?? new Date(Date.now() + 7 * 86_400_000))); };
export const postReserva = async (req: Request, res: Response) => res.status(201).json(await turmas.reservar(String(req.params.id), parse(z.object({ customerId: z.string().uuid() }), req.body).customerId));
export const deleteReserva = async (req: Request, res: Response) => res.json(await turmas.cancelarReserva(String(req.params.id), String(req.params.customerId)));
export const postChamada = async (req: Request, res: Response) => res.json(await turmas.chamada(String(req.params.id), parse(z.object({ presentes: z.array(z.string().uuid()) }), req.body).presentes));

// ── Relatórios ──
export const getPainel = async (_req: Request, res: Response) => res.json(await rel.painel());
export const getRelFrequencia = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.frequenciaPorDia(a, b)); };
export const getRelPico = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.horariosDePico(a, b)); };
export const getRelSumidos = async (req: Request, res: Response) => res.json(await rel.sumidos(Number(req.query.dias ?? 14)));
