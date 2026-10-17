import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as customers from './customers.service';

const schema = z.object({
  name: z.string().min(2).max(160),
  document: z.string().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  code: z.string().max(30).optional(),
  birthDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
const addressSchema = z.object({
  label: z.string().max(40).optional(), street: z.string().min(1), number: z.string().optional(),
  complement: z.string().optional(), district: z.string().optional(), city: z.string().min(1),
  state: z.string().length(2), zipCode: z.string().max(10).optional(), isDefault: z.boolean().optional(),
});

export const getCustomers = async (req: Request, res: Response) => res.json(await customers.list(typeof req.query.q === 'string' ? req.query.q : undefined));
export const getCustomer = async (req: Request, res: Response) => res.json(await customers.getById(String(req.params.id)));
export const postCustomer = async (req: Request, res: Response) => res.status(201).json(await customers.create(parse(schema, req.body)));
export const putCustomer = async (req: Request, res: Response) => res.json(await customers.update(String(req.params.id), parse(schema.partial(), req.body)));
export const postAddress = async (req: Request, res: Response) => res.status(201).json(await customers.addAddress(String(req.params.id), parse(addressSchema, req.body)));
