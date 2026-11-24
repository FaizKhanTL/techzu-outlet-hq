import { Router } from 'express';
import { authorize } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { revenueByOutletSchemas, topItemsSchemas } from './reports.schemas';
import * as controller from './reports.controller';

export const reportsRouter = Router();
reportsRouter.get(
  '/revenue-by-outlet',
  authorize('HQ_ADMIN'),
  validate(revenueByOutletSchemas),
  controller.revenueByOutlet,
);
reportsRouter.get('/top-items', validate(topItemsSchemas), controller.topItems);
