import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadSchwabConfig } from '@trading-journal/schwab-service/src/config/schwab.config.js';
import { extractAccountsAndPositions } from '@trading-journal/schwab-service/src/etl/dataExtractor.js';

// PostgREST caps a single response at 1000 rows; page through larger sets.
const PAGE_SIZE = 1000;

let serviceClient: SupabaseClient | null = null;
const getServiceClient = (): SupabaseClient => {
  if (!serviceClient) {
    serviceClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return serviceClient;
};

/**
 * Ownership model: a user owns the data of every Schwab account they linked
 * (rows in schwab_accounts with their user_id). Positions and transactions are
 * keyed by account_hash, so we resolve the user's hashes first and scope every
 * query to them. This keeps tenancy intact even though the ETL writes rows
 * under the user_id that happened to run the sync.
 */
async function getUserAccountHashes(userId: string): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from('schwab_accounts')
    .select('account_hash')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return (data ?? []).map((r: { account_hash: string }) => r.account_hash);
}

export const getAccounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await getServiceClient()
      .from('schwab_accounts')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('account_number');

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[API] getAccounts error:', err);
    next(err);
  }
};

export const getPositions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hashes = await getUserAccountHashes(req.user!.id);
    if (hashes.length === 0) return res.json({ data: [] });

    const { data, error } = await getServiceClient()
      .from('schwab_positions')
      .select('*')
      .in('account_hash', hashes)
      .order('market_value', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[API] getPositions error:', err);
    next(err);
  }
};

/**
 * Live account balances straight from the Schwab API (not the DB cache):
 * Net Liq, cash and current positions market value per account. Used by the
 * frontend to reconcile the journal against real account equity.
 */
export const getBalances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadSchwabConfig();

    // A user who hasn't connected Schwab yet has no token row — that's a
    // normal state (fresh signup), not a server error. Return an empty list
    // with a flag instead of letting the extractor blow up with a 500.
    const { data: tokenRow } = await getServiceClient()
      .from('schwab_tokens')
      .select('status')
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (!tokenRow || tokenRow.status !== 'ACTIVE') {
      return res.json({ data: [], schwabConnected: false, tokenStatus: tokenRow?.status ?? null });
    }

    const rawAccounts = await extractAccountsAndPositions(getServiceClient(), req.user!.id, config);

    const data = rawAccounts.map((a: any) => {
      const sa = a.securitiesAccount || {};
      const cur = sa.currentBalances || {};
      const init = sa.initialBalances || {};
      const positions = sa.positions || [];

      const netLiq = cur.liquidationValue ?? null;
      // initialBalances = start-of-day values → day change like Schwab shows it
      const initialNetLiq = init.liquidationValue ?? init.accountValue ?? null;

      return {
        account_hash: sa.hashValue,
        account_number: sa.accountNumber,
        type: sa.type,
        net_liq: netLiq,
        initial_net_liq: initialNetLiq,
        day_change: netLiq !== null && initialNetLiq !== null
          ? Number((netLiq - initialNetLiq).toFixed(2))
          : null,
        cash: cur.cashBalance ?? null,
        // MARGIN accounts expose availableFunds/buyingPower; CASH accounts use cashAvailableForTrading
        available_funds: cur.availableFunds ?? cur.cashAvailableForTrading ?? null,
        buying_power: cur.buyingPower ?? cur.cashAvailableForTrading ?? null,
        positions_value: Number(positions.reduce((s: number, p: any) => s + (p.marketValue || 0), 0).toFixed(2)),
        position_count: positions.length,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('[API] getBalances error:', err);
    next(err);
  }
};

// PostgREST code for "table not found" — migration pending in Supabase
const TABLE_MISSING = 'PGRST205';

/**
 * Orders data stream (order lifecycle: WORKING/FILLED/CANCELED, limit price vs
 * fills). Complements transactions; the trade engine stays on transactions.
 */
export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountHash, status } = req.query;

    const hashes = await getUserAccountHashes(req.user!.id);
    if (hashes.length === 0) return res.json({ data: [] });

    let scopedHashes = hashes;
    if (accountHash) {
      if (!hashes.includes(String(accountHash))) {
        return res.status(403).json({ error: 'Account does not belong to the authenticated user' });
      }
      scopedHashes = [String(accountHash)];
    }

    const all: unknown[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = getServiceClient()
        .from('schwab_orders')
        .select('*')
        .in('account_hash', scopedHashes)
        .order('entered_time', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (status) query = query.eq('status', String(status));

      const { data, error } = await query;
      if (error) {
        if (error.code === TABLE_MISSING) {
          return res.json({ data: [], setupRequired: 'schwab_orders' });
        }
        throw error;
      }
      all.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    res.json({ data: all });
  } catch (err) {
    console.error('[API] getOrders error:', err);
    next(err);
  }
};

