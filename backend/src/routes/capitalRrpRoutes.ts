import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import { checkPermissions, checkAnyPermissions } from '../middlewares/auth';
import * as capitalRrpController from '../controllers/capitalRrpController';

const router = express.Router();

router.get('/config', verifyJWT, checkPermissions(['can_create_assets_rrp']), capitalRrpController.getCapitalRRPConfig);
router.get('/items', verifyJWT, checkPermissions(['can_create_assets_rrp']), capitalRrpController.getCapitalRRPItems);
router.get(
    '/latest',
    verifyJWT,
    checkPermissions(['can_create_assets_rrp']),
    capitalRrpController.getLatestCapitalRRPDetails
);
router.get(
    '/verify/:rrpNumber',
    verifyJWT,
    checkPermissions(['can_create_assets_rrp']),
    capitalRrpController.verifyCapitalRRPNumber
);
router.post(
    '/validate-step1',
    verifyJWT,
    checkPermissions(['can_create_assets_rrp']),
    capitalRrpController.validateCapitalRRPStep1
);
router.post('/create', verifyJWT, checkPermissions(['can_create_assets_rrp']), capitalRrpController.createCapitalRRP);
router.get(
    '/pending',
    verifyJWT,
    checkPermissions(['can_approve_rrp']),
    capitalRrpController.getPendingCapitalRRPs
);
router.post(
    '/approve/:rrpNumber',
    verifyJWT,
    checkPermissions(['can_approve_rrp']),
    capitalRrpController.approveCapitalRRP
);
router.post(
    '/reject/:rrpNumber',
    verifyJWT,
    checkPermissions(['can_approve_rrp']),
    capitalRrpController.rejectCapitalRRP
);
router.put(
    '/update/:rrpNumber',
    verifyJWT,
    checkPermissions(['can_approve_rrp']),
    capitalRrpController.updateCapitalRRP
);
router.delete(
    '/item/:id',
    verifyJWT,
    checkPermissions(['can_approve_rrp']),
    capitalRrpController.deleteCapitalRRPItem
);
router.get(
    '/excel/:rrpNumber',
    verifyJWT,
    checkAnyPermissions(['can_create_assets_rrp', 'can_print_rrp']),
    capitalRrpController.downloadCapitalRRPExcel
);

export default router;
