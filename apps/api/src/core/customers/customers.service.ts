import { ctx } from '../tenancy/tenant-context';
import { AppError } from '../../shared/errors';

export interface CustomerInput {
  name: string; document?: string; email?: string; phone?: string; code?: string;
  birthDate?: Date; notes?: string; tags?: string[];
}

const onlyDigits = (s?: string) => (s ? s.replace(/\D/g, '') || undefined : undefined);

export async function list(q?: string) {
  return ctx().db.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: onlyDigits(q) ?? q } }, { document: onlyDigits(q) }] } : undefined,
    orderBy: { name: 'asc' }, take: 100,
  });
}

export async function getById(id: string) {
  const c = await ctx().db.customer.findUnique({ where: { id }, include: { addresses: true } });
  if (!c) throw AppError.notFound('Cliente');
  return c;
}

export async function create(input: CustomerInput) {
  return ctx().db.customer.create({ data: { ...input, tenantId: ctx().tenantId, document: onlyDigits(input.document), phone: onlyDigits(input.phone), email: input.email?.toLowerCase() } });
}

export async function update(id: string, input: Partial<CustomerInput>) {
  await getById(id);
  return ctx().db.customer.update({ where: { id }, data: { ...input, document: onlyDigits(input.document), phone: onlyDigits(input.phone) } });
}

export async function addAddress(customerId: string, addr: { street: string; number?: string; complement?: string; district?: string; city: string; state: string; zipCode?: string; label?: string; isDefault?: boolean }) {
  await getById(customerId);
  const { db, tenantId } = ctx();
  if (addr.isDefault) await db.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
  return db.customerAddress.create({ data: { ...addr, customerId, tenantId } });
}

export const setActive = (id: string, isActive: boolean) => ctx().db.customer.update({ where: { id }, data: { isActive } });
export const removeAddress = (customerId: string, addressId: string) => ctx().db.customerAddress.deleteMany({ where: { id: addressId, customerId } });

/** O retrato comercial do cliente: compras, ticket médio, última compra, em aberto. */
export async function summary(customerId: string) {
  const { db } = ctx();
  const [c, agg, ultimo, emAberto] = await Promise.all([
    getById(customerId),
    db.order.aggregate({ where: { customerId, status: 'COMPLETED' }, _count: true, _sum: { total: true }, _avg: { total: true } }),
    db.order.findFirst({ where: { customerId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { number: true, total: true, completedAt: true } }),
    db.financeEntry.aggregate({ where: { customerId, kind: 'RECEIVABLE', status: { in: ['OPEN', 'PARTIAL'] } }, _sum: { amount: true, paidAmount: true }, _count: true }),
  ]);
  return { cliente: c, compras: agg._count, totalGasto: agg._sum.total ?? 0, ticketMedio: agg._avg.total ?? 0, ultimaCompra: ultimo, emAberto: { titulos: emAberto._count, valor: (emAberto._sum.amount ?? 0) } };
}
