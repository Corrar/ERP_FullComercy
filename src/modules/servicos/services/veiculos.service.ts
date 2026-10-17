// modules/servicos/services/veiculos.service.ts — controle de placas.
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

/** Aceita "ABC-1234", "abc1d23" (Mercosul). Devolve normalizada ou null. */
export function normalizarPlaca(raw: string): string | null {
  const p = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p) ? p : null;
}

export async function buscarPorPlaca(raw: string) {
  const plate = normalizarPlaca(raw);
  if (!plate) throw AppError.validation('Placa inválida.');
  return ctx().db.svcVehicle.findUnique({ where: { tenantId_plate: { tenantId: ctx().tenantId, plate } }, include: { customer: true, serviceOrders: { take: 10, orderBy: { createdAt: 'desc' }, include: { order: { select: { number: true, total: true, status: true } } } } } });
}

export async function cadastrar(input: { customerId: string; plate: string; brand?: string; model?: string; year?: number; color?: string; vin?: string; mileage?: number }) {
  const plate = normalizarPlaca(input.plate);
  if (!plate) throw AppError.validation('Placa inválida.');
  return ctx().db.svcVehicle.create({ data: { ...input, plate, tenantId: ctx().tenantId } });
}
