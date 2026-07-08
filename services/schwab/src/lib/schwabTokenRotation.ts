// =============================================================================
// Token Rotation Service
// Automated rotation of Schwab OAuth tokens.
// Designed to be invoked by a cron job (Vercel Cron, pg_cron, or system crontab).
//
// Strategy:
// - Access token: refresh proactively when < 5 min remaining (every ~25 min)
// - Refresh token: rotated automatically with each access token refresh
//   (Schwab issues a new refresh_token every time)
// - If refresh_token is expired (>7 days): mark as NEEDS_REAUTH
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import {
  SchwabConfig,
  SchwabTokenRecord,
  TokenRotationResult,
  SchwabErrorCode,
  SchwabServiceError,
} from '../types/schwab.types.js';
import {
  refreshTokens,
  calculateExpiresAt,
  REFRESH_TOKEN_LIFETIME_SECONDS,
} from './schwabAuth.js';
import {
  createServiceClient,
  getTokensNeedingRotation,
  upsertTokens,
  markSessionNeedsReauth,
} from '../db/tokenRepository.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Main Entry Point — Rotate all users
// ---------------------------------------------------------------------------

/**
 * Rotates tokens for ALL users whose access tokens are about to expire.
 *
 * This function is designed to be the entry point for a cron job.
 * It queries all ACTIVE token records expiring within 5 minutes,
 * then refreshes each one transactionally.
 *
 * @param config - Validated Schwab configuration
 * @returns Array of rotation results (one per user)
 */
export async function rotateTokensForAllUsers(
  config: SchwabConfig
): Promise<TokenRotationResult[]> {
  logger.info('Starting token rotation for all users');

  const client = createServiceClient(config);
  const tokensToRotate = await getTokensNeedingRotation(client);

  if (tokensToRotate.length === 0) {
    logger.info('No tokens need rotation at this time');
    return [];
  }

  logger.info(`Found ${tokensToRotate.length} token(s) needing rotation`);

  const results: TokenRotationResult[] = [];

  for (const tokenRecord of tokensToRotate) {
    const result = await rotateTokensForUser(
      tokenRecord,
      config,
      client
    );
    results.push(result);
  }

  // Summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info('Token rotation complete', {
    total: results.length,
    successful,
    failed,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Single User Rotation
// ---------------------------------------------------------------------------

/**
 * Rotates tokens for a single user.
 *
 * Steps:
 * 1. Check if refresh_token is still valid (not expired > 7 days)
 * 2. Call Schwab API to refresh tokens
 * 3. Atomically update the database with new tokens
 *
 * If the refresh_token is expired, marks the session as NEEDS_REAUTH.
 *
 * @param tokenRecord - Current token record from the database
 * @param config - Validated Schwab configuration
 * @param client - Supabase service client
 * @returns Rotation result
 */
export async function rotateTokensForUser(
  tokenRecord: SchwabTokenRecord,
  config: SchwabConfig,
  client: SupabaseClient
): Promise<TokenRotationResult> {
  const { user_id, refresh_token, refresh_expires_at } = tokenRecord;

  logger.info('Rotating tokens for user', {
    userId: user_id,
    rotationCount: tokenRecord.rotation_count,
  });

  // ── Check if refresh token is expired ──────────────────────────────────
  const refreshExpiresAt = new Date(refresh_expires_at);
  if (refreshExpiresAt <= new Date()) {
    logger.error('Refresh token has expired — session needs re-authentication', undefined, {
      userId: user_id,
      expiredAt: refresh_expires_at,
    });

    await markSessionNeedsReauth(client, user_id);

    return {
      success: false,
      userId: user_id,
      error: new SchwabServiceError(
        SchwabErrorCode.ROTATION_REFRESH_EXPIRED,
        `Refresh token expired for user ${user_id}. Session marked as NEEDS_REAUTH.`,
        { context: { userId: user_id, expiredAt: refresh_expires_at } }
      ),
    };
  }

  // ── Refresh tokens via Schwab API ──────────────────────────────────────
  try {
    const newTokens = await refreshTokens(refresh_token, config);
    const now = new Date().toISOString();

    // ── Atomic database update ────────────────────────────────────────────
    await upsertTokens(client, {
      user_id,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      token_type: newTokens.token_type,
      scope: newTokens.scope,
      expires_at: calculateExpiresAt(newTokens.expires_in),
      refresh_expires_at: calculateExpiresAt(REFRESH_TOKEN_LIFETIME_SECONDS),
      schwab_account_hash: tokenRecord.schwab_account_hash ?? undefined,
      status: 'ACTIVE',
      last_rotation_at: now,
      rotation_count: (tokenRecord.rotation_count ?? 0) + 1,
    });

    logger.info('Token rotation successful for user', {
      userId: user_id,
      newRotationCount: (tokenRecord.rotation_count ?? 0) + 1,
    });

    return {
      success: true,
      userId: user_id,
      rotatedAt: now,
    };
  } catch (error) {
    const schwabError =
      error instanceof SchwabServiceError
        ? error
        : new SchwabServiceError(
            SchwabErrorCode.UNKNOWN_ERROR,
            `Unexpected error during token rotation for user ${user_id}`,
            { cause: error }
          );

    logger.error('Token rotation failed for user', schwabError, {
      userId: user_id,
      errorCode: schwabError.code,
    });

    if (schwabError.code === SchwabErrorCode.AUTH_INVALID_GRANT) {
      // Before declaring the session dead, check whether a CONCURRENT rotation
      // (another request/process) already stored a newer refresh token — Schwab
      // invalidates the old one on every rotation, so losing that race also
      // surfaces as invalid_grant even though the session is fine.
      const { getTokensByUserId } = await import('../db/tokenRepository.js');
      const latest = await getTokensByUserId(client, user_id).catch(() => null);
      if (latest && latest.refresh_token !== refresh_token && latest.status === 'ACTIVE') {
        logger.info('Rotation lost a concurrent race — newer token already stored, session stays ACTIVE', {
          userId: user_id,
        });
        return { success: true, userId: user_id, rotatedAt: latest.last_rotation_at ?? new Date().toISOString() };
      }

      // Genuinely dead refresh token
      await markSessionNeedsReauth(client, user_id);
    }

    return {
      success: false,
      userId: user_id,
      error: schwabError,
    };
  }
}
