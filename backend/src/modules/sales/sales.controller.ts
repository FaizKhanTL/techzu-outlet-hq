import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { BadRequestError } from '../../lib/errors';
import { page } from '../../lib/http';
import {
  createSaleSchemas,
  getSaleSchemas,
  idempotencyKeySchema,
  listSalesSchemas,
} from './sales.schemas';
import * as service from './sales.service';

export async function create(req: Request, res: Response) {
  const { params, body } = validated(req, createSaleSchemas);
  const header = req.get('idempotency-key');
  let idempotencyKey: string | undefined;
  if (header !== undefined) {
    const parsed = idempotencyKeySchema.safeParse(header);
    if (!parsed.success) {
      throw new BadRequestError(
        parsed.error.issues[0]!.message,
        undefined,
        'INVALID_IDEMPOTENCY_KEY',
      );
    }
    idempotencyKey = parsed.data;
  }
  const { sale, replayed } = await service.createSale(
    req.auth!,
    params.outletId,
    body,
    idempotencyKey,
  );
  if (replayed) res.setHeader('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).json({ data: sale });
}

export async function get(req: Request, res: Response) {
  const { params } = validated(req, getSaleSchemas);
  res.json({ data: await service.getSale(params.outletId, params.saleId) });
}

export async function list(req: Request, res: Response) {
  const { params, query } = validated(req, listSalesSchemas);
  const { items, total } = await service.listSales(params.outletId, query);
  res.json(page(items, { limit: query.limit, offset: query.offset, total }));
}
