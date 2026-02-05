import express from 'express';
import { getAllAssetTypes, getAssetTypeById, createAssetType, updateAssetType, deleteAssetType } from '../controllers/assetTypeController';
const router = express.Router();
router.get('/', getAllAssetTypes);
router.get('/:id', getAssetTypeById);
router.post('/', createAssetType);
router.put('/:id', updateAssetType);
router.delete('/:id', deleteAssetType);
export default router;
