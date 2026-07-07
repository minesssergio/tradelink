import { Router } from 'express';
import { getAuthUrl, handleCallback, triggerSync } from '../controllers/schwab.controller.js';

const router = Router();

router.get('/auth-url', getAuthUrl);
router.post('/callback', handleCallback);
router.post('/sync', triggerSync);

export default router;
