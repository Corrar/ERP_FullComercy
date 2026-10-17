import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import * as n from './notifications.service';

// Qualquer logado vê o próprio sino: não há permissão específica.
const router = Router();
router.get('/', asyncHandler(async (req, res) => { res.json(await n.listMine(req.query.unread === '1')); }));
router.get('/unread-count', asyncHandler(async (_req, res) => { res.json({ count: await n.unreadCount() }); }));
router.post('/read', asyncHandler(async (req, res) => { const b = parse(z.object({ ids: z.union([z.literal('all'), z.array(z.string().uuid()).min(1)]) }), req.body); res.json(await n.markRead(b.ids)); }));
export default router;
