import type { ClosedTrade } from './tradeEngine';

// ============================================================================
// Analytics helpers — pure functions over ClosedTrade[] used by the report
// pages (Breakdowns, Insights, Overall Statistics).
// ============================================================================

export interface BreakdownRow {
  key: string;
  trades: number;
  netPnL: number;
  grossPnL: number;
  fees: number;
  winRate: number;       // %
  profitFactor: number;
  avgPnL: number;
  bestTrade: number;
  worstTrade: number;
}

/** Groups trades by an arbitrary key and computes per-group performance. */
export function breakdownBy(trades: ClosedTrade[], keyFn: (t: ClosedTrade) => string): BreakdownRow[] {
  const groups: Record<string, ClosedTrade[]> = {};
  for (const t of trades) {
    const k = keyFn(t);
    (groups[k] ??= []).push(t);
  }

  return Object.entries(groups).map(([key, ts]) => {
    const wins = ts.filter(t => t.netPnL >= 0);
    const losses = ts.filter(t => t.netPnL < 0);
    const totalWins = wins.reduce((s, t) => s + t.netPnL, 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + t.netPnL, 0));
    const netPnL = ts.reduce((s, t) => s + t.netPnL, 0);
    return {
      key,
      trades: ts.length,
      netPnL,
      grossPnL: ts.reduce((s, t) => s + t.grossPnL, 0),
      fees: ts.reduce((s, t) => s + t.fees, 0),
      winRate: (wins.length / ts.length) * 100,
      profitFactor: totalLosses === 0 ? (totalWins > 0 ? Infinity : 0) : totalWins / totalLosses,
      avgPnL: netPnL / ts.length,
      bestTrade: Math.max(...ts.map(t => t.netPnL)),
      worstTrade: Math.min(...ts.map(t => t.netPnL)),
    };
  });
}

/** Underlying ticker: for OCC option symbols ("SPY   260416P00697000") → "SPY". */
export function underlyingOf(t: ClosedTrade): string {
  if (t.assetType === 'OPTION') return t.symbol.slice(0, 6).trim() || t.symbol;
  return t.symbol;
}

/** Instrument kind: Call / Put / Stock-ETF. */
export function instrumentKind(t: ClosedTrade): string {
  if (t.assetType === 'OPTION') {
    const cp = t.symbol.charAt(12);
    return cp === 'C' ? 'Calls' : cp === 'P' ? 'Puts' : 'Options';
  }
  return 'Stock / ETF';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function weekdayOf(t: ClosedTrade): string {
  return WEEKDAYS[new Date(t.closeDate).getDay()];
}

export function hourBucketOf(t: ClosedTrade): string {
  const h = new Date(t.openDate).getHours();
  return `${String(h).padStart(2, '0')}:00`;
}

export function durationBucketOf(t: ClosedTrade): string {
  const mins = t.durationMs / 60000;
  if (mins < 5) return '< 5 min';
  if (mins < 30) return '5–30 min';
  if (mins < 120) return '30 min – 2 h';
  if (mins < 60 * 24) return '2 h – 1 día';
  if (mins < 60 * 24 * 7) return '1 – 7 días';
  return '> 7 días';
}

export const DURATION_ORDER = ['< 5 min', '5–30 min', '30 min – 2 h', '2 h – 1 día', '1 – 7 días', '> 7 días'];

// ============================================================================
// Advanced stats
// ============================================================================

export interface AdvancedStats {
  expectancy: number;          // $ expected per trade
  payoffRatio: number;         // avgWin / avgLoss
  medianPnL: number;
  stdDevPnL: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  maxWinStreakPnL: number;
  maxLossStreakPnL: number;
  totalFees: number;
  feeDragPct: number;          // fees as % of gross wins
  avgDurationMs: number;
  totalWins: number;
  totalLosses: number;
  breakevenTrades: number;
}

export function advancedStats(trades: ClosedTrade[]): AdvancedStats | null {
  if (trades.length === 0) return null;

  const chronological = [...trades].sort((a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime());
  const wins = trades.filter(t => t.netPnL > 0);
  const losses = trades.filter(t => t.netPnL < 0);
  const breakeven = trades.length - wins.length - losses.length;

  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netPnL, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.netPnL, 0)) / losses.length : 0;
  const winRate = wins.length / trades.length;
  const lossRate = losses.length / trades.length;

  const pnls = trades.map(t => t.netPnL).sort((a, b) => a - b);
  const mid = Math.floor(pnls.length / 2);
  const median = pnls.length % 2 ? pnls[mid] : (pnls[mid - 1] + pnls[mid]) / 2;

  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length;

  // Streaks over chronological order
  let curWins = 0, curLosses = 0, maxW = 0, maxL = 0;
  let curWinPnL = 0, curLossPnL = 0, maxWinStreakPnL = 0, maxLossStreakPnL = 0;
  for (const t of chronological) {
    if (t.netPnL > 0) {
      curWins++; curWinPnL += t.netPnL;
      curLosses = 0; curLossPnL = 0;
      if (curWins > maxW) maxW = curWins;
      if (curWinPnL > maxWinStreakPnL) maxWinStreakPnL = curWinPnL;
    } else if (t.netPnL < 0) {
      curLosses++; curLossPnL += t.netPnL;
      curWins = 0; curWinPnL = 0;
      if (curLosses > maxL) maxL = curLosses;
      if (curLossPnL < maxLossStreakPnL) maxLossStreakPnL = curLossPnL;
    }
  }

  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const grossWins = trades.filter(t => t.grossPnL > 0).reduce((s, t) => s + t.grossPnL, 0);

  return {
    expectancy: winRate * avgWin - lossRate * avgLoss,
    payoffRatio: avgLoss === 0 ? avgWin : avgWin / avgLoss,
    medianPnL: median,
    stdDevPnL: Math.sqrt(variance),
    maxConsecWins: maxW,
    maxConsecLosses: maxL,
    maxWinStreakPnL,
    maxLossStreakPnL,
    totalFees,
    feeDragPct: grossWins > 0 ? (totalFees / grossWins) * 100 : 0,
    avgDurationMs: trades.reduce((s, t) => s + t.durationMs, 0) / trades.length,
    totalWins: wins.length,
    totalLosses: losses.length,
    breakevenTrades: breakeven,
  };
}

