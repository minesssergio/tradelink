import { SchwabConfig, SchwabServiceError, SchwabErrorCode } from '../types/schwab.types.js';
import { logger } from './logger.js';
import { getTokensByUserId, markSessionNeedsReauth } from '../db/tokenRepository.js';
import { rotateTokensForUser } from './schwabTokenRotation.js';
import { SupabaseClient } from '@supabase/supabase-js';

// Sleep helper for backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Refresh margin: rotate if the access token expires within this window */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Per-user rotation lock. Schwab invalidates the old refresh token on every
 * rotation, so two CONCURRENT rotations with the same refresh token make the
 * loser fail with invalid_grant (and previously mark the session NEEDS_REAUTH
 * even though the winner stored a perfectly valid new token). All callers in
 * this process share one in-flight rotation per user.
 */
const rotationLocks = new Map<string, Promise<void>>();

async function ensureFreshTokens(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig,
  endpoint: string
): Promise<void> {
  const existing = rotationLocks.get(userId);
  if (existing) return existing;

  const rotation = (async () => {
    const tokens = await getTokensByUserId(supabase, userId);
    if (!tokens || tokens.status !== 'ACTIVE') return; // caller re-validates

    if (new Date(tokens.expires_at).getTime() > Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
      return; // someone else already rotated while we waited for the lock
    }

    logger.info('Access token expired or near expiry — rotating before API call', { userId, endpoint });
    const rotationResult = await rotateTokensForUser(tokens, config, supabase);
    if (!rotationResult.success) {
      throw rotationResult.error ?? new SchwabServiceError(
        SchwabErrorCode.UNKNOWN_ERROR,
        `Token rotation failed for user ${userId}`
      );
    }
  })();

  rotationLocks.set(userId, rotation);
  try {
    await rotation;
  } finally {
    rotationLocks.delete(userId);
  }
}

/**
 * Generic fetch wrapper for Schwab Trader API endpoints.
 * Automatically handles:
 * - Bearer token injection
 * - 429 Rate Limiting (Exponential Backoff)
 * - 401 Unauthorized (Triggers NEEDS_REAUTH)
 */
export async function fetchWithAuth(
  supabase: SupabaseClient,
  userId: string,
  config: SchwabConfig,
  endpoint: string, // e.g. "/accounts"
  options: RequestInit = {},
  retries = 3
): Promise<any> {
  let tokens = await getTokensByUserId(supabase, userId);

  if (!tokens || tokens.status !== 'ACTIVE') {
    throw new SchwabServiceError(
      SchwabErrorCode.AUTH_INVALID_GRANT,
      `User ${userId} does not have an active session. Status: ${tokens?.status || 'NOT_FOUND'}`,
      { context: { userId, status: tokens?.status } }
    );
  }

  // Proactive rotation: never call Schwab with an expired/near-expiry access token,
  // otherwise the 401 handler would incorrectly mark the session as NEEDS_REAUTH.
  // Serialized per user — see ensureFreshTokens.
  if (new Date(tokens.expires_at).getTime() <= Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
    await ensureFreshTokens(supabase, userId, config, endpoint);
    tokens = await getTokensByUserId(supabase, userId);
    if (!tokens || tokens.status !== 'ACTIVE') {
      throw new SchwabServiceError(
        SchwabErrorCode.AUTH_INVALID_GRANT,
        `User ${userId} lost active session after rotation`,
        { context: { userId } }
      );
    }
  }

  const url = `${config.traderUrl}${endpoint}`;
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${tokens.access_token}`);
  headers.set('Accept', 'application/json');

  let attempt = 0;
  let delayMs = 1000;

  while (attempt <= retries) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (response.ok) {
        // Return parsed JSON for 200 OK
        return await response.json();
      }

      if (response.status === 401) {
        // Token is rejected (likely expired or revoked)
        logger.warn('Received 401 from Schwab API. Marking session as NEEDS_REAUTH', { userId, endpoint });
        await markSessionNeedsReauth(supabase, userId);
        throw new SchwabServiceError(
          SchwabErrorCode.AUTH_INVALID_GRANT,
          'Access token rejected by Schwab',
          { httpStatus: 401, context: { userId } }
        );
      }

      if (response.status === 429) {
        // Rate limited
        logger.warn('Rate limited by Schwab API (429)', { userId, endpoint, attempt, delayMs });
        if (attempt < retries) {
          await sleep(delayMs);
          attempt++;
          delayMs *= 2; // Exponential backoff
          continue;
        }
      }

      // Other errors
      const errorText = await response.text();
      throw new SchwabServiceError(
        SchwabErrorCode.NETWORK_ERROR,
        `Schwab API error: HTTP ${response.status}`,
        {
          httpStatus: response.status,
          context: { responseBody: errorText, endpoint }
        }
      );

    } catch (error) {
      if (error instanceof SchwabServiceError) {
        throw error;
      }
      // Network errors (e.g. DNS failure)
      if (attempt < retries) {
        logger.warn('Network error during Schwab API call, retrying...', { userId, error: (error as Error).message });
        await sleep(delayMs);
        attempt++;
        delayMs *= 2;
        continue;
      }
      throw new SchwabServiceError(
        SchwabErrorCode.NETWORK_ERROR,
        `Failed to reach Schwab API: ${(error as Error).message}`,
        { cause: error }
      );
    }
  }

  throw new SchwabServiceError(SchwabErrorCode.UNKNOWN_ERROR, 'Exceeded max retries');
}
