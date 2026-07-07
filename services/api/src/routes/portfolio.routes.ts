import { Router } from 'express';
import { getAccounts, getPositions, getTransactions, getBalances } from '../controllers/portfolio.controller.js';

const router = Router();

router.get('/accounts', getAccounts);
router.get('/positions', getPositions);
router.get('/transactions', getTransactions);
router.get('/balances', getBalances);

export default router;
