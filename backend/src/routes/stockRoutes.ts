import express from 'express';
import { createStockItem, updateStockItem, deleteStockItem } from '../controllers/stockController';
import { checkPermissions } from '../middlewares/auth';
const router = express.Router();
router.post('/create', checkPermissions(['can_add_new_items']), createStockItem);
router.put('/update/:id', checkPermissions(['can_edit_stock_items']), updateStockItem);
router.delete('/delete/:id', checkPermissions(['can_delete_stock_items']), deleteStockItem);
export default router;
