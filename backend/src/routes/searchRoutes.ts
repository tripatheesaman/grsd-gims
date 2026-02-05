import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import { getItemDetails, searchStockDetails, getAvailableUnits } from '../controllers/searchController';
const router = express.Router();
router.get('/item/:id', verifyJWT, getItemDetails);
router.get('/stock', verifyJWT, searchStockDetails);
router.get('/units', verifyJWT, getAvailableUnits);
export default router;