// ============================================================================
// Automatic insights — data-driven findings about what drags metrics down
// ============================================================================

export interface Insight {
  severity: 'good' | 'warning' | 'bad' | 'info';
  title: string;
  detail: string;
}

const fmt = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;

export function generateInsights(trades: ClosedTrade[]): Insight[] {
  if (trades.length < 10) {
    return [{ severity: 'info', title: 'Pocos datos', detail: 'Se necesitan al menos 10 trades cerrados para generar hallazgos fiables.' }];
  }

  const insights: Insight[] = [];
  const totalNet = trades.reduce((s, t) => s + t.netPnL, 0);
  const grossWins = trades.filter(t => t.netPnL > 0).reduce((s, t) => s + t.netPnL, 0);

  // 1. Worst offenders: top 5 losing trades and their impact
  const worst5 = [...trades].sort((a, b) => a.netPnL - b.netPnL).slice(0, 5).filter(t => t.netPnL < 0);
  if (worst5.length) {
    const sum = worst5.reduce((s, t) => s + t.netPnL, 0);
    insights.push({
      severity: 'bad',
      title: `Tus 5 peores trades te costaron ${fmt(sum)}`,
      detail: `${worst5.map(t => `${underlyingOf(t)} ${fmt(t.netPnL)}`).join(' · ')}. ${grossWins > 0 ? `Equivalen al ${Math.abs(sum / grossWins * 100).toFixed(1)}% de todo lo que ganaste.` : ''} Revisa qué tuvieron en común (hora, setup, tamaño).`,
    });
  }

  // 2. Best and worst underlying
  const byUnderlying = breakdownBy(trades, underlyingOf).filter(r => r.trades >= 3);
  if (byUnderlying.length >= 2) {
    const worst = [...byUnderlying].sort((a, b) => a.netPnL - b.netPnL)[0];
    const best = [...byUnderlying].sort((a, b) => b.netPnL - a.netPnL)[0];
    if (worst.netPnL < 0) {
      insights.push({
        severity: 'bad',
        title: `${worst.key} es tu subyacente más costoso: ${fmt(worst.netPnL)}`,
        detail: `${worst.trades} trades, win rate ${worst.winRate.toFixed(1)}%, profit factor ${worst.profitFactor === Infinity ? '∞' : worst.profitFactor.toFixed(2)}. Considera reducir tamaño o pausar este ticker.`,
      });
    }
    if (best.netPnL > 0) {
      insights.push({
        severity: 'good',
        title: `${best.key} es tu mejor subyacente: +${fmt(best.netPnL).replace('-', '')}`,
        detail: `${best.trades} trades, win rate ${best.winRate.toFixed(1)}%. Aquí está tu ventaja — analiza qué haces distinto.`,
      });
    }
  }

  // 3. Worst weekday
  const byDay = breakdownBy(trades, weekdayOf).filter(r => r.trades >= 5);
  const worstDay = [...byDay].sort((a, b) => a.netPnL - b.netPnL)[0];
  if (worstDay && worstDay.netPnL < 0) {
    insights.push({
      severity: 'warning',
      title: `Los ${worstDay.key} pierdes dinero: ${fmt(worstDay.netPnL)} en ${worstDay.trades} trades`,
      detail: `Win rate de ${worstDay.winRate.toFixed(1)}% ese día vs ${(trades.filter(t => t.netPnL >= 0).length / trades.length * 100).toFixed(1)}% global. Valora no operar (o reducir tamaño) ese día.`,
    });
  }

  // 4. Fee drag
  const adv = advancedStats(trades)!;
  if (adv.feeDragPct > 15) {
    insights.push({
      severity: 'warning',
      title: `Las comisiones se comen el ${adv.feeDragPct.toFixed(1)}% de tus ganancias`,
      detail: `${fmt(adv.totalFees)} en fees sobre ${fmt(grossWins)} de ganancias brutas. Menos trades y de más calidad reducen este drenaje.`,
    });
  }

  // 5. Scalps vs swings
  const byDuration = breakdownBy(trades, durationBucketOf);
  const scalps = byDuration.find(r => r.key === '< 5 min');
  if (scalps && scalps.trades >= 10 && scalps.netPnL < 0) {
    insights.push({
      severity: 'bad',
      title: `Los scalps de <5 min te cuestan ${fmt(scalps.netPnL)}`,
      detail: `${scalps.trades} trades ultrarrápidos con win rate ${scalps.winRate.toFixed(1)}%. Suelen ser entradas impulsivas — exige confirmación antes de entrar.`,
    });
  }

  // 6. Revenge trading: trades opened <15 min after a significant loss
  const chronological = [...trades].sort((a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime());
  const lossThreshold = adv.stdDevPnL;
  const revenge: ClosedTrade[] = [];
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1];
    const cur = chronological[i];
    if (prev.netPnL < -lossThreshold) {
      const gap = new Date(cur.openDate).getTime() - new Date(prev.closeDate).getTime();
      if (gap > 0 && gap < 15 * 60 * 1000) revenge.push(cur);
    }
  }
  if (revenge.length >= 5) {
    const revengePnL = revenge.reduce((s, t) => s + t.netPnL, 0);
    const revengeWR = revenge.filter(t => t.netPnL >= 0).length / revenge.length * 100;
    insights.push({
      severity: revengePnL < 0 ? 'bad' : 'info',
      title: `${revenge.length} posibles trades de revancha (entrada <15 min tras una pérdida grande)`,
      detail: `Resultado combinado: ${fmt(revengePnL)}, win rate ${revengeWR.toFixed(1)}%. ${revengePnL < 0 ? 'Después de una pérdida fuerte, para y respira antes de re-entrar.' : 'De momento los gestionas bien, pero vigílalos.'}`,
    });
  }

  // 7. Overtrading days
  const byDate: Record<string, ClosedTrade[]> = {};
  for (const t of chronological) (byDate[t.closeDate.slice(0, 10)] ??= []).push(t);
  const counts = Object.values(byDate).map(ts => ts.length).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)];
  const heavyDays = Object.entries(byDate).filter(([, ts]) => ts.length > medianCount * 2);
  if (heavyDays.length >= 3) {
    const heavyPnL = heavyDays.reduce((s, [, ts]) => s + ts.reduce((x, t) => x + t.netPnL, 0), 0);
    if (heavyPnL < 0) {
      insights.push({
        severity: 'warning',
        title: `Los días de sobreoperación te cuestan ${fmt(heavyPnL)}`,
        detail: `${heavyDays.length} días con más del doble de tu volumen habitual (mediana: ${medianCount} trades/día) terminaron en ${fmt(heavyPnL)}. Ponte un máximo de trades diario.`,
      });
    }
  }

  // 8. Expectancy verdict
  insights.push({
    severity: adv.expectancy >= 0 ? 'good' : 'bad',
    title: `Expectancy: ${fmt(adv.expectancy)} por trade`,
    detail: adv.expectancy >= 0
      ? `Con payoff ratio ${adv.payoffRatio.toFixed(2)}, tu sistema tiene esperanza positiva. Total: ${fmt(totalNet)} en ${trades.length} trades.`
      : `Esperanza negativa: cada trade te cuesta ${fmt(Math.abs(adv.expectancy))} en promedio. Sube el payoff ratio (${adv.payoffRatio.toFixed(2)}) cortando pérdidas antes o dejando correr las ganancias.`,
  });

  const order = { bad: 0, warning: 1, info: 2, good: 3 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
