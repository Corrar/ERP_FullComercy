import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as roles from './roles.service';

export async function getRoles(_req: Request, res: Response) {
  res.json({ roles: await roles.listRoles(), catalog: roles.catalogForTenant() });
}

const createSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  name: z.string().min(2).max(80),
  permissions: z.array(z.string()).default([]),
});
export async function postRole(req: Request, res: Response) {
  res.status(201).json(await roles.createRole(parse(createSchema, req.body)));
}

const permsSchema = z.object({ permissions: z.array(z.string()) });
export async function putRolePermissions(req: Request, res: Response) {
  const b = parse(permsSchema, req.body);
  res.json(await roles.setRolePermissions(String(req.params.id), b.permissions));
}
