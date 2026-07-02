import express from 'express';
import {
    createStockItem,
    updateStockItem,
    deleteStockItem,
    migratePartVariants,
    resolveVariant,
    getFamilyVariantsHandler,
    reconcileStockBalances,
} from '../controllers/stockController';
import { checkPermissions } from '../middlewares/auth';
import { checkSuperAdmin } from '../middlewares/checkSuperAdmin';
const router = express.Router();
router.get('/resolve-variant', resolveVariant);
router.get('/family/:baseNac', getFamilyVariantsHandler);
router.post('/migrate-part-variants', checkSuperAdmin, migratePartVariants);
router.post('/reconcile-balances', checkPermissions(['can_edit_stock_items']), reconcileStockBalances);
router.post('/create', checkPermissions(['can_add_new_items']), createStockItem);
router.put('/update/:id', checkPermissions(['can_edit_stock_items']), updateStockItem);
router.delete('/delete/:id', checkPermissions(['can_delete_stock_items']), deleteStockItem);
export default router;
