import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { ctx } from '../tenancy/tenant-context';

const router = Router();
router.get('/', requirePermission('core.tenant:manage'), asyncHandler(async (req, res) => {
  const q = parse(z.object({ action: z.string().optional(), userId: z.string().uuid().optional(), entityId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), take: z.coerce.number().int().max(500).default(100) }), req.query);
  const rows = await ctx().db.auditLog.findMany({
    where: { action: q.action ? { startsWith: q.action } : undefined, userId: q.userId, entityId: q.entityId, createdAt: { gte: q.from, lte: q.to } },
    include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: q.take,
  });
  res.json(rows.map((r) => ({ ...r, id: r.id.toString() })));
}));
export default router;
