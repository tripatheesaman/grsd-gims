import express from 'express';
import { getAllAssets, getAssetById, createAsset, updateAsset, deleteAsset } from '../controllers/assetController';
const router = express.Router();
router.get('/', getAllAssets);
router.get('/:id', getAssetById);
router.post('/', createAsset);
router.put('/:id', updateAsset);
router.delete('/:id', deleteAsset);
export default router;
