import { SupabaseClient } from '@supabase/supabase-js';
import {
  SchwabAccountRecord,
  SchwabPositionRecord,
  SchwabTransactionRecord,
  SchwabOrderRecord,
  SchwabBalanceSnapshotRecord,
  SchwabServiceError,
  SchwabErrorCode
} from '../types/schwab.types.js';

/** PostgREST error code for "table not found in schema cache" (migration not applied yet). */
export const TABLE_MISSING_CODE = 'PGRST205';

export async function upsertAccount(
  supabase: SupabaseClient, 
  account: SchwabAccountRecord
): Promise<void> {
  const { error } = await supabase
    .from('schwab_accounts')
    .upsert(account, { onConflict: 'user_id,account_hash' });

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to upsert account ${account.account_hash}`,
      { cause: error }
    );
  }
}

export async function upsertPositions(
  supabase: SupabaseClient,
  positions: SchwabPositionRecord[]
): Promise<void> {
  if (positions.length === 0) return;

  const { error } = await supabase
    .from('schwab_positions')
    .upsert(positions, { onConflict: 'account_hash,symbol,asset_type' });

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to upsert positions batch`,
      { cause: error }
    );
  }
}

/**
 * Removes stale position rows for an account: positions are a SNAPSHOT of
 * current holdings, so anything not present in the latest sync (e.g. a
 * position closed since the last run) must be deleted.
 */
export async function deleteStalePositions(
  supabase: SupabaseClient,
  accountHash: string,
  currentKeys: Array<{ symbol: string; asset_type: string }>
): Promise<void> {
  const { data, error: selectError } = await supabase
    .from('schwab_positions')
    .select('id, symbol, asset_type')
    .eq('account_hash', accountHash);

  if (selectError) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to list positions for account ${accountHash}`,
      { cause: selectError }
    );
  }

  const keep = new Set(currentKeys.map(k => `${k.symbol}|${k.asset_type}`));
  const staleIds = (data ?? [])
    .filter(row => !keep.has(`${row.symbol}|${row.asset_type}`))
    .map(row => row.id);

  if (staleIds.length === 0) return;

  const { error } = await supabase
    .from('schwab_positions')
    .delete()
    .in('id', staleIds);

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to delete stale positions for account ${accountHash}`,
      { cause: error }
    );
  }
}

/**
 * Upserts orders (updates on conflict — an order's status evolves over time:
 * WORKING → FILLED/CANCELED — so the latest payload must win).
 * Returns false (without throwing) if the schwab_orders table doesn't exist yet.
 */
export async function upsertOrders(
  supabase: SupabaseClient,
  orders: SchwabOrderRecord[]
): Promise<boolean> {
  if (orders.length === 0) return true;

  const { error } = await supabase
    .from('schwab_orders')
    .upsert(orders, { onConflict: 'account_hash,order_id' });

  if (error) {
    if (error.code === TABLE_MISSING_CODE) return false;
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to upsert orders batch`,
      { cause: error }
    );
  }
  return true;
}

/**
 * Upserts today's balance snapshot (last sync of the day wins).
 * Returns false (without throwing) if the snapshots table doesn't exist yet.
 */
export async function upsertBalanceSnapshot(
  supabase: SupabaseClient,
  snapshot: SchwabBalanceSnapshotRecord
): Promise<boolean> {
  const { error } = await supabase
    .from('schwab_balance_snapshots')
    .upsert(snapshot, { onConflict: 'account_hash,snapshot_date' });

  if (error) {
    if (error.code === TABLE_MISSING_CODE) return false;
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to upsert balance snapshot for ${snapshot.account_hash}`,
      { cause: error }
    );
  }
  return true;
}

export async function insertTransactions(
  supabase: SupabaseClient, 
  transactions: SchwabTransactionRecord[]
): Promise<void> {
  if (transactions.length === 0) return;

  // Insert ignoring duplicates based on the unique constraint (account_hash, activity_id)
  const { error } = await supabase
    .from('schwab_transactions')
    .upsert(transactions, { onConflict: 'account_hash,activity_id', ignoreDuplicates: true });

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to insert transactions batch`,
      { cause: error }
    );
  }
}
