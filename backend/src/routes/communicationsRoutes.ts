import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import {
    getUnacknowledgedThreads,
    listCommunicationThreads,
    getCommunicationThread,
    createCommunicationThread,
    acknowledgeCommunicationThread,
    replyToCommunicationThread,
    concludeCommunicationThread,
    assignCommunicationThread,
    listCommunicationAssignees,
    getActiveThreadCount,
    listMentionableUsers,
} from '../controllers/communicationsController';

const router = express.Router();

router.get('/unacknowledged', verifyJWT, getUnacknowledgedThreads);
router.get('/active-count', verifyJWT, getActiveThreadCount);
router.get('/mentionable-users', verifyJWT, listMentionableUsers);
router.get('/assignees', verifyJWT, listCommunicationAssignees);
router.get('/', verifyJWT, listCommunicationThreads);
router.get('/:id', verifyJWT, getCommunicationThread);
router.post('/', verifyJWT, createCommunicationThread);
router.post('/:id/acknowledge', verifyJWT, acknowledgeCommunicationThread);
router.post('/:id/reply', verifyJWT, replyToCommunicationThread);
router.post('/:id/conclude', verifyJWT, concludeCommunicationThread);
router.post('/:id/assign', verifyJWT, assignCommunicationThread);

export default router;
