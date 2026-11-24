import { Router } from 'express';
import { authorize } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  createMenuItemSchemas,
  getMenuItemSchemas,
  listMenuItemsSchemas,
  updateMenuItemSchemas,
} from './menu-items.schemas';
import * as controller from './menu-items.controller';

// The master menu is HQ's. Outlets read their own menu through /outlets/:outletId/menu-items.
export const menuItemsRouter = Router();
menuItemsRouter.use(authorize('HQ_ADMIN'));
menuItemsRouter.get('/', validate(listMenuItemsSchemas), controller.list);
menuItemsRouter.post('/', validate(createMenuItemSchemas), controller.create);
menuItemsRouter.get('/:menuItemId', validate(getMenuItemSchemas), controller.get);
menuItemsRouter.patch('/:menuItemId', validate(updateMenuItemSchemas), controller.update);
