import { Request, Response } from 'express';
import { AppointmentStatus, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as veiculos from '../services/veiculos.service';
import * as os from '../services/os.service';
import * as agenda from '../services/agenda.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => [q.from ?? new Date(new Date().setDate(1)), q.to ?? new Date()] as const;

// ── Veículos ──
export const getVeiculos = async (req: Request, res: Response) => res.json(await veiculos.listar(parse(z.object({ customerId: z.string().uuid().optional(), q: z.string().optional() }), req.query)));
export const getVeiculoPorPlaca = async (req: Request, res: Response) => res.json(await veiculos.buscarPorPlaca(String(req.params.plate)));
export const getHistorico = async (req: Request, res: Response) => res.json(await veiculos.historico(String(req.params.id)));
const veiculoSchema = z.object({ customerId: z.string().uuid(), plate: z.string().min(7), brand: z.string().optional(), model: z.string().optional(), year: z.number().int().optional(), color: z.string().optional(), vin: z.string().optional(), mileage: z.number().int().optional(), notes: z.string().optional() });
export const postVeiculo = async (req: Request, res: Response) => res.status(201).json(await veiculos.cadastrar(parse(veiculoSchema, req.body)));
export const patchVeiculo = async (req: Request, res: Response) => res.json(await veiculos.atualizar(String(req.params.id), parse(veiculoSchema.omit({ plate: true }).partial().extend({ isActive: z.boolean().optional() }), req.body)));

// ── OS ──
export const getPainel = async (_req: Request, res: Response) => res.json(await os.painel());
export const getOS = async (req: Request, res: Response) => res.json(await os.detalheOS(String(req.params.id)));
export const getOSPorPedido = async (req: Request, res: Response) => res.json(await os.porPedido(String(req.params.orderId)));
export const postMoverOS = async (req: Request, res: Response) => { const b = parse(z.object({ to: z.nativeEnum(MaintenanceStatus), note: z.string().optional(), diagnosis: z.string().optional() }), req.body); res.json(await os.moverOS(String(req.params.id), b.to, b)); };
export const postOrcamento = async (req: Request, res: Response) => res.json(await os.enviarOrcamento(String(req.params.id), parse(z.object({ diagnosis: z.string().min(3) }), req.body).diagnosis));
export const postAprovar = async (req: Request, res: Response) => res.json(await os.aprovarOrcamento(String(req.params.id), parse(z.object({ aprovadoPor: z.string().min(2), canal: z.string().optional(), itensRecusados: z.array(z.string().uuid()).optional() }), req.body)));
export const putTecnico = async (req: Request, res: Response) => res.json(await os.atribuirTecnico(String(req.params.id), parse(z.object({ technicianUserId: z.string().uuid().nullable() }), req.body).technicianUserId));
export const patchOS = async (req: Request, res: Response) => res.json(await os.atualizarOS(String(req.params.id), parse(z.object({ promisedAt: z.coerce.date().nullable().optional(), warrantyDays: z.number().int().nonnegative().nullable().optional(), complaint: z.string().optional(), diagnosis: z.string().optional(), mileageIn: z.number().int().optional(), fuelLevel: z.string().max(10).optional() }), req.body)));
export const postChecklist = async (req: Request, res: Response) => { const b = parse(z.object({ phase: z.enum(['IN', 'OUT']).default('IN'), labels: z.array(z.string().min(1)).optional() }), req.body); res.status(201).json(await os.criarChecklist(String(req.params.id), b.phase, b.labels)); };
export const patchChecklistItem = async (req: Request, res: Response) => res.json(await os.marcarChecklist(String(req.params.itemId), parse(z.object({ checked: z.boolean(), note: z.string().optional(), photoUrl: z.string().url().optional() }), req.body)));
export const postAnexo = async (req: Request, res: Response) => res.status(201).json(await os.anexar(String(req.params.id), parse(z.object({ kind: z.enum(['PHOTO', 'DOCUMENT', 'SIGNATURE']).default('PHOTO'), url: z.string().url(), caption: z.string().max(160).optional() }), req.body)));

// ── Catálogo ──
export const getCatalogo = async (_req: Request, res: Response) => res.json(await ctx().db.svcServiceCatalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
export const postCatalogo = async (req: Request, res: Response) => res.status(201).json(await ctx().db.svcServiceCatalogItem.create({ data: { ...parse(z.object({ name: z.string().min(2), defaultPrice: z.number().nonnegative(), estimatedMinutes: z.number().int().positive().optional(), productId: z.string().uuid().optional() }), req.body), tenantId: ctx().tenantId } }));
export const patchCatalogo = async (req: Request, res: Response) => res.json(await ctx().db.svcServiceCatalogItem.update({ where: { id: String(req.params.id) }, data: parse(z.object({ name: z.string().optional(), defaultPrice: z.number().nonnegative().optional(), estimatedMinutes: z.number().int().positive().nullable().optional(), isActive: z.boolean().optional() }), req.body) }));

// ── Agenda ──
export const getAgenda = async (req: Request, res: Response) => { const q = parse(periodo, req.query); res.json(await agenda.agenda(q.from ?? new Date(new Date().setHours(0, 0, 0, 0)), q.to ?? new Date(Date.now() + 7 * 86_400_000))); };
export const postAgendar = async (req: Request, res: Response) => res.status(201).json(await agenda.agendar(parse(z.object({ customerId: z.string().uuid(), vehicleId: z.string().uuid().optional(), scheduledAt: z.coerce.date(), durationMin: z.number().int().positive().optional(), service: z.string().max(160).optional(), notes: z.string().optional() }), req.body)));
export const patchAgendamento = async (req: Request, res: Response) => res.json(await agenda.atualizarAgendamento(String(req.params.id), parse(z.object({ scheduledAt: z.coerce.date().optional(), durationMin: z.number().int().positive().optional(), status: z.nativeEnum(AppointmentStatus).optional(), service: z.string().optional(), notes: z.string().optional(), vehicleId: z.string().uuid().nullable().optional() }), req.body)));
export const postChegada = async (req: Request, res: Response) => res.status(201).json(await agenda.chegada(String(req.params.id), parse(z.object({ mileageIn: z.number().int().optional(), fuelLevel: z.string().optional(), complaint: z.string().optional(), technicianUserId: z.string().uuid().optional() }), req.body ?? {})));

// ── Relatórios ──
export const getRelStatus = async (_req: Request, res: Response) => res.json(await os.osPorStatus());
export const getRelTecnicos = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await os.produtividadeTecnicos(a, b)); };
export const getRelServicos = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await os.servicosMaisVendidos(a, b)); };
export const getRelRetorno = async (req: Request, res: Response) => res.json(await os.retornoDeClientes(Number(req.query.dias ?? 180)));
