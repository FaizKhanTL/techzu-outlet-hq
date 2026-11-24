import { Router } from 'express';
import { authorize, requireOutletAccess } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  createOutletSchemas,
  getOutletSchemas,
  listOutletsSchemas,
  updateOutletSchemas,
} from './outlets.schemas';
import * as controller from './outlets.controller';

export const outletsRouter = Router();
outletsRouter.get('/', authorize('HQ_ADMIN'), validate(listOutletsSchemas), controller.list);
outletsRouter.post('/', authorize('HQ_ADMIN'), validate(createOutletSchemas), controller.create);
outletsRouter.get('/:outletId', requireOutletAccess(), validate(getOutletSchemas), controller.get);
outletsRouter.patch(
  '/:outletId',
  authorize('HQ_ADMIN'),
  validate(updateOutletSchemas),
  controller.update,
);
