import {
  SchwabAccountRecord,
  SchwabPositionRecord,
  SchwabTransactionRecord,
  SchwabOrderRecord,
  SchwabBalanceSnapshotRecord
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

/**
 * Transforms raw Schwab order data to our DB format.
 */
export function transformOrders(
  userId: string,
  accountHash: string,
  rawOrders: any[]
): SchwabOrderRecord[] {
  if (!Array.isArray(rawOrders)) return [];

  return rawOrders
    .filter(order => order.orderId != null && order.enteredTime)
    .map(order => {
      const leg = order.orderLegCollection?.[0] || {};
      const instrument = leg.instrument || {};

      return {
        user_id: userId,
        account_hash: accountHash,
        order_id: order.orderId.toString(),
        entered_time: order.enteredTime,
        close_time: order.closeTime || null,
        status: order.status || 'UNKNOWN',
        order_type: order.orderType || null,
        duration: order.duration || null,
        symbol: instrument.symbol || null,
        instruction: leg.instruction || null,
        position_effect: leg.positionEffect || null,
        quantity: order.quantity ?? null,
        filled_quantity: order.filledQuantity ?? null,
        price: order.price ?? null,
        raw_data: order,
      };
    });
}

/**
 * Builds today's balance snapshot for an account from the raw payload.
 */
export function transformBalanceSnapshot(
  userId: string,
  rawAccount: any
): SchwabBalanceSnapshotRecord | null {
  const sa = rawAccount?.securitiesAccount;
  if (!sa?.hashValue) return null;

  const cur = sa.currentBalances || {};
  const positions = sa.positions || [];

  return {
    user_id: userId,
    account_hash: sa.hashValue,
    snapshot_date: new Date().toISOString().slice(0, 10),
    net_liq: cur.liquidationValue ?? null,
    cash: cur.cashBalance ?? null,
    available_funds: cur.availableFunds ?? cur.cashAvailableForTrading ?? null,
    positions_value: Number(
      positions.reduce((s: number, p: any) => s + (p.marketValue || 0), 0).toFixed(2)
    ),
  };
}
