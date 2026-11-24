import { Router } from 'express';
import { authenticate, requireOutletAccess } from './middleware/authenticate';
import { authRouter } from './modules/auth/auth.routes';
import { outletsRouter } from './modules/outlets/outlets.routes';
import { menuItemsRouter } from './modules/menu-items/menu-items.routes';
import { outletMenuRouter } from './modules/outlet-menu/outlet-menu.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { reportsRouter } from './modules/reports/reports.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Everything below needs a signed-in user.
apiRouter.use(authenticate);
apiRouter.use('/menu-items', menuItemsRouter);
apiRouter.use('/reports', reportsRouter);
// Outlet-scoped resources: HQ sees every outlet, staff only their own.
apiRouter.use('/outlets/:outletId/menu-items', requireOutletAccess(), outletMenuRouter);
apiRouter.use('/outlets/:outletId/inventory', requireOutletAccess(), inventoryRouter);
apiRouter.use('/outlets/:outletId/sales', requireOutletAccess(), salesRouter);
apiRouter.use('/outlets', outletsRouter);
