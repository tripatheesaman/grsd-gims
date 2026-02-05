import express from 'express';
import * as tenderReceiveController from '../controllers/tenderReceiveController';
import verifyJWT from '../middlewares/verifyJWT';
const router = express.Router();
router.post('/create', verifyJWT, tenderReceiveController.createTenderReceive);
router.get('/:receiveId/details', verifyJWT, tenderReceiveController.getTenderReceiveDetails);
router.get('/rrps', verifyJWT, tenderReceiveController.getTenderRRPs);
export default router;
