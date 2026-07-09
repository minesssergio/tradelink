import { describe, it, expect } from 'vitest';
import type { ClosedTrade } from './tradeEngine';
import {
  breakdownBy,
  underlyingOf,
  instrumentKind,
  durationBucketOf,
  DURATION_ORDER,
  advancedStats,
  rollingWinRate,
  generateInsights,
} from './analytics';

let seq = 0;

/** Builds a ClosedTrade fixture with sensible defaults, override anything needed per test. */
function ct(overrides: Partial<ClosedTrade> & { netPnL: number }): ClosedTrade {
  seq++;
  return {
    id: `t${seq}`,
    symbol: 'AAPL',
    openDate: '2026-01-01T10:00:00Z',
    closeDate: '2026-01-01T11:00:00Z',
    side: 'LONG',
    quantity: 1,
    entryPrice: 100,
    exitPrice: 101,
    grossPnL: overrides.netPnL,
    fees: 0,
    durationMs: 60 * 60 * 1000,
    multiplier: 1,
    assetType: 'EQUITY',
    accountHash: 'ACC1',
    ...overrides,
  };
}

describe('breakdownBy', () => {
  it('groups trades by an arbitrary key and computes per-group performance', () => {
    const trades = [
      ct({ symbol: 'SPY', netPnL: 10 }),
      ct({ symbol: 'SPY', netPnL: -5 }),
      ct({ symbol: 'AAPL', netPnL: 20 }),
    ];
    const rows = breakdownBy(trades, t => t.symbol);
    const spy = rows.find(r => r.key === 'SPY')!;
    expect(spy.trades).toBe(2);
    expect(spy.netPnL).toBeCloseTo(5, 6);
    expect(spy.winRate).toBeCloseTo(50, 6);
  });

  it('treats an all-winning group as infinite profit factor (no losses to divide by)', () => {
    const rows = breakdownBy([ct({ netPnL: 10 }), ct({ netPnL: 20 })], () => 'ALL');
    expect(rows[0]!.profitFactor).toBe(Infinity);
  });
});

describe('underlyingOf / instrumentKind', () => {
  it('extracts the underlying ticker from an OCC option symbol', () => {
    const t = ct({ netPnL: 1, assetType: 'OPTION', symbol: 'SPY   260416P00697000' });
    expect(underlyingOf(t)).toBe('SPY');
  });

  it('classifies puts vs calls vs stock/ETF', () => {
    const put = ct({ netPnL: 1, assetType: 'OPTION', symbol: 'SPY   260416P00697000' });
    const call = ct({ netPnL: 1, assetType: 'OPTION', symbol: 'SPY   260416C00697000' });
    const stock = ct({ netPnL: 1, assetType: 'EQUITY', symbol: 'AAPL' });
    expect(instrumentKind(put)).toBe('Puts');
    expect(instrumentKind(call)).toBe('Calls');
    expect(instrumentKind(stock)).toBe('Stock / ETF');
  });
});

describe('durationBucketOf', () => {
  it('buckets in ascending order matching DURATION_ORDER', () => {
    const MIN = 60_000;
    expect(durationBucketOf(ct({ netPnL: 1, durationMs: 2 * MIN }))).toBe('< 5 min');
    expect(durationBucketOf(ct({ netPnL: 1, durationMs: 45 * MIN }))).toBe('30 min – 2 h');
    expect(durationBucketOf(ct({ netPnL: 1, durationMs: 10 * 24 * 60 * MIN }))).toBe('> 7 días');
    expect(DURATION_ORDER.indexOf('< 5 min')).toBeLessThan(DURATION_ORDER.indexOf('> 7 días'));
  });
});

describe('advancedStats', () => {
  it('returns null for an empty list', () => {
    expect(advancedStats([])).toBeNull();
  });

  it('computes expectancy and payoff ratio consistent with win/loss averages', () => {
    const trades = [
      ct({ closeDate: '2026-01-01T11:00:00Z', netPnL: 99 }),
      ct({ closeDate: '2026-01-02T11:00:00Z', netPnL: -51 }),
    ];
    const adv = advancedStats(trades)!;
    expect(adv.expectancy).toBeCloseTo(0.5 * 99 - 0.5 * 51, 6);
    expect(adv.payoffRatio).toBeCloseTo(99 / 51, 6);
    expect(adv.totalWins).toBe(1);
    expect(adv.totalLosses).toBe(1);
  });

  it('finds the longest streaks and their $ impact in chronological order', () => {
    const trades = ['W', 'W', 'L', 'L', 'L', 'W'].map((outcome, i) => ct({
      closeDate: `2026-01-0${i + 1}T11:00:00Z`,
      netPnL: outcome === 'W' ? 10 : -10,
    }));
    const adv = advancedStats(trades)!;
    expect(adv.maxConsecWins).toBe(2);
    expect(adv.maxConsecLosses).toBe(3);
    expect(adv.maxLossStreakPnL).toBeCloseTo(-30, 6);
  });
});

describe('rollingWinRate', () => {
  it('produces one point per trailing window once enough trades exist', () => {
    const trades = [1, 2, 3, 4, 5].map(i => ct({
      closeDate: `2026-01-0${i}T10:00:00Z`,
      netPnL: i % 2 === 0 ? 10 : -10, // L W L W L chronologically
    }));
    const points = rollingWinRate(trades, 3);
    expect(points).toHaveLength(3);
    expect(points[0]!.winRate).toBeCloseTo((1 / 3) * 100, 6); // first 3: L,W,L
  });

  it('returns nothing when there are fewer trades than the window size', () => {
    expect(rollingWinRate([ct({ netPnL: 1 }), ct({ netPnL: -1 })], 20)).toEqual([]);
  });
});

describe('generateInsights', () => {
  it('asks for more data when there are fewer than 10 trades', () => {
    const insights = generateInsights([ct({ netPnL: 10 })]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.severity).toBe('info');
  });

  it('flags a losing underlying with at least 3 trades as a bad insight', () => {
    const trades = [
      ...Array.from({ length: 4 }, () => ct({ symbol: 'SPY', netPnL: -20 })),
      ...Array.from({ length: 6 }, () => ct({ symbol: 'AAPL', netPnL: 15 })),
    ];
    const insights = generateInsights(trades);
    expect(insights.some(i => i.title.includes('SPY') && i.severity === 'bad')).toBe(true);
  });
});
