import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import { checkPermissions, checkAnyPermissions } from '../middlewares/auth';
import * as assetReceiveController from '../controllers/assetReceiveController';

const router = express.Router();

router.post(
    '/create',
    verifyJWT,
    checkPermissions(['can_receive_assets']),
    assetReceiveController.createAssetReceive
);
router.get(
    '/pending',
    verifyJWT,
    checkPermissions(['can_approve_assets_receive']),
    assetReceiveController.getPendingAssetReceives
);
router.get(
    '/search',
    verifyJWT,
    checkAnyPermissions(['can_receive_assets', 'can_create_assets_rrp']),
    assetReceiveController.searchAssetReceives
);
router.get(
    '/list',
    verifyJWT,
    checkAnyPermissions(['can_receive_assets', 'can_approve_assets_receive']),
    assetReceiveController.listAssetReceives
);
router.get(
    '/:id/details',
    verifyJWT,
    checkPermissions(['can_approve_assets_receive']),
    assetReceiveController.getAssetReceiveDetails
);
router.put(
    '/:id/approve',
    verifyJWT,
    checkPermissions(['can_approve_assets_receive']),
    assetReceiveController.approveAssetReceive
);
router.put(
    '/:id/reject',
    verifyJWT,
    checkPermissions(['can_approve_assets_receive']),
    assetReceiveController.rejectAssetReceive
);

export default router;
