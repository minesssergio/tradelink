// =============================================================================
// Schwab OAuth 2.0 Types
// Strict TypeScript types for the Schwab API authentication module.
// =============================================================================

/**
 * Status of a token record in the database.
 */
export type TokenStatus = 'ACTIVE' | 'NEEDS_REAUTH' | 'REVOKED';

/**
 * Raw response from Schwab's /v1/oauth/token endpoint.
 * Returned for both authorization_code and refresh_token grant types.
 */
export interface SchwabTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number; // seconds (typically 1800 = 30 min)
  scope: string;
  id_token: string;
}

/**
 * A token record as stored in the schwab_tokens table.
 */
export interface SchwabTokenRecord {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_at: string; // ISO 8601 timestamp
  refresh_expires_at: string; // ISO 8601 timestamp
  schwab_account_hash: string | null;
  status: TokenStatus;
  last_rotation_at: string | null;
  rotation_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for upserting token records.
 */
export interface UpsertTokenPayload {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope?: string;
  expires_at: string;
  refresh_expires_at: string;
  schwab_account_hash?: string;
  status: TokenStatus;
  last_rotation_at?: string;
  rotation_count?: number;
}

/**
 * Validated configuration for the Schwab service.
 */
export interface SchwabConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Base64 encoded 'clientId:clientSecret' for Basic Auth header */
  basicAuthHeader: string;
  /** Schwab API base URLs */
  authorizationUrl: string;
  tokenUrl: string;
  traderUrl: string;
}

/**
 * Result of a token rotation attempt.
 */
export interface TokenRotationResult {
  success: boolean;
  userId: string;
  error?: SchwabServiceError;
  rotatedAt?: string;
}

/**
 * Typed error codes for the Schwab service.
 */
export enum SchwabErrorCode {
  // Configuration
  CONFIG_MISSING_ENV = 'CONFIG_MISSING_ENV',

  // OAuth flow
  AUTH_CODE_EXCHANGE_FAILED = 'AUTH_CODE_EXCHANGE_FAILED',
  AUTH_INVALID_GRANT = 'AUTH_INVALID_GRANT',
  AUTH_INVALID_CLIENT = 'AUTH_INVALID_CLIENT',

  // Token rotation
  ROTATION_REFRESH_EXPIRED = 'ROTATION_REFRESH_EXPIRED',
  ROTATION_API_ERROR = 'ROTATION_API_ERROR',
  ROTATION_DB_ERROR = 'ROTATION_DB_ERROR',

  // Database
  DB_UPSERT_FAILED = 'DB_UPSERT_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_NOT_FOUND = 'DB_NOT_FOUND',

  // Generic
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Structured error for the Schwab service.
 */
export class SchwabServiceError extends Error {
  public readonly code: SchwabErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly httpStatus?: number;

  constructor(
    code: SchwabErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      context?: Record<string, unknown>;
      httpStatus?: number;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'SchwabServiceError';
    this.code = code;
    this.context = options?.context;
    this.httpStatus = options?.httpStatus;
  }
}

/**
 * Log entry structure for the structured logger.
 */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
}

// =============================================================================
// Schwab ETL Phase 2 Types
// =============================================================================

/**
 * Account record as stored in schwab_accounts table.
 */
export interface SchwabAccountRecord {
  id?: string;
  user_id: string;
  account_hash: string;
  account_number: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Position record as stored in schwab_positions table.
 */
export interface SchwabPositionRecord {
  id?: string;
  user_id: string;
  account_hash: string;
  symbol: string;
  asset_type: 'EQUITY' | 'OPTION' | 'CASH_EQUIVALENT' | string;
  quantity: number;
  average_price: number;
  market_value: number;
  maintenance_requirement: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Transaction record as stored in schwab_transactions table.
 */
export interface SchwabTransactionRecord {
  id?: string;
  user_id: string;
  account_hash: string;
  activity_id: string;
  time: string; // ISO 8601
  type: string;
  status: string;
  symbol: string | null;
  instruction: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number;
  raw_data: Record<string, unknown> | null;
  created_at?: string;
}
