export interface TradeExecution {
  id: string;
  time: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fees: number;
  /** Contract multiplier: 100 for options, 1 for equities/ETFs */
  multiplier: number;
  assetType: string;
  accountHash: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  openDate: string;
  closeDate: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnL: number;
  netPnL: number;
  fees: number;
  durationMs: number;
  multiplier: number;
  assetType: string;
  accountHash: string;
}

/**
 * Lot selection method — must match the account's setting in Schwab
 * ("Default Lot Selection Method") for PnL per trade to be faithful.
 * - FIFO: oldest lot first
 * - LIFO: newest lot first
 * - HIGH_COST: highest purchase price first (Schwab default for the user's accounts)
 * - LOW_COST: lowest purchase price first
 * (Tax Lot Optimizer is not reproducible client-side; use HIGH_COST as the closest proxy.)
 */
export type LotMethod = 'FIFO' | 'LIFO' | 'HIGH_COST' | 'LOW_COST';

export const LOT_METHOD_LABELS: Record<LotMethod, string> = {
  FIFO: 'First In First Out (FIFO)',
  LIFO: 'Last In First Out (LIFO)',
  HIGH_COST: 'High Cost',
  LOW_COST: 'Low Cost',
};

/** Picks the index of the next lot to close according to the method. Ties fall back to oldest-first. */
function pickLotIndex(lots: TradeExecution[], method: LotMethod): number {
  switch (method) {
    case 'FIFO':
      return 0;
    case 'LIFO':
      return lots.length - 1;
    case 'HIGH_COST': {
      let idx = 0;
      for (let i = 1; i < lots.length; i++) {
        if (lots[i].price > lots[idx].price) idx = i;
      }
      return idx;
    }
    case 'LOW_COST': {
      let idx = 0;
      for (let i = 1; i < lots.length; i++) {
        if (lots[i].price < lots[idx].price) idx = i;
      }
      return idx;
    }
  }
}

