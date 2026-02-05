import express from 'express';
import { getLocationPhrases, getActiveLocationPhrases, createLocationPhrase, updateLocationPhrase, deleteLocationPhrase } from '../controllers/locationPhrasesController';
const router = express.Router();
router.get('/', getLocationPhrases);
router.get('/active', getActiveLocationPhrases);
router.post('/', createLocationPhrase);
router.put('/:id', updateLocationPhrase);
router.delete('/:id', deleteLocationPhrase);
export default router;
