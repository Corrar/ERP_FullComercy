import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as users from './users.service';

export async function getUsers(_req: Request, res: Response) {
  res.json(await users.listUsers());
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  roleIds: z.array(z.string().uuid()).default([]),
});
export async function postUser(req: Request, res: Response) {
  res.status(201).json(await users.createUser(parse(createSchema, req.body)));
}

export async function putUserRoles(req: Request, res: Response) {
  const b = parse(z.object({ roleIds: z.array(z.string().uuid()) }), req.body);
  await users.setUserRoles(String(req.params.id), b.roleIds);
  res.status(204).end();
}

export async function patchUserActive(req: Request, res: Response) {
  const b = parse(z.object({ isActive: z.boolean() }), req.body);
  res.json(await users.setActive(String(req.params.id), b.isActive));
}

export async function patchUser(req: Request, res: Response) {
  res.json(await users.updateUser(String(req.params.id), parse(z.object({ name: z.string().min(2).max(120).optional(), email: z.string().email().optional() }), req.body)));
}
export async function postChangePassword(req: Request, res: Response) {
  const b = parse(z.object({ current: z.string().min(1), next: z.string().min(8) }), req.body);
  await users.changeOwnPassword(b.current, b.next);
  res.status(204).end();
}
export async function postResetPassword(req: Request, res: Response) {
  const b = parse(z.object({ next: z.string().min(8) }), req.body);
  await users.resetPassword(String(req.params.id), b.next);
  res.status(204).end();
}
export async function putUserExceptions(req: Request, res: Response) {
  const b = parse(z.object({ items: z.array(z.object({ permissionKey: z.string(), effect: z.enum(['ALLOW', 'DENY']) })) }), req.body);
  res.json(await users.setUserPermissionExceptions(String(req.params.id), b.items));
}
