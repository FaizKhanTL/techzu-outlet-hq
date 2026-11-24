import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import {
  assignSchemas,
  outletMenuSchemas,
  unassignSchemas,
  updateAssignmentSchemas,
} from './outlet-menu.schemas';
import * as service from './outlet-menu.service';

export async function list(req: Request, res: Response) {
  const { params, query } = validated(req, outletMenuSchemas);
  res.json({ data: await service.getOutletMenu(params.outletId, query.sellable ?? false) });
}

export async function assign(req: Request, res: Response) {
  const { params, body } = validated(req, assignSchemas);
  const { created, item } = await service.assign(params.outletId, params.menuItemId, body);
  res.status(created ? 201 : 200).json({ data: item });
}

export async function update(req: Request, res: Response) {
  const { params, body } = validated(req, updateAssignmentSchemas);
  res.json({
    data: await service.updateAssignment(req.auth!, params.outletId, params.menuItemId, body),
  });
}

export async function unassign(req: Request, res: Response) {
  const { params } = validated(req, unassignSchemas);
  await service.unassign(params.outletId, params.menuItemId);
  res.status(204).end();
}
