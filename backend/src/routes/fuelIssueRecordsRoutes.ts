import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import { checkSuperAdmin } from '../middlewares/checkSuperAdmin';
import {
    getAllFuelIssueRecords,
    getFuelIssueRecordById,
    createFuelIssueRecord,
    updateFuelIssueRecord,
    deleteFuelIssueRecord,
    getFuelTypes,
    getNacCodes,
    rebuildFuelConsumptionAverages,
} from '../controllers/fuelIssueRecordsController';

const router = express.Router();

router.get('/filters/fuel-types', verifyJWT, getFuelTypes);
router.get('/filters/nac-codes', verifyJWT, getNacCodes);
router.post('/rebuild-consumption-averages', verifyJWT, checkSuperAdmin, rebuildFuelConsumptionAverages);
router.get('/', verifyJWT, getAllFuelIssueRecords);
router.get('/:id', verifyJWT, getFuelIssueRecordById);
router.post('/', verifyJWT, createFuelIssueRecord);
router.put('/:id', verifyJWT, updateFuelIssueRecord);
router.delete('/:id', verifyJWT, deleteFuelIssueRecord);

export default router;
