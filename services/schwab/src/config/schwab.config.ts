// =============================================================================
// Schwab Service Configuration
// Validates and exports all environment variables at startup (fail-fast).
// =============================================================================

import { SchwabConfig, SchwabErrorCode, SchwabServiceError } from '../types/schwab.types.js';

/** Schwab API base URLs */
const SCHWAB_AUTHORIZATION_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const SCHWAB_TRADER_URL = 'https://api.schwabapi.com/trader/v1';

/**
 * Required environment variables. The service will refuse to start if any are missing.
 */
const REQUIRED_ENV_VARS = [
  'SCHWAB_CLIENT_ID',
  'SCHWAB_CLIENT_SECRET',
  'SCHWAB_CALLBACK_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * Validates that all required environment variables are set.
 * Throws immediately if any are missing (fail-fast principle).
 */
function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName] || process.env[varName]!.trim() === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new SchwabServiceError(
      SchwabErrorCode.CONFIG_MISSING_ENV,
      `Missing required environment variables: ${missing.join(', ')}`,
      { context: { missing } }
    );
  }
}

/**
 * Loads and validates the Schwab service configuration.
 * Call this once at service startup.
 *
 * @returns Validated SchwabConfig object
 * @throws SchwabServiceError if any required env vars are missing
 */
export function loadSchwabConfig(): SchwabConfig {
  validateEnv();

  const clientId = process.env.SCHWAB_CLIENT_ID!;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET!;

  // Schwab requires Basic Auth: base64(clientId:clientSecret)
  const basicAuthHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  return {
    clientId,
    clientSecret,
    callbackUrl: process.env.SCHWAB_CALLBACK_URL!,
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    basicAuthHeader,
    authorizationUrl: SCHWAB_AUTHORIZATION_URL,
    tokenUrl: SCHWAB_TOKEN_URL,
    traderUrl: SCHWAB_TRADER_URL,
  };
}
