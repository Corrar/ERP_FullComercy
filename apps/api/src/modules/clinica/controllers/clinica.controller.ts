import { Request, Response } from 'express';
import { CliAppointmentStatus, CliPayer } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { canUse, effectivePermissions } from '../../../core/rbac/rbac.service';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as cli from '../services/clinica.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => [q.from ?? new Date(new Date().setDate(1)), q.to ?? new Date()] as const;
const id = (req: Request) => String(req.params.id);
const prof = z.object({ name: z.string().min(2).max(80), specialty: z.string().max(80).optional(), registry: z.string().max(30).optional(), defaultDurationMin: z.number().int().min(5).max(480).optional(), defaultPrice: z.number().nonnegative().optional(), userId: z.string().uuid().optional() });

export const getProfissionais = async (_req: Request, res: Response) => res.json(await cli.profissionais());
export const postProfissional = async (req: Request, res: Response) => res.status(201).json(await cli.criarProfissional(parse(prof, req.body)));
export const patchProfissional = async (req: Request, res: Response) => res.json(await cli.atualizarProfissional(id(req), parse(prof.partial().extend({ isActive: z.boolean().optional() }), req.body)));
export const getConvenios = async (_req: Request, res: Response) => res.json(await cli.convenios());
export const postConvenio = async (req: Request, res: Response) => res.status(201).json(await cli.criarConvenio(parse(z.object({ name: z.string().min(2).max(80), code: z.string().max(30).optional(), price: z.number().nonnegative() }), req.body)));
export const patchConvenio = async (req: Request, res: Response) => res.json(await cli.atualizarConvenio(id(req), parse(z.object({ name: z.string().min(2).max(80).optional(), code: z.string().max(30).optional(), price: z.number().nonnegative().optional(), isActive: z.boolean().optional() }), req.body)));
export const getAReceber = async (req: Request, res: Response) => res.json(await cli.aReceberDeConvenio(parse(z.object({ insuranceId: z.string().uuid().optional() }), req.query).insuranceId));

export const getPaciente = async (req: Request, res: Response) => {
  const acc = await effectivePermissions(ctx().tenantId, ctx().userId!);
  res.json(await cli.fichaDoPaciente(String(req.params.customerId), canUse(acc, 'cli.prontuario:view')));
};
export const putPerfil = async (req: Request, res: Response) => res.json(await cli.salvarPerfil(String(req.params.customerId), parse(z.object({ birthDate: z.coerce.date().nullable().optional(), insuranceId: z.string().uuid().nullable().optional(), insuranceCard: z.string().max(40).nullable().optional(), allergies: z.string().max(1000).nullable().optional(), notes: z.string().max(2000).nullable().optional() }), req.body)));
export const postEvolucao = async (req: Request, res: Response) => res.status(201).json(await cli.registrarEvolucao(String(req.params.customerId), parse(z.object({ professionalId: z.string().uuid(), appointmentId: z.string().uuid().optional(), date: z.coerce.date().optional(), anamnesis: z.string().max(8000).optional(), evolution: z.string().max(8000).optional(), prescription: z.string().max(8000).optional(), returnAt: z.coerce.date().optional() }), req.body)));

export const getAgenda = async (req: Request, res: Response) => { const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date(), professionalId: z.string().uuid().optional() }), req.query); res.json(await cli.agenda(q.from, q.to, q.professionalId)); };
export const postConsulta = async (req: Request, res: Response) => res.status(201).json(await cli.agendar(parse(z.object({ customerId: z.string().uuid(), professionalId: z.string().uuid(), startsAt: z.coerce.date(), durationMin: z.number().int().min(5).max(480).optional(), kind: z.enum(['CONSULTA', 'RETORNO', 'EXAME', 'PROCEDIMENTO']).optional(), payer: z.nativeEnum(CliPayer).optional(), insuranceId: z.string().uuid().optional(), price: z.number().nonnegative().optional(), notes: z.string().max(500).optional() }), req.body)));
export const patchConsulta = async (req: Request, res: Response) => res.json(await cli.atualizarAgendamento(id(req), parse(z.object({ startsAt: z.coerce.date().optional(), status: z.nativeEnum(CliAppointmentStatus).optional(), notes: z.string().max(500).optional() }), req.body)));
export const getRecibo = async (req: Request, res: Response) => res.json(await cli.recibo(String(req.params.orderId)));

export const getRelProfissionais = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await cli.porProfissional(a, b)); };
export const getRelConvenios = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await cli.porConvenio(a, b)); };
export const getRelFaltas = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await cli.faltas(a, b)); };
