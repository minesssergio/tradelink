import { Router } from 'express';
import { runCronSync } from '../controllers/cron.controller.js';

const router = Router();

router.post('/sync', runCronSync);

export default router;
