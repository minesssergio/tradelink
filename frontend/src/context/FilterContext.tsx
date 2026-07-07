import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { ClosedTrade, LotMethod } from '../lib/tradeEngine';

export interface AccountInfo {
  account_hash: string;
  account_number: string;
}

interface FilterContextValue {
  accounts: AccountInfo[];
  accountsLoading: boolean;
  /** Selected account hashes. Empty array = all accounts. */
  selected: string[];
  setSelected: (hashes: string[]) => void;
  /** Inclusive date range, 'YYYY-MM-DD' or null (no bound). */
  from: string | null;
  to: string | null;
  setRange: (from: string | null, to: string | null) => void;
  /** User-defined nicknames per account hash (e.g. "Swing", "Growth"). */
  aliases: Record<string, string>;
  setAlias: (hash: string, alias: string) => void;
  accountLabel: (hash: string) => string;
  /** True when any filter is active */
  isFiltering: boolean;
  clearFilters: () => void;
  /** Lot selection method (must mirror Schwab's per-account setting). */
  defaultLotMethod: LotMethod;
  setDefaultLotMethod: (m: LotMethod) => void;
  lotMethodOverrides: Record<string, LotMethod>;
  setAccountLotMethod: (hash: string, m: LotMethod | null) => void;
  getLotMethod: (accountHash: string) => LotMethod;
  // Filter helpers
  matchesAccount: (hash: string | null | undefined) => boolean;
  inDateRange: (isoTime: string) => boolean;
  filterTransactions: <T extends { account_hash?: string; time: string }>(txs: T[]) => T[];
  filterTransactionsByAccount: <T extends { account_hash?: string }>(txs: T[]) => T[];
  filterTrades: (trades: ClosedTrade[]) => ClosedTrade[];
  filterPositions: <T extends { account_hash?: string }>(positions: T[]) => T[];
}

const FilterContext = createContext<FilterContextValue | null>(null);

const LS_KEY = 'tradelink-filters';
const LS_ALIAS_KEY = 'tradelink-account-aliases';
const LS_LOT_KEY = 'tradelink-lot-methods';

const VALID_METHODS: LotMethod[] = ['FIFO', 'LIFO', 'HIGH_COST', 'LOW_COST'];

function loadLotConfig(): { default: LotMethod; perAccount: Record<string, LotMethod> } {
  try {
    const p = JSON.parse(localStorage.getItem(LS_LOT_KEY) || '{}');
    return {
      default: VALID_METHODS.includes(p.default) ? p.default : 'HIGH_COST',
      perAccount: typeof p.perAccount === 'object' && p.perAccount ? p.perAccount : {},
    };
  } catch {
    return { default: 'HIGH_COST', perAccount: {} };
  }
}

function loadPersisted(): { selected: string[]; from: string | null; to: string | null } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { selected: Array.isArray(p.selected) ? p.selected : [], from: p.from ?? null, to: p.to ?? null };
    }
  } catch { /* corrupted storage — start clean */ }
  return { selected: [], from: null, to: null };
}

/**
 * Default account names (keyed by Schwab account number). They ship in code so
 * they work in any browser; edits from the UI are stored in localStorage and
 * take precedence.
 */
const DEFAULT_ACCOUNT_NAMES: Record<string, string> = {
  '52523203': 'SMINESS',
  '70783062': 'Growth_26',
  '77014886': 'Trending_26',
  '77075350': 'Swing_26',
  '81408936': 'Spy_26',
};

