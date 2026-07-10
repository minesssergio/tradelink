import { SupabaseClient } from '@supabase/supabase-js';
import { SchwabConfig } from '../types/schwab.types.js';
import { logger } from '../lib/logger.js';
import { extractAccountsAndPositions, extractTransactions, extractOrders } from './dataExtractor.js';
import { transformAccount, transformPositions, transformTransactions, transformOrders, transformBalanceSnapshot } from './dataTransformer.js';
import { upsertAccount, upsertPositions, insertTransactions, deleteStalePositions, upsertOrders, upsertBalanceSnapshot } from './etlLoader.js';
import {
  resolveIncrementalStart,
  chunkDateRange,
  getLastTransactionTime,
  getLastOrderTime,
  TRANSACTION_OVERLAP_DAYS,
  ORDER_OVERLAP_DAYS,
} from './syncCursor.js';

export interface SyncResult {
  userId: string;
  success: boolean;
  accountsProcessed: number;
  positionsProcessed: number;
  transactionsProcessed: number;
  ordersProcessed: number;
  snapshotsProcessed: number;
  /** Tables whose migrations are pending in Supabase (steps skipped, not failed) */
  skippedMissingTables: string[];
  error?: Error;
}

/**
 * Runs the full ETL pipeline for a single user.
 */
export async function runSyncJob(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig,
  startDate?: string,
  endDate?: string
): Promise<SyncResult> {
  logger.info('Starting Schwab ETL Sync Job', { userId, startDate, endDate });

  const result: SyncResult = {
    userId,
    success: false,
    accountsProcessed: 0,
    positionsProcessed: 0,
    transactionsProcessed: 0,
    ordersProcessed: 0,
    snapshotsProcessed: 0,
    skippedMissingTables: [],
  };

  try {
    // 1. EXTRACT: Accounts and Positions
    const rawAccounts = await extractAccountsAndPositions(supabase, userId, config);
    
    for (const rawAccount of rawAccounts) {
      // 2. TRANSFORM & LOAD: Account
      const account = transformAccount(userId, rawAccount);
      await upsertAccount(supabase, account);
      result.accountsProcessed++;

      // 3. TRANSFORM & LOAD: Positions (snapshot semantics — upsert current, delete stale)
      const rawPositions = rawAccount.securitiesAccount?.positions;
      const positions = (rawPositions && Array.isArray(rawPositions))
        ? transformPositions(userId, account.account_hash, rawPositions)
        : [];
      await upsertPositions(supabase, positions);
      await deleteStalePositions(
        supabase,
        account.account_hash,
        positions.map((p) => ({ symbol: p.symbol, asset_type: p.asset_type }))
      );
      result.positionsProcessed += positions.length;

      // 4. EXTRACT: Transactions — incremental per account (own cursor + overlap)
      // unless the caller passed an explicit range (manual resync).
      const txEnd = endDate ?? new Date().toISOString();
      const txStart = startDate ?? resolveIncrementalStart(
        await getLastTransactionTime(supabase, account.account_hash),
        TRANSACTION_OVERLAP_DAYS
      );

      const rawTransactions: any[] = [];
      for (const [chunkStart, chunkEnd] of chunkDateRange(txStart, txEnd)) {
        const chunk = await extractTransactions(supabase, userId, config, account.account_hash, chunkStart, chunkEnd);
        if (Array.isArray(chunk)) rawTransactions.push(...chunk);
      }

      // 5. TRANSFORM & LOAD: Transactions (upsert with ignoreDuplicates — safe to
      // re-fetch the overlap window, already-stored activity_ids are skipped)
      if (rawTransactions.length > 0) {
        const transactions = transformTransactions(userId, account.account_hash, rawTransactions);
        await insertTransactions(supabase, transactions);
        result.transactionsProcessed += transactions.length;
      }

      // 6. EXTRACT + LOAD: Orders (second data stream) — own cursor + wider
      // overlap, since a WORKING order entered days ago can still transition
      // to FILLED/CANCELED without its entered_time changing.
      const orderEnd = endDate ?? new Date().toISOString();
      const orderStart = startDate ?? resolveIncrementalStart(
        await getLastOrderTime(supabase, account.account_hash),
        ORDER_OVERLAP_DAYS
      );

      const rawOrders: any[] = [];
      for (const [chunkStart, chunkEnd] of chunkDateRange(orderStart, orderEnd)) {
        const chunk = await extractOrders(supabase, userId, config, account.account_hash, chunkStart, chunkEnd);
        if (Array.isArray(chunk)) rawOrders.push(...chunk);
      }
      const orders = transformOrders(userId, account.account_hash, rawOrders);
      const ordersOk = await upsertOrders(supabase, orders);
      if (ordersOk) {
        result.ordersProcessed += orders.length;
      } else if (!result.skippedMissingTables.includes('schwab_orders')) {
        result.skippedMissingTables.push('schwab_orders');
        logger.warn('schwab_orders table missing — apply migration 004. Orders step skipped.', { userId });
      }

      // 7. LOAD: Today's balance snapshot (long-term growth tracking)
      const snapshot = transformBalanceSnapshot(userId, rawAccount);
      if (snapshot) {
        const snapOk = await upsertBalanceSnapshot(supabase, snapshot);
        if (snapOk) {
          result.snapshotsProcessed++;
        } else if (!result.skippedMissingTables.includes('schwab_balance_snapshots')) {
          result.skippedMissingTables.push('schwab_balance_snapshots');
          logger.warn('schwab_balance_snapshots table missing — apply migration 005. Snapshot step skipped.', { userId });
        }
      }
    }

    result.success = true;
    logger.info('Schwab ETL Sync Job completed successfully', { result });
    
  } catch (error) {
    result.error = error as Error;
    logger.error('Schwab ETL Sync Job failed', { 
      userId, 
      error: error instanceof Error ? error.message : String(error), 
      stack: error instanceof Error ? error.stack : undefined 
    });
    console.error('Full Sync Error:', error);
  }

  return result;
}

/**
 * Runs the sync job for every user with an ACTIVE Schwab token, or a single
 * one if `userId` is given. Shared by the CLI (`--sync`) and the Vercel Cron
 * endpoint so both stay in lockstep — one user's failure never blocks the rest.
 */
export async function runSyncForAllActiveUsers(
  supabase: SupabaseClient,
  config: SchwabConfig,
  options?: { userId?: string; startDate?: string; endDate?: string }
): Promise<SyncResult[]> {
  const query = supabase.from('schwab_tokens').select('user_id').eq('status', 'ACTIVE');
  const { data, error } = options?.userId ? await query.eq('user_id', options.userId) : await query;

  if (error) {
    logger.error('Failed to list active users for sync', { error: error.message });
    return [];
  }
  if (!data || data.length === 0) {
    logger.info('No active users found for sync');
    return [];
  }

  const results: SyncResult[] = [];
  for (const row of data) {
    try {
      results.push(await runSyncJob(supabase, row.user_id, config, options?.startDate, options?.endDate));
    } catch (error) {
      // runSyncJob already catches internally, but guard here too so one
      // unexpected throw never aborts the remaining users' syncs.
      logger.error('Unexpected error syncing user — skipping', {
        userId: row.user_id,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        userId: row.user_id,
        success: false,
        accountsProcessed: 0,
        positionsProcessed: 0,
        transactionsProcessed: 0,
        ordersProcessed: 0,
        snapshotsProcessed: 0,
        skippedMissingTables: [],
        error: error as Error,
      });
    }
  }
  return results;
}
