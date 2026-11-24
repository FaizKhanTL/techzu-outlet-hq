import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { revenueByOutletSchemas, topItemsSchemas } from './reports.schemas';
import * as service from './reports.service';

export async function revenueByOutlet(req: Request, res: Response) {
  const { query } = validated(req, revenueByOutletSchemas);
  res.json({ data: await service.revenueByOutlet(query) });
}

export async function topItems(req: Request, res: Response) {
  const { query } = validated(req, topItemsSchemas);
  res.json({ data: await service.topItems(req.auth!, query) });
}
