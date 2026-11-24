import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate';
import { page } from '../../lib/http';
import {
  createMenuItemSchemas,
  getMenuItemSchemas,
  listMenuItemsSchemas,
  updateMenuItemSchemas,
} from './menu-items.schemas';
import * as service from './menu-items.service';

export async function create(req: Request, res: Response) {
  const { body } = validated(req, createMenuItemSchemas);
  res.status(201).json({ data: await service.createMenuItem(body) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = validated(req, updateMenuItemSchemas);
  res.json({ data: await service.updateMenuItem(params.menuItemId, body) });
}

export async function get(req: Request, res: Response) {
  const { params } = validated(req, getMenuItemSchemas);
  res.json({ data: await service.getMenuItem(params.menuItemId) });
}

export async function list(req: Request, res: Response) {
  const { query } = validated(req, listMenuItemsSchemas);
  const { items, total } = await service.listMenuItems(query);
  res.json(page(items, { limit: query.limit, offset: query.offset, total }));
}
