import { SupabaseClient } from '@supabase/supabase-js';
import { SchwabConfig } from '../types/schwab.types.js';
import { fetchWithAuth } from '../lib/schwabApi.js';
import { logger } from '../lib/logger.js';

/**
 * Fetches accounts and their positions from Schwab.
 * Calls /trader/v1/accounts?fields=positions
 */
export async function extractAccountsAndPositions(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig
): Promise<any[]> {
  logger.info('Extracting accounts and positions', { userId });
  
  // 1. Get the account numbers to hash mappings (hashValue is required for transactions API)
  const accountMappings = await fetchWithAuth(
    supabase, 
    userId, 
    config, 
    '/accounts/accountNumbers'
  );
  
  // 2. The 'fields=positions' param includes positions array in the response
  const data = await fetchWithAuth(
    supabase,
    userId,
    config,
    '/accounts?fields=positions'
  );
  
  // 3. Merge the hashValue into the payload
  for (const account of data) {
    if (account.securitiesAccount?.accountNumber) {
      const mapping = accountMappings.find((m: any) => m.accountNumber === account.securitiesAccount.accountNumber);
      if (mapping) {
        account.securitiesAccount.hashValue = mapping.hashValue;
      }
    }
  }
  
  return data; // Array of account objects with hashValue injected
}

/**
 * Fetches transactions for a specific account.
 * Calls /trader/v1/accounts/{accountHash}/transactions
 * 
 * Default behavior is to fetch the last 90 days.
 * The API supports startDate and endDate query params (format: YYYY-MM-DDTHH:mm:ss.000Z)
 */
export async function extractTransactions(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig,
  accountHash: string,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  logger.info('Extracting transactions', { userId, accountHash, startDate, endDate });

  let endpoint = `/accounts/${accountHash}/transactions`;
  
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.append('startDate', startDate);
  if (endDate) queryParams.append('endDate', endDate);
  // Default to TRADE type to ignore some noise if we only want trades, but let's pull all for the journal.
  queryParams.append('types', 'TRADE,RECEIVE_AND_DELIVER,DIVIDEND_OR_INTEREST,ACH_RECEIPT,ACH_DISBURSEMENT');

  const queryString = queryParams.toString();
  if (queryString) {
    endpoint += `?${queryString}`;
  }

  const data = await fetchWithAuth(
    supabase,
    userId,
    config,
    endpoint
  );

  return data; // Array of transaction objects
}

/**
 * Fetches orders for a specific account (second data stream, like TradesViz).
 * Calls /trader/v1/accounts/{accountHash}/orders
 *
 * Note: orders complement transactions — they carry the full order lifecycle
 * (WORKING/FILLED/CANCELED, limit price vs executions). The trade engine keeps
 * using transactions because the orders endpoint does not report ITM expiry
 * prices nor cash movements.
 */
export async function extractOrders(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig,
  accountHash: string,
  fromEnteredTime: string,
  toEnteredTime: string
): Promise<any[]> {
  logger.info('Extracting orders', { userId, accountHash, fromEnteredTime, toEnteredTime });

  const queryParams = new URLSearchParams({
    fromEnteredTime,
    toEnteredTime,
  });

  const data = await fetchWithAuth(
    supabase,
    userId,
    config,
    `/accounts/${accountHash}/orders?${queryParams.toString()}`
  );

  return data; // Array of order objects
}
