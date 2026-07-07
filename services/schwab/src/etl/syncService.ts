import { SupabaseClient } from '@supabase/supabase-js';
import { SchwabConfig } from '../types/schwab.types.js';
import { logger } from '../lib/logger.js';
import { extractAccountsAndPositions, extractTransactions, extractOrders } from './dataExtractor.js';
import { transformAccount, transformPositions, transformTransactions, transformOrders, transformBalanceSnapshot } from './dataTransformer.js';
import { upsertAccount, upsertPositions, insertTransactions, deleteStalePositions, upsertOrders, upsertBalanceSnapshot } from './etlLoader.js';

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

      // 4. EXTRACT: Transactions
      const rawTransactions = await extractTransactions(
        supabase, 
        userId, 
        config, 
        account.account_hash,
        startDate,
        endDate
      );

      // 5. TRANSFORM & LOAD: Transactions
      if (rawTransactions && Array.isArray(rawTransactions)) {
        const transactions = transformTransactions(userId, account.account_hash, rawTransactions);
        await insertTransactions(supabase, transactions);
        result.transactionsProcessed += transactions.length;
      }

      // 6. EXTRACT + LOAD: Orders (second data stream)
      const rawOrders = await extractOrders(
        supabase,
        userId,
        config,
        account.account_hash,
        startDate ?? new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        endDate ?? new Date().toISOString()
      );
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
