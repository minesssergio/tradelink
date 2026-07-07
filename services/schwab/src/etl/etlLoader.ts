import { SupabaseClient } from '@supabase/supabase-js';
import { 
  SchwabAccountRecord, 
  SchwabPositionRecord, 
  SchwabTransactionRecord,
  SchwabServiceError,
  SchwabErrorCode
} from '../types/schwab.types.js';

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
