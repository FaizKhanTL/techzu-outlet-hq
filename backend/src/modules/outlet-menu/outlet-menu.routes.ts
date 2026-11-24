import { Router } from 'express';
import { authorize } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  assignSchemas,
  outletMenuSchemas,
  unassignSchemas,
  updateAssignmentSchemas,
} from './outlet-menu.schemas';
import * as controller from './outlet-menu.controller';

// Mounted at /outlets/:outletId/menu-items behind requireOutletAccess().
export const outletMenuRouter = Router({ mergeParams: true });
outletMenuRouter.get('/', validate(outletMenuSchemas), controller.list);
outletMenuRouter.put(
  '/:menuItemId',
  authorize('HQ_ADMIN'),
  validate(assignSchemas),
  controller.assign,
);
outletMenuRouter.patch('/:menuItemId', validate(updateAssignmentSchemas), controller.update);
outletMenuRouter.delete(
  '/:menuItemId',
  authorize('HQ_ADMIN'),
  validate(unassignSchemas),
  controller.unassign,
);
