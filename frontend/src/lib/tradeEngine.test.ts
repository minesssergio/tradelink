import { describe, it, expect } from 'vitest';
import { buildTradeEngine, calculateStats, type LotMethod } from './tradeEngine';

// ---------------------------------------------------------------------------
// Test helpers — build fake Schwab transaction payloads shaped like what
// dataTransformer.ts stores in schwab_transactions.raw_data.
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = () => `tx-${++seq}`;

function assetItem(symbol: string, amount: number, price: number, assetType: 'EQUITY' | 'OPTION' = 'EQUITY') {
  return { instrument: { assetType, symbol }, amount, price };
}

function feeItem(amount: number) {
  return { feeType: 'COMMISSION', amount };
}

/** A regular fill (buy/sell). `amount` sign encodes side: positive=BUY, negative=SELL. */
function trade(opts: {
  time: string;
  symbol: string;
  amount: number;
  price: number;
  fee?: number;
  assetType?: 'EQUITY' | 'OPTION';
  accountHash?: string;
}) {
  const items: unknown[] = [assetItem(opts.symbol, opts.amount, opts.price, opts.assetType ?? 'EQUITY')];
  if (opts.fee) items.push(feeItem(opts.fee));
  return {
    id: nextId(),
    time: opts.time,
    type: 'TRADE',
    account_hash: opts.accountHash ?? 'ACC1',
    raw_data: { transferItems: items },
  };
}

/** An option expiring worthless: RECEIVE_AND_DELIVER, CLOSING, price 0. */
function expiration(opts: { time: string; symbol: string; amount: number; accountHash?: string }) {
  return {
    id: nextId(),
    time: opts.time,
    type: 'RECEIVE_AND_DELIVER',
    account_hash: opts.accountHash ?? 'ACC1',
    raw_data: { transferItems: [assetItem(opts.symbol, opts.amount, 0, 'OPTION')] },
  };
}

const fifo = () => 'FIFO' as LotMethod;
const lifo = () => 'LIFO' as LotMethod;
const highCost = () => 'HIGH_COST' as LotMethod;
const lowCost = () => 'LOW_COST' as LotMethod;

describe('buildTradeEngine — basic matching', () => {
  it('closes a simple long equity trade with correct gross/net PnL', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'AAPL', amount: 10, price: 100, fee: 1 }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'AAPL', amount: -10, price: 110, fee: 1 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    const t = closedTrades[0];
    expect(t.side).toBe('LONG');
    expect(t.quantity).toBe(10);
    expect(t.grossPnL).toBeCloseTo(100, 6); // (110-100)*10
    expect(t.fees).toBeCloseTo(2, 6);
    expect(t.netPnL).toBeCloseTo(98, 6);
  });

  it('closes a short equity trade with correct sign', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'TSLA', amount: -5, price: 200 }), // sell to open
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'TSLA', amount: 5, price: 180 }),  // buy to cover
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].side).toBe('SHORT');
    expect(closedTrades[0].grossPnL).toBeCloseTo(100, 6); // (200-180)*5
  });

  it('applies the ×100 options multiplier to gross PnL', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'SPY  260101C00500000', amount: 1, price: 2.00, assetType: 'OPTION' }),
      trade({ time: '2026-01-01T14:00:00Z', symbol: 'SPY  260101C00500000', amount: -1, price: 3.00, assetType: 'OPTION' }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].multiplier).toBe(100);
    expect(closedTrades[0].grossPnL).toBeCloseTo((3 - 2) * 1 * 100, 6); // $100, not $1
  });

  it('does not create a multiplier for equities/ETFs', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'IBIT', amount: 10, price: 40, assetType: 'EQUITY' }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'IBIT', amount: -10, price: 41 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades[0].multiplier).toBe(1);
    expect(closedTrades[0].grossPnL).toBeCloseTo(10, 6);
  });
});