function loadAliases(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_ALIAS_KEY) || '{}');
  } catch {
    return {};
  }
}

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const persisted = useMemo(loadPersisted, []);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selected, setSelectedState] = useState<string[]>(persisted.selected);
  const [from, setFrom] = useState<string | null>(persisted.from);
  const [to, setTo] = useState<string | null>(persisted.to);
  const [aliases, setAliases] = useState<Record<string, string>>(loadAliases);
  const [lotConfig, setLotConfig] = useState(loadLotConfig);

  useEffect(() => {
    api.getAccounts()
      .then(res => {
        setAccounts((res.data || []).map((a: any) => ({
          account_hash: a.account_hash,
          account_number: a.account_number || a.account_hash.slice(0, 8),
        })));
        setAccountsLoading(false);
      })
      .catch(err => {
        console.error('FilterContext: failed to load accounts', err);
        setAccountsLoading(false);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ selected, from, to }));
  }, [selected, from, to]);

  const setSelected = useCallback((hashes: string[]) => setSelectedState(hashes), []);
  const setRange = useCallback((f: string | null, t: string | null) => { setFrom(f); setTo(t); }, []);

  const setAlias = useCallback((hash: string, alias: string) => {
    setAliases(prev => {
      const next = { ...prev };
      if (alias.trim()) next[hash] = alias.trim();
      else delete next[hash];
      localStorage.setItem(LS_ALIAS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const accountLabel = useCallback((hash: string) => {
    const acc = accounts.find(a => a.account_hash === hash);
    const num = String(acc?.account_number || hash.slice(0, 8));
    const name = aliases[hash] || DEFAULT_ACCOUNT_NAMES[num];
    return name ? `${name} ···${num.slice(-4)}` : `···${num.slice(-4)}`;
  }, [aliases, accounts]);

  const matchesAccount = useCallback((hash: string | null | undefined) => {
    if (selected.length === 0) return true;
    return !!hash && selected.includes(hash);
  }, [selected]);

  const inDateRange = useCallback((isoTime: string) => {
    if (!isoTime) return false;
    const day = isoTime.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }, [from, to]);

  const filterTransactionsByAccount = useCallback(<T extends { account_hash?: string }>(txs: T[]) =>
    selected.length === 0 ? txs : txs.filter(t => matchesAccount(t.account_hash)),
  [selected, matchesAccount]);

  const filterTransactions = useCallback(<T extends { account_hash?: string; time: string }>(txs: T[]) =>
    txs.filter(t => matchesAccount(t.account_hash) && inDateRange(t.time)),
  [matchesAccount, inDateRange]);

  // Trades: account filter + date filter on the CLOSE date. The engine must be
  // fed account-filtered (but NOT date-filtered) transactions so entries opened
  // before the range still pair correctly with exits inside it.
  const filterTrades = useCallback((trades: ClosedTrade[]) =>
    trades.filter(t => matchesAccount(t.accountHash) && inDateRange(t.closeDate)),
  [matchesAccount, inDateRange]);

  const filterPositions = useCallback(<T extends { account_hash?: string }>(positions: T[]) =>
    positions.filter(p => matchesAccount(p.account_hash)),
  [matchesAccount]);

  const isFiltering = selected.length > 0 || !!from || !!to;
  const clearFilters = useCallback(() => { setSelectedState([]); setFrom(null); setTo(null); }, []);

  useEffect(() => {
    localStorage.setItem(LS_LOT_KEY, JSON.stringify(lotConfig));
  }, [lotConfig]);

  const setDefaultLotMethod = useCallback((m: LotMethod) =>
    setLotConfig(prev => ({ ...prev, default: m })), []);

  const setAccountLotMethod = useCallback((hash: string, m: LotMethod | null) =>
    setLotConfig(prev => {
      const perAccount = { ...prev.perAccount };
      if (m) perAccount[hash] = m;
      else delete perAccount[hash];
      return { ...prev, perAccount };
    }), []);

  const getLotMethod = useCallback((accountHash: string): LotMethod =>
    lotConfig.perAccount[accountHash] || lotConfig.default,
  [lotConfig]);

  const value: FilterContextValue = {
    accounts, accountsLoading, selected, setSelected,
    from, to, setRange, aliases, setAlias, accountLabel,
    isFiltering, clearFilters,
    defaultLotMethod: lotConfig.default,
    setDefaultLotMethod,
    lotMethodOverrides: lotConfig.perAccount,
    setAccountLotMethod,
    getLotMethod,
    matchesAccount, inDateRange,
    filterTransactions, filterTransactionsByAccount, filterTrades, filterPositions,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
};

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
