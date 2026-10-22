import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import { paginacaoSchema, paginar } from '../../shared/paginacao';
import { requirePermission } from '../rbac/rbac.middleware';
import { ctx } from '../tenancy/tenant-context';

const router = Router();
router.get('/', requirePermission('core.tenant:manage'), asyncHandler(async (req, res) => {
  const q = parse(paginacaoSchema.extend({ action: z.string().optional(), userId: z.string().uuid().optional(), entityId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), take: z.coerce.number().int().max(500).default(100) }), req.query);
  const where = { action: q.action ? { startsWith: q.action } : undefined, userId: q.userId, entityId: q.entityId, createdAt: { gte: q.from, lte: q.to } };
  res.json(await paginar(q, q.take, async (skip, take) => (await ctx().db.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip, take })).map((r) => ({ ...r, id: r.id.toString() })), () => ctx().db.auditLog.count({ where })));
}));
export default router;