describe('buildTradeEngine — option expirations', () => {
  it('treats a RECEIVE_AND_DELIVER expiration as a closing fill at price 0', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'SPY  260201P00500000', amount: 1, price: 0.80, assetType: 'OPTION' }),
      expiration({ time: '2026-02-01T21:00:00Z', symbol: 'SPY  260201P00500000', amount: -1 }),
    ];
    const { closedTrades, openPositions } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].exitPrice).toBe(0);
    // Bought for $0.80 * 100, expired worthless -> lose the full premium
    expect(closedTrades[0].grossPnL).toBeCloseTo(-80, 6);
    // No open lots left dangling
    expect(Object.values(openPositions).every(lots => lots.length === 0)).toBe(true);
  });
});

describe('buildTradeEngine — per-account isolation', () => {
  it('never matches the same symbol across two different accounts', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'SPY', amount: 10, price: 500, accountHash: 'ACC_A' }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'SPY', amount: -10, price: 510, accountHash: 'ACC_B' }),
    ];
    const { closedTrades, openPositions } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(0);
    expect(openPositions['ACC_A|SPY']).toHaveLength(1);
    expect(openPositions['ACC_B|SPY']).toHaveLength(1);
  });
});

describe('buildTradeEngine — lot selection methods', () => {
  // Three opening lots at different prices AND a different chronological order
  // than price order, so FIFO/LIFO/HIGH_COST/LOW_COST each pick a distinct lot:
  //   lot0: opened first,  price $30 (highest)
  //   lot1: opened second, price $10 (lowest)
  //   lot2: opened third,  price $20 (newest)
  function threeLots(accountHash = 'ACC1') {
    return [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'XYZ', amount: 10, price: 30, accountHash }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'XYZ', amount: 10, price: 10, accountHash }),
      trade({ time: '2026-01-03T10:00:00Z', symbol: 'XYZ', amount: 10, price: 20, accountHash }),
    ];
  }

  it('FIFO closes the oldest lot first', () => {
    const txs = [...threeLots(), trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100 })];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades[0].entryPrice).toBe(30); // lot0, opened first
  });

  it('LIFO closes the newest lot first', () => {
    const txs = [...threeLots(), trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100 })];
    const { closedTrades } = buildTradeEngine(txs, lifo);
    expect(closedTrades[0].entryPrice).toBe(20); // lot2, opened last
  });

  it('HIGH_COST closes the highest-priced lot first (Schwab default for this user)', () => {
    const txs = [...threeLots(), trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100 })];
    const { closedTrades } = buildTradeEngine(txs, highCost);
    expect(closedTrades[0].entryPrice).toBe(30); // highest price among the 3 lots
  });

  it('LOW_COST closes the lowest-priced lot first', () => {
    const txs = [...threeLots(), trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100 })];
    const { closedTrades } = buildTradeEngine(txs, lowCost);
    expect(closedTrades[0].entryPrice).toBe(10); // lowest price among the 3 lots
  });

  it('supports a per-account lot method via the getLotMethod callback', () => {
    const txs = [
      ...threeLots('ACC_HIGH'),
      trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100, accountHash: 'ACC_HIGH' }),
      ...threeLots('ACC_LOW'),
      trade({ time: '2026-01-04T10:00:00Z', symbol: 'XYZ', amount: -10, price: 100, accountHash: 'ACC_LOW' }),
    ];
    const { closedTrades } = buildTradeEngine(txs, (acc) => (acc === 'ACC_HIGH' ? 'HIGH_COST' : 'LOW_COST'));
    const high = closedTrades.find(t => t.accountHash === 'ACC_HIGH')!;
    const low = closedTrades.find(t => t.accountHash === 'ACC_LOW')!;
    expect(high.entryPrice).toBe(30);
    expect(low.entryPrice).toBe(10);
  });
});

