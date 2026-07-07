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
