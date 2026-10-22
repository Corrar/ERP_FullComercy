import { Request, Response } from 'express';
import { BelAppointmentStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import * as bel from '../services/beleza.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
/** Sem período: do início do mês até agora (relatórios). */
const faixa = (q: { from?: Date; to?: Date }) => [q.from ?? new Date(new Date().setDate(1)), q.to ?? new Date()] as const;
const id = (req: Request) => String(req.params.id);
const taxa = z.number().min(0).max(100);

// ── Profissionais e serviços ──
export const getProfissionais = async (_req: Request, res: Response) => res.json(await bel.profissionais());
export const postProfissional = async (req: Request, res: Response) => res.status(201).json(await bel.criarProfissional(parse(z.object({ name: z.string().min(2).max(80), commissionRate: taxa.optional(), color: z.string().max(9).optional(), userId: z.string().uuid().optional() }), req.body)));
export const patchProfissional = async (req: Request, res: Response) => res.json(await bel.atualizarProfissional(id(req), parse(z.object({ name: z.string().min(2).max(80).optional(), commissionRate: taxa.optional(), color: z.string().max(9).nullable().optional(), isActive: z.boolean().optional() }), req.body)));
export const getServicos = async (_req: Request, res: Response) => res.json(await bel.servicos());
const servico = z.object({ name: z.string().min(2).max(120), durationMin: z.number().int().min(5).max(600), price: z.number().nonnegative(), commissionRate: taxa.nullable().optional() });
export const postServico = async (req: Request, res: Response) => res.status(201).json(await bel.criarServico(parse(servico, req.body)));
export const patchServico = async (req: Request, res: Response) => res.json(await bel.atualizarServico(id(req), parse(servico.partial().extend({ isActive: z.boolean().optional() }), req.body)));

// ── Agenda ──
export const getAgenda = async (req: Request, res: Response) => {
  const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date(), professionalId: z.string().uuid().optional() }), req.query);
  res.json(await bel.agenda(q.from, q.to, q.professionalId));
};
export const postAgendamento = async (req: Request, res: Response) => res.status(201).json(await bel.agendar(parse(z.object({ customerId: z.string().uuid(), professionalId: z.string().uuid(), serviceId: z.string().uuid(), startsAt: z.coerce.date(), notes: z.string().max(500).optional() }), req.body)));
export const patchAgendamento = async (req: Request, res: Response) => res.json(await bel.atualizarAgendamento(id(req), parse(z.object({ startsAt: z.coerce.date().optional(), professionalId: z.string().uuid().optional(), status: z.nativeEnum(BelAppointmentStatus).optional(), notes: z.string().max(500).optional() }), req.body)));

// ── Pacotes ──
export const getPacotes = async (_req: Request, res: Response) => res.json(await bel.pacotes());
export const postPacote = async (req: Request, res: Response) => res.status(201).json(await bel.criarPacote(parse(z.object({ name: z.string().min(2).max(120), serviceId: z.string().uuid(), sessions: z.number().int().min(2).max(100), price: z.number().positive(), validityDays: z.number().int().min(1).max(1095).optional() }), req.body)));
export const patchPacote = async (req: Request, res: Response) => res.json(await bel.atualizarPacote(id(req), parse(z.object({ name: z.string().min(2).max(120).optional(), price: z.number().positive().optional(), validityDays: z.number().int().min(1).max(1095).optional(), isActive: z.boolean().optional() }), req.body)));
export const getPacotesDoCliente = async (req: Request, res: Response) => res.json(await bel.pacotesDoCliente(String(req.params.customerId)));

// ── Comissões ──
export const getComissoes = async (req: Request, res: Response) => res.json(await bel.comissoes(parse(z.object({ professionalId: z.string().uuid().optional(), status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional() }), req.query)));
export const postPagarComissoes = async (req: Request, res: Response) => {
  const b = parse(z.object({ professionalId: z.string().uuid(), until: z.coerce.date().default(new Date()) }), req.body);
  res.json(await bel.pagarComissoes(b.professionalId, b.until));
};

// ── Relatórios ──
export const getRelProfissionais = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await bel.porProfissional(a, b)); };
export const getRelServicos = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await bel.porServico(a, b)); };
export const getRelFaltas = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await bel.faltas(a, b)); };
