import express from 'express';
import * as borrowReceiveController from '../controllers/borrowReceiveController';
import verifyJWT from '../middlewares/verifyJWT';
const router = express.Router();
router.post('/create', verifyJWT, borrowReceiveController.createBorrowReceive);
router.get('/:receiveId/details', verifyJWT, borrowReceiveController.getBorrowReceiveDetails);
router.post('/return', verifyJWT, borrowReceiveController.returnBorrowedItem);
router.get('/active/:nacCode', verifyJWT, borrowReceiveController.getActiveBorrowsForNac);
export default router;
