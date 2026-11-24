import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { page } from '../../lib/http';
import {
  createOutletSchemas,
  getOutletSchemas,
  listOutletsSchemas,
  updateOutletSchemas,
} from './outlets.schemas';
import * as service from './outlets.service';

export async function create(req: Request, res: Response) {
  const { body } = validated(req, createOutletSchemas);
  res.status(201).json({ data: await service.createOutlet(body) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = validated(req, updateOutletSchemas);
  res.json({ data: await service.updateOutlet(params.outletId, body) });
}

export async function get(req: Request, res: Response) {
  const { params } = validated(req, getOutletSchemas);
  res.json({ data: await service.getOutlet(params.outletId) });
}

export async function list(req: Request, res: Response) {
  const { query } = validated(req, listOutletsSchemas);
  const { items, total } = await service.listOutlets(query);
  res.json(page(items, { limit: query.limit, offset: query.offset, total }));
}
