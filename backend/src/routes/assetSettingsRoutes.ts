import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import { checkPermissions } from '../middlewares/auth';
import * as assetSettingsController from '../controllers/assetSettingsController';

const router = express.Router();

router.get(
    '/',
    verifyJWT,
    checkPermissions(['can_access_asset_management_system']),
    assetSettingsController.getAssetSettings
);
router.put(
    '/',
    verifyJWT,
    checkPermissions(['can_configure_asset_properties']),
    assetSettingsController.updateAssetSettings
);

export default router;