describe('buildTradeEngine — fee proration', () => {
  it('splits fees proportionally on a partial close', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'AAPL', amount: 10, price: 100, fee: 10 }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'AAPL', amount: -4, price: 110, fee: 2 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    // Opening lot fee share: $10 * (4/10) = $4; closing exec fee: $2 (fully consumed, 4/4)
    expect(closedTrades[0].fees).toBeCloseTo(6, 6);
  });

  it('does NOT double-count the opening lot fee across two separate partial closes', () => {
    // Regression test for a bug found 2026-07-08: closing a single lot across
    // multiple separate transactions re-applied the lot's full fee each time
    // because lot.fees was never reduced alongside lot.quantity.
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'AAPL', amount: 10, price: 100, fee: 10 }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'AAPL', amount: -4, price: 110, fee: 2 }),
      trade({ time: '2026-01-03T10:00:00Z', symbol: 'AAPL', amount: -6, price: 120, fee: 3 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(2);
    // closedTrades is sorted newest-close-first; sort back to chronological order for clarity.
    const [firstClose, secondClose] = [...closedTrades].sort(
      (a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime()
    );

    // First close (qty 4): lot share 10*(4/10)=4, exec share 2*(4/4)=2 -> total 6
    expect(firstClose.fees).toBeCloseTo(6, 6);
    // Second close (qty 6): lot share should be the REMAINING 6 (10-4), not a fresh 10*(6/6)=10
    // exec share 3*(6/6)=3 -> total 9, not 13
    expect(secondClose.fees).toBeCloseTo(9, 6);

    // Sanity: sum of lot-side shares across both closes must equal the original $10 opening fee
    const lotShare1 = firstClose.fees - 2; // subtract known exec fee
    const lotShare2 = secondClose.fees - 3;
    expect(lotShare1 + lotShare2).toBeCloseTo(10, 6);
  });
});

describe('buildTradeEngine — position reversal', () => {
  it('closes the existing long and opens a new short when the sell exceeds the position', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'AAPL', amount: 10, price: 100, fee: 5 }),
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'AAPL', amount: -15, price: 110, fee: 7.5 }),
    ];
    const { closedTrades, openPositions } = buildTradeEngine(txs, fifo);
    expect(closedTrades).toHaveLength(1);
    expect(closedTrades[0].quantity).toBe(10);
    // Half the exec's fee was consumed closing (10/15), leaving a fee-prorated remainder on the new short lot
    const remaining = openPositions['ACC1|AAPL'];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].side).toBe('SELL');
    expect(remaining[0].quantity).toBe(5);
    expect(remaining[0].fees).toBeCloseTo(7.5 * (5 / 15), 6);
  });
});

describe('calculateStats', () => {
  it('returns null for an empty trade list', () => {
    expect(calculateStats([])).toBeNull();
  });

  it('computes win rate, profit factor and averages using netPnL', () => {
    const txs = [
      // Win: +$100 gross, -$1 fee => net +$99
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'A', amount: 10, price: 10, fee: 0.5 }),
      trade({ time: '2026-01-01T11:00:00Z', symbol: 'A', amount: -10, price: 20, fee: 0.5 }),
      // Loss: -$50 gross, -$1 fee => net -$51
      trade({ time: '2026-01-02T10:00:00Z', symbol: 'B', amount: 10, price: 10, fee: 0.5 }),
      trade({ time: '2026-01-02T11:00:00Z', symbol: 'B', amount: -10, price: 5, fee: 0.5 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    const stats = calculateStats(closedTrades)!;

    expect(stats.totalTrades).toBe(2);
    expect(stats.winRate).toBeCloseTo(50, 6);
    expect(stats.netPnL).toBeCloseTo(99 - 51, 6);
    expect(stats.profitFactor).toBeCloseTo(99 / 51, 6);
    expect(stats.bestTrade).toBeCloseTo(99, 6);
    expect(stats.worstTrade).toBeCloseTo(-51, 6);
  });

  it('does not divide by zero when there are no losing trades (infinite profit factor collapses to gross wins)', () => {
    const txs = [
      trade({ time: '2026-01-01T10:00:00Z', symbol: 'A', amount: 10, price: 10 }),
      trade({ time: '2026-01-01T11:00:00Z', symbol: 'A', amount: -10, price: 20 }),
    ];
    const { closedTrades } = buildTradeEngine(txs, fifo);
    const stats = calculateStats(closedTrades)!;
    expect(stats.profitFactor).toBeCloseTo(100, 6);
    expect(Number.isFinite(stats.profitFactor)).toBe(true);
  });
});
