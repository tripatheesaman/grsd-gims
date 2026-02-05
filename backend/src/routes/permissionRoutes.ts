import express from 'express';
import { getPermissions } from '../controllers/permissionController';
const router = express.Router();
router.get('/', getPermissions);
export default router;
