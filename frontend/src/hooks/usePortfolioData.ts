import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { buildTradeEngine, type ClosedTrade } from '../lib/tradeEngine';
import { useFilters } from '../context/FilterContext';

// ---------------------------------------------------------------------------
// Module-level cache: the full history is fetched once per session instead of
// on every page navigation. Call invalidatePortfolioCache() after a sync (or
// any server-side data change) so the next mount refetches.
// ---------------------------------------------------------------------------
let txPromise: Promise<any[]> | null = null;
let posPromise: Promise<any[]> | null = null;
let balPromise: Promise<any[]> | null = null;

export function invalidatePortfolioCache() {
  txPromise = null;
  posPromise = null;
  balPromise = null;
}

const cachedTransactions = () =>
  (txPromise ??= api.getTransactions().then(r => r.data || []).catch(err => { txPromise = null; throw err; }));
const cachedPositions = () =>
  (posPromise ??= api.getPositions().then(r => r.data || []).catch(err => { posPromise = null; throw err; }));
const cachedBalances = () =>
  (balPromise ??= api.getBalances().then(r => r.data || []).catch(err => { balPromise = null; throw err; }));

const friendlyError = (err: unknown) =>
  err instanceof TypeError
    ? 'No se puede conectar con el servidor API (localhost:3001). Arranca los servidores con start.bat.'
    : String((err as any)?.message || err);

/**
 * Fetches the full transaction history once and exposes:
 * - transactions: filtered by account AND date (for raw listings)
 * - closedTrades: FIFO trades built from account-filtered transactions,
 *   then filtered by close date (so positions opened before the range
 *   still pair correctly with exits inside it).
 */
export function usePortfolioData() {
  const { filterTransactions, filterTransactionsByAccount, filterTrades, getLotMethod, dataVersion } = useFilters();
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cachedTransactions()
      .then(data => {
        if (cancelled) return;
        setRawTransactions(data);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error(err);
        setError(friendlyError(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dataVersion]);

  const transactions = useMemo(
    () => filterTransactions(rawTransactions),
    [rawTransactions, filterTransactions]
  );

  const closedTrades: ClosedTrade[] = useMemo(() => {
    const accountScoped = filterTransactionsByAccount(rawTransactions);
    const { closedTrades } = buildTradeEngine(accountScoped, getLotMethod);
    return filterTrades(closedTrades);
  }, [rawTransactions, filterTransactionsByAccount, filterTrades, getLotMethod]);

  return { transactions, closedTrades, loading, error };
}

export interface AccountBalance {
  account_hash: string;
  account_number: string;
  type: string;
  net_liq: number | null;
  initial_net_liq: number | null;
  day_change: number | null;
  cash: number | null;
  available_funds: number | null;
  buying_power: number | null;
  positions_value: number;
  position_count: number;
}

/**
 * Live account balances straight from Schwab (Net Liq, day change, available
 * funds, cash), filtered by the selected accounts. Aggregates are provided for
 * KPI cards.
 */
export function useLiveBalances() {
  const { matchesAccount, dataVersion } = useFilters();
  const [rawBalances, setRawBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cachedBalances()
      .then(data => {
        if (cancelled) return;
        setRawBalances(data);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Live balances unavailable:', err);
        setError(friendlyError(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dataVersion]);

  const balances = useMemo(
    () => rawBalances.filter(b => matchesAccount(b.account_hash)),
    [rawBalances, matchesAccount]
  );

  const totals = useMemo(() => {
    const sum = (fn: (b: AccountBalance) => number | null) =>
      balances.reduce((acc, b) => acc + (fn(b) ?? 0), 0);
    const netLiq = sum(b => b.net_liq);
    const initialNetLiq = sum(b => b.initial_net_liq);
    const dayChange = sum(b => b.day_change);
    return {
      netLiq,
      dayChange,
      dayChangePct: initialNetLiq > 0 ? (dayChange / initialNetLiq) * 100 : 0,
      cash: sum(b => b.cash),
      availableFunds: sum(b => b.available_funds),
      positionsValue: sum(b => b.positions_value),
    };
  }, [balances]);

  return { balances, totals, loading, error };
}

/** Fetches open positions and filters them by the selected accounts. */
export function useFilteredPositions() {
  const { filterPositions, dataVersion } = useFilters();
  const [rawPositions, setRawPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cachedPositions()
      .then(data => {
        if (cancelled) return;
        setRawPositions(data);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error(err);
        setError(friendlyError(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dataVersion]);

  const positions = useMemo(() => filterPositions(rawPositions), [rawPositions, filterPositions]);

  return { positions, loading, error };
}
