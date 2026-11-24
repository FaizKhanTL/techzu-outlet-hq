import { Router } from 'express';
import { validate } from '../../middleware/validate';
import {
  adjustStockSchemas,
  listInventorySchemas,
  listMovementsSchemas,
} from './inventory.schemas';
import * as controller from './inventory.controller';

// Mounted at /outlets/:outletId/inventory behind requireOutletAccess(): HQ and the outlet's own staff.
export const inventoryRouter = Router({ mergeParams: true });
inventoryRouter.get('/', validate(listInventorySchemas), controller.list);
inventoryRouter.post('/:menuItemId/adjustments', validate(adjustStockSchemas), controller.adjust);
inventoryRouter.get('/:menuItemId/movements', validate(listMovementsSchemas), controller.movements);