export function buildTradeEngine(
  transactions: any[],
  getLotMethod: (accountHash: string) => LotMethod = () => 'HIGH_COST'
): { closedTrades: ClosedTrade[], openPositions: Record<string, TradeExecution[]> } {
  // 1. Map fills AND option expirations/assignments to executions.
  //    TRADE = regular fills; RECEIVE_AND_DELIVER = option removed at expiration
  //    (a CLOSING event at price 0 that would otherwise leave the lot open forever).
  const executions: TradeExecution[] = [];

  for (const t of transactions) {
    if ((t.type === 'TRADE' || t.type === 'RECEIVE_AND_DELIVER') && t.raw_data && t.raw_data.transferItems) {
      const assetTransfer = t.raw_data.transferItems.find((item: any) => item.instrument?.assetType !== 'CURRENCY' && item.instrument?.symbol);
      const feeTransfers = t.raw_data.transferItems.filter((item: any) => item.feeType);

      if (assetTransfer && assetTransfer.amount) {
        const symbol = assetTransfer.instrument.symbol;
        const assetType = assetTransfer.instrument.assetType || 'EQUITY';
        const qty = assetTransfer.amount; // positive for buy, negative for sell
        const price = assetTransfer.price || 0;
        const fees = feeTransfers.reduce((acc: number, f: any) => acc + Math.abs(f.amount || 0), 0);

        executions.push({
          id: t.id,
          time: t.time,
          symbol,
          side: qty > 0 ? 'BUY' : 'SELL',
          quantity: Math.abs(qty),
          price,
          fees,
          multiplier: assetType === 'OPTION' ? 100 : 1,
          assetType,
          accountHash: t.account_hash || ''
        });
      }
    }
  }

  // Sort executions by time ascending (oldest first)
  executions.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // 2. Lot matching (method configurable per account: FIFO/LIFO/High Cost/Low Cost)
  const closedTrades: ClosedTrade[] = [];
  const openLots: Record<string, TradeExecution[]> = {};

  for (const exec of executions) {
    // Lots are keyed per account AND symbol: the same ticker traded in two
    // accounts must never be FIFO-matched across accounts.
    const lotKey = `${exec.accountHash}|${exec.symbol}`;
    if (!openLots[lotKey]) openLots[lotKey] = [];
    const lots = openLots[lotKey];

    // If no open lots, just push the new lot
    if (lots.length === 0) {
      lots.push({ ...exec });
      continue;
    }

    // Check if the current execution is in the SAME direction as existing lots
    const existingSide = lots[0].side;
    if (existingSide === exec.side) {
      // Adding to position
      lots.push({ ...exec });
      continue;
    }

    // Opposite side -> Closing position (match per the account's lot method)
    const lotMethod = getLotMethod(exec.accountHash);
    let remainingToClose = exec.quantity;

    while (remainingToClose > 0 && lots.length > 0) {
      const lotIdx = pickLotIndex(lots, lotMethod);
      const lot = lots[lotIdx];
      const matchQty = Math.min(lot.quantity, remainingToClose);

      const isLong = lot.side === 'BUY';

      const entryPrice = lot.price;
      const exitPrice = exec.price;

      const grossPnL = (isLong
        ? (exitPrice - entryPrice) * matchQty
        : (entryPrice - exitPrice) * matchQty) * exec.multiplier;

      const tradeFees = (lot.fees * (matchQty / lot.quantity)) + (exec.fees * (matchQty / exec.quantity));

      closedTrades.push({
        id: `${lot.id}-${exec.id}-${matchQty}`,
        symbol: exec.symbol,
        openDate: lot.time,
        closeDate: exec.time,
        side: isLong ? 'LONG' : 'SHORT',
        quantity: matchQty,
        entryPrice,
        exitPrice,
        grossPnL,
        netPnL: grossPnL - tradeFees,
        fees: tradeFees,
        durationMs: new Date(exec.time).getTime() - new Date(lot.time).getTime(),
        multiplier: exec.multiplier,
        assetType: exec.assetType,
        accountHash: exec.accountHash
      });

      remainingToClose -= matchQty;
      lot.quantity -= matchQty;

      if (lot.quantity === 0) {
        lots.splice(lotIdx, 1); // Remove fully closed lot
      }
    }
    
    // If there's still remaining to close, it means we reversed the position
    if (remainingToClose > 0) {
      lots.push({
        ...exec,
        quantity: remainingToClose,
        // fees were already mostly consumed, keep simple
      });
    }
  }

  return {
    closedTrades: closedTrades.sort((a, b) => new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime()), // Newest closed first
    openPositions: openLots // Not fully modeled for UI yet, but useful for debugging
  };
}

// Helper to calculate statistics
export function calculateStats(trades: ClosedTrade[]) {
  if (trades.length === 0) return null;

  const winningTrades = trades.filter(t => t.grossPnL > 0);
  const losingTrades = trades.filter(t => t.grossPnL <= 0);
  
  const grossPnL = trades.reduce((acc, t) => acc + t.grossPnL, 0);
  const netPnL = trades.reduce((acc, t) => acc + t.netPnL, 0);
  
  const totalWinsPnL = winningTrades.reduce((acc, t) => acc + t.grossPnL, 0);
  const totalLossPnL = Math.abs(losingTrades.reduce((acc, t) => acc + t.grossPnL, 0));
  
  const profitFactor = totalLossPnL === 0 ? totalWinsPnL : (totalWinsPnL / totalLossPnL);
  
  return {
    totalTrades: trades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    profitFactor,
    grossPnL,
    netPnL,
    avgTrade: grossPnL / trades.length,
    avgWin: winningTrades.length > 0 ? (totalWinsPnL / winningTrades.length) : 0,
    avgLoss: losingTrades.length > 0 ? (totalLossPnL / losingTrades.length) : 0,
    bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.grossPnL)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.grossPnL)) : 0,
  };
}
