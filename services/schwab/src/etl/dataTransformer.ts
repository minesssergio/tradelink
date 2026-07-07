import { 
  SchwabAccountRecord, 
  SchwabPositionRecord, 
  SchwabTransactionRecord 
} from '../types/schwab.types.js';

/**
 * Transforms raw Schwab account data to our DB format.
 */
export function transformAccount(userId: string, rawAccount: any): SchwabAccountRecord {
  const accountHash = rawAccount?.securitiesAccount?.hashValue;
  if (!accountHash) {
    throw new Error('Account payload missing hashValue');
  }

  return {
    user_id: userId,
    account_hash: accountHash,
    account_number: rawAccount?.securitiesAccount?.accountNumber || null,
    is_active: !rawAccount?.securitiesAccount?.isClosingOnly, // Approximation of active status
  };
}

/**
 * Transforms raw Schwab position data to our DB format.
 */
export function transformPositions(
  userId: string, 
  accountHash: string, 
  rawPositions: any[]
): SchwabPositionRecord[] {
  if (!Array.isArray(rawPositions)) return [];

  return rawPositions.map(pos => {
    const instrument = pos.instrument || {};
    
    return {
      user_id: userId,
      account_hash: accountHash,
      symbol: instrument.symbol || 'UNKNOWN',
      asset_type: instrument.assetType || 'UNKNOWN',
      quantity: pos.longQuantity > 0 ? pos.longQuantity : -pos.shortQuantity,
      average_price: pos.averagePrice || 0,
      market_value: pos.marketValue || 0,
      maintenance_requirement: pos.maintenanceRequirement || null,
    };
  });
}

/**
 * Transforms raw Schwab transaction data to our DB format.
 */
export function transformTransactions(
  userId: string, 
  accountHash: string, 
  rawTransactions: any[]
): SchwabTransactionRecord[] {
  if (!Array.isArray(rawTransactions)) return [];

  return rawTransactions.map(tx => {
    // Extract asset info depending on the transaction structure
    const transferItem = tx.transferItems?.[0];
    const instrument = transferItem?.instrument || {};
    
    return {
      user_id: userId,
      account_hash: accountHash,
      activity_id: tx.activityId.toString(),
      time: tx.time, // ISO 8601 string
      type: tx.type, // e.g. TRADE, ACH_RECEIPT
      status: tx.status,
      symbol: instrument.symbol || null,
      instruction: transferItem?.positionEffect || null, // e.g. OPENING, CLOSING
      quantity: transferItem?.amount || null,
      price: transferItem?.price || null,
      amount: tx.netAmount || 0,
      fees: transferItem?.fee || 0,
      raw_data: tx, // Save raw payload for debugging and edge cases
    };
  });
}
