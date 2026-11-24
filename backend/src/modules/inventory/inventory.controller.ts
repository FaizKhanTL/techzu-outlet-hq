import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { page } from '../../lib/http';
import {
  adjustStockSchemas,
  listInventorySchemas,
  listMovementsSchemas,
} from './inventory.schemas';
import * as service from './inventory.service';

export async function list(req: Request, res: Response) {
  const { params } = validated(req, listInventorySchemas);
  res.json({ data: await service.listInventory(params.outletId) });
}

export async function adjust(req: Request, res: Response) {
  const { params, body } = validated(req, adjustStockSchemas);
  res
    .status(201)
    .json({ data: await service.adjustStock(req.auth!, params.outletId, params.menuItemId, body) });
}

export async function movements(req: Request, res: Response) {
  const { params, query } = validated(req, listMovementsSchemas);
  const { items, total } = await service.listMovements(
    params.outletId,
    params.menuItemId,
    query.limit,
    query.offset,
  );
  res.json(page(items, { limit: query.limit, offset: query.offset, total }));
}
