import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Incremental sync cursor: resolves how far back to fetch per account instead
 * of always re-requesting a fixed rolling window. Once a transaction/order is
 * stored it is never deleted (schwab_transactions/schwab_orders only grow via
 * upsert), so each sync only needs to fetch what's new since the last one —
 * the database itself becomes the permanent, ever-growing archive, independent
 * of however far back Schwab's own API is willing to answer for.
 */

/** First-ever sync for an account: how far back to backfill when there's no prior data. */
export const DEFAULT_BACKFILL_DAYS = 730; // ~2 years

/** Max span per Schwab API call — chunk larger ranges to stay safely under any undocumented limit. */
export const CHUNK_DAYS = 180;

/** Re-scan this many days behind the last known record to catch late settlement/status updates. */
export const TRANSACTION_OVERLAP_DAYS = 3;
/** Orders need a wider overlap: a WORKING order entered days ago can still transition to FILLED/CANCELED. */
export const ORDER_OVERLAP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the effective start date for an incremental sync.
 * - No prior data -> backfill DEFAULT_BACKFILL_DAYS back from now.
 * - Prior data exists -> re-scan from (lastKnown - overlapDays) to catch late
 *   settlement/status changes, without re-fetching the entire history.
 */
export function resolveIncrementalStart(
  lastKnownIso: string | null,
  overlapDays: number,
  now: Date = new Date()
): string {
  if (!lastKnownIso) {
    return new Date(now.getTime() - DEFAULT_BACKFILL_DAYS * DAY_MS).toISOString();
  }
  const lastKnown = new Date(lastKnownIso);
  return new Date(lastKnown.getTime() - overlapDays * DAY_MS).toISOString();
}

/** Splits [start, end] into consecutive chunks of at most `chunkDays` each. Empty if start >= end. */
export function chunkDateRange(
  startIso: string,
  endIso: string,
  chunkDays: number = CHUNK_DAYS
): Array<[string, string]> {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!(start < end)) return [];

  const chunkMs = chunkDays * DAY_MS;
  const chunks: Array<[string, string]> = [];
  let chunkStart = start;

  while (chunkStart < end) {
    const chunkEnd = Math.min(chunkStart + chunkMs, end);
    chunks.push([new Date(chunkStart).toISOString(), new Date(chunkEnd).toISOString()]);
    chunkStart = chunkEnd;
  }
  return chunks;
}

/** Most recent stored transaction time for an account, or null if none synced yet. */
export async function getLastTransactionTime(
  supabase: SupabaseClient,
  accountHash: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('schwab_transactions')
    .select('time')
    .eq('account_hash', accountHash)
    .order('time', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0]!.time as string;
}

/** Most recent stored order entered_time for an account. Gracefully null if none synced or table missing. */
export async function getLastOrderTime(
  supabase: SupabaseClient,
  accountHash: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('schwab_orders')
    .select('entered_time')
    .eq('account_hash', accountHash)
    .order('entered_time', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0]!.entered_time as string;
}
