import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { createSaleSchemas, getSaleSchemas, listSalesSchemas } from './sales.schemas';
import * as controller from './sales.controller';

// Mounted at /outlets/:outletId/sales behind requireOutletAccess().
export const salesRouter = Router({ mergeParams: true });
salesRouter.get('/', validate(listSalesSchemas), controller.list);
salesRouter.post('/', validate(createSaleSchemas), controller.create);
salesRouter.get('/:saleId', validate(getSaleSchemas), controller.get);
