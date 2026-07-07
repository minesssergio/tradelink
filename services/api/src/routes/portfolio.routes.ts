import { Router } from 'express';
import { getAccounts, getPositions, getTransactions, getBalances, getOrders, getGrowth } from '../controllers/portfolio.controller.js';

const router = Router();

router.get('/accounts', getAccounts);
router.get('/positions', getPositions);
router.get('/transactions', getTransactions);
router.get('/balances', getBalances);
router.get('/orders', getOrders);
router.get('/growth', getGrowth);

export default router;
