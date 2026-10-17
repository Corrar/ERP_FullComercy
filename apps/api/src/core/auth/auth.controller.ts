import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as auth from './auth.service';
import type { AuthRequest } from './auth.middleware';
import { effectivePermissions } from '../rbac/rbac.service';
import { loadTenantSnapshot } from '../tenancy/tenant-modules.service';

const loginSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export async function postLogin(req: Request, res: Response) {
  const b = parse(loginSchema, req.body);
  const out = await auth.login({
    tenantSlug: b.tenant, email: b.email, password: b.password,
    ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
  });
  res.json(out);
}

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export async function postRefresh(req: Request, res: Response) {
  const b = parse(refreshSchema, req.body);
  res.json(await auth.refresh(b.refreshToken, { ip: req.ip, userAgent: req.get('user-agent') ?? undefined }));
}

export async function postLogout(req: Request, res: Response) {
  const b = parse(refreshSchema, req.body);
  await auth.logout(b.refreshToken);
  res.status(204).end();
}

/** GET /auth/me — a sessão relê o próprio acesso sem relogar (ligou um módulo? aparece aqui). */
export async function getMe(req: Request, res: Response) {
  const a = (req as AuthRequest).auth!;
  const [perms, snap] = await Promise.all([effectivePermissions(a.tenantId, a.userId), loadTenantSnapshot(a.tenantId)]);
  res.json({
    userId: a.userId,
    tenant: { id: snap.id, slug: snap.slug, name: snap.name, settings: snap.settings },
    permissions: perms.isAdmin ? ['*'] : [...perms.keys],
    modules: [...snap.modules.keys()],
  });
}

export async function postForgot(req: Request, res: Response) {
  const b = parse(z.object({ tenant: z.string().min(1), email: z.string().email() }), req.body);
  await auth.forgotPassword(b.tenant, b.email);
  res.status(204).end();
}
export async function postReset(req: Request, res: Response) {
  const b = parse(z.object({ token: z.string().min(20), password: z.string().min(8) }), req.body);
  res.json(await auth.resetPassword(b.token, b.password));
}
