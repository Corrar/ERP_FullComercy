import { Request, Response } from 'express';
import { PetGroomingStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { canUse, effectivePermissions } from '../../../core/rbac/rbac.service';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as pet from '../services/pet.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => [q.from ?? new Date(new Date().setDate(1)), q.to ?? new Date()] as const;
const id = (req: Request) => String(req.params.id);
const petSchema = z.object({
  customerId: z.string().uuid(), name: z.string().min(1).max(60), species: z.enum(['CAO', 'GATO', 'OUTRO']), breed: z.string().max(60).optional(),
  sex: z.enum(['M', 'F']).optional(), birthDate: z.coerce.date().optional(), weightKg: z.number().positive().max(200).optional(), size: z.enum(['P', 'M', 'G']).optional(),
  allergies: z.string().max(500).optional(), notes: z.string().max(1000).optional(),
});

export const getPets = async (req: Request, res: Response) => res.json(await pet.listarPets(parse(z.object({ q: z.string().max(80).optional(), customerId: z.string().uuid().optional() }), req.query)));
export const getPet = async (req: Request, res: Response) => {
  // O prontuário só vem para quem pode ler prontuário; a ficha (vacinas, banhos, compras) vem para todos.
  const acc = await effectivePermissions(ctx().tenantId, ctx().userId!);
  res.json(await pet.fichaDoPet(id(req), canUse(acc, 'pet.vet:view')));
};
export const postPet = async (req: Request, res: Response) => res.status(201).json(await pet.cadastrarPet(parse(petSchema, req.body)));
export const patchPet = async (req: Request, res: Response) => res.json(await pet.atualizarPet(id(req), parse(petSchema.omit({ customerId: true }).partial().extend({ isActive: z.boolean().optional() }), req.body)));

export const getBanhos = async (req: Request, res: Response) => { const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date() }), req.query); res.json(await pet.agendaBanho(q.from, q.to)); };
export const postBanho = async (req: Request, res: Response) => res.status(201).json(await pet.agendarBanho(parse(z.object({ petId: z.string().uuid(), scheduledAt: z.coerce.date(), durationMin: z.number().int().min(10).max(480).optional(), services: z.string().min(2).max(200), price: z.number().nonnegative(), taxiDog: z.boolean().optional(), notes: z.string().max(500).optional() }), req.body)));
export const postMoverBanho = async (req: Request, res: Response) => { const b = parse(z.object({ to: z.nativeEnum(PetGroomingStatus), scheduledAt: z.coerce.date().optional(), notes: z.string().max(500).optional() }), req.body); res.json(await pet.moverBanho(id(req), b.to, { scheduledAt: b.scheduledAt, notes: b.notes })); };

export const postVacina = async (req: Request, res: Response) => res.status(201).json(await pet.registrarVacina(id(req), parse(z.object({ name: z.string().min(2).max(80), appliedAt: z.coerce.date(), nextDueAt: z.coerce.date().optional(), lot: z.string().max(40).optional(), vetName: z.string().max(80).optional() }), req.body)));
export const postAtendimento = async (req: Request, res: Response) => res.status(201).json(await pet.registrarAtendimento(id(req), parse(z.object({ kind: z.enum(['CONSULTA', 'RETORNO', 'EXAME', 'CIRURGIA', 'VACINA']), date: z.coerce.date().optional(), complaint: z.string().max(2000).optional(), diagnosis: z.string().max(2000).optional(), prescription: z.string().max(4000).optional(), weightKg: z.number().positive().max(200).optional(), vetName: z.string().max(80).optional(), returnAt: z.coerce.date().optional() }), req.body)));
export const getLembretes = async (req: Request, res: Response) => res.json(await pet.lembretes(parse(z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) }), req.query).dias));
export const getResumo = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await pet.resumo(a, b)); };