/**
 * Daily balance snapshots — the account's real Net Liq history for long-term
 * growth tracking (includes deposits/withdrawals and market appreciation).
 */
export const getGrowth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hashes = await getUserAccountHashes(req.user!.id);
    if (hashes.length === 0) return res.json({ data: [] });

    const { data, error } = await getServiceClient()
      .from('schwab_balance_snapshots')
      .select('*')
      .in('account_hash', hashes)
      .order('snapshot_date', { ascending: true });

    if (error) {
      if (error.code === TABLE_MISSING) {
        return res.json({ data: [], setupRequired: 'schwab_balance_snapshots' });
      }
      throw error;
    }
    res.json({ data });
  } catch (err) {
    console.error('[API] getGrowth error:', err);
    next(err);
  }
};

/**
 * Earliest/latest transaction date across all of the user's visible accounts —
 * lets the frontend offer an "ALL" date-range preset that reflects the actual
 * maximum history available, instead of guessing a fixed lookback window.
 */
export const getDateRange = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hashes = await getUserAccountHashes(req.user!.id);
    if (hashes.length === 0) return res.json({ data: { minDate: null, maxDate: null } });

    const [minRes, maxRes] = await Promise.all([
      getServiceClient().from('schwab_transactions').select('time').in('account_hash', hashes).order('time', { ascending: true }).limit(1),
      getServiceClient().from('schwab_transactions').select('time').in('account_hash', hashes).order('time', { ascending: false }).limit(1),
    ]);
    if (minRes.error) throw minRes.error;
    if (maxRes.error) throw maxRes.error;

    res.json({
      data: {
        minDate: minRes.data?.[0]?.time ? String(minRes.data[0].time).slice(0, 10) : null,
        maxDate: maxRes.data?.[0]?.time ? String(maxRes.data[0].time).slice(0, 10) : null,
      },
    });
  } catch (err) {
    console.error('[API] getDateRange error:', err);
    next(err);
  }
};

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountHash, type, limit, offset = 0 } = req.query;

    const hashes = await getUserAccountHashes(req.user!.id);
    if (hashes.length === 0) return res.json({ data: [] });

    // Optional filter to a single account — must belong to the user.
    let scopedHashes = hashes;
    if (accountHash) {
      if (!hashes.includes(String(accountHash))) {
        return res.status(403).json({ error: 'Account does not belong to the authenticated user' });
      }
      scopedHashes = [String(accountHash)];
    }

    const buildQuery = (from: number, to: number) => {
      let query = getServiceClient()
        .from('schwab_transactions')
        .select('*')
        .in('account_hash', scopedHashes)
        .order('time', { ascending: false })
        .range(from, to);
      if (type) query = query.eq('type', String(type));
      return query;
    };

    if (limit) {
      const from = Number(offset);
      const { data, error } = await buildQuery(from, from + Number(limit) - 1);
      if (error) throw error;
      return res.json({ data });
    }

    // No explicit limit: return the full history (paged), the FIFO trade
    // engine needs every transaction to pair openings with closings.
    const all: unknown[] = [];
    for (let from = Number(offset); ; from += PAGE_SIZE) {
      const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    res.json({ data: all });
  } catch (err) {
    console.error('[API] getTransactions error:', err);
    next(err);
  }
};
