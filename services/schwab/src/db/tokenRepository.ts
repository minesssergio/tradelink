// =============================================================================
// Token Repository
// Data access layer for schwab_tokens table in Supabase.
// Uses service_role key to bypass RLS (server-side only).
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SchwabConfig,
  SchwabTokenRecord,
  UpsertTokenPayload,
  SchwabErrorCode,
  SchwabServiceError,
  TokenStatus,
} from '../types/schwab.types.js';
import { logger, maskSensitive } from '../lib/logger.js';

const TABLE_NAME = 'schwab_tokens';

/**
 * Creates a Supabase client with service_role key (bypasses RLS).
 * This client should ONLY be used in server-side contexts.
 */
export function createServiceClient(config: SchwabConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Upserts (insert or update) token record for a user.
 * Uses ON CONFLICT (user_id) to ensure atomic upsert.
 *
 * @param client - Supabase service client
 * @param payload - Token data to upsert
 * @throws SchwabServiceError on database failure
 */
export async function upsertTokens(
  client: SupabaseClient,
  payload: UpsertTokenPayload
): Promise<SchwabTokenRecord> {
  logger.info('Upserting tokens', {
    userId: payload.user_id,
    status: payload.status,
    accessTokenPreview: maskSensitive(payload.access_token),
  });

  const { data, error } = await client
    .from(TABLE_NAME)
    .upsert(
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to upsert tokens for user ${payload.user_id}: ${error.message}`,
      {
        cause: error,
        context: {
          userId: payload.user_id,
          pgCode: error.code,
          details: error.details,
        },
      }
    );
  }

  logger.info('Tokens upserted successfully', {
    userId: payload.user_id,
    recordId: data.id,
  });

  return data as SchwabTokenRecord;
}

/**
 * Retrieves token record for a specific user.
 *
 * @param client - Supabase service client
 * @param userId - The user's UUID
 * @returns Token record or null if not found
 * @throws SchwabServiceError on database failure
 */
export async function getTokensByUserId(
  client: SupabaseClient,
  userId: string
): Promise<SchwabTokenRecord | null> {
  const { data, error } = await client
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // PGRST116 = no rows returned (not an error, just empty)
    if (error.code === 'PGRST116') {
      return null;
    }

    throw new SchwabServiceError(
      SchwabErrorCode.DB_QUERY_FAILED,
      `Failed to fetch tokens for user ${userId}: ${error.message}`,
      {
        cause: error,
        context: { userId, pgCode: error.code },
      }
    );
  }

  return data as SchwabTokenRecord;
}

/**
 * Finds all token records that need access token rotation.
 * Criteria: status = 'ACTIVE' AND expires_at < now() + 5 minutes
 *
 * @param client - Supabase service client
 * @returns Array of token records needing rotation
 * @throws SchwabServiceError on database failure
 */
export async function getTokensNeedingRotation(
  client: SupabaseClient
): Promise<SchwabTokenRecord[]> {
  const fiveMinutesFromNow = new Date(
    Date.now() + 5 * 60 * 1000
  ).toISOString();

  const { data, error } = await client
    .from(TABLE_NAME)
    .select('*')
    .eq('status', 'ACTIVE')
    .lt('expires_at', fiveMinutesFromNow);

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_QUERY_FAILED,
      `Failed to query tokens needing rotation: ${error.message}`,
      { cause: error, context: { pgCode: error.code } }
    );
  }

  logger.info('Queried tokens needing rotation', {
    count: data?.length ?? 0,
    threshold: fiveMinutesFromNow,
  });

  return (data ?? []) as SchwabTokenRecord[];
}

/**
 * Marks a user's session as needing re-authentication.
 * Called when the refresh token has expired (>7 days without rotation).
 *
 * @param client - Supabase service client
 * @param userId - The user's UUID
 * @throws SchwabServiceError on database failure
 */
export async function markSessionNeedsReauth(
  client: SupabaseClient,
  userId: string
): Promise<void> {
  logger.warn('Marking session as NEEDS_REAUTH', { userId });

  const { error } = await client
    .from(TABLE_NAME)
    .update({
      status: 'NEEDS_REAUTH' as TokenStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    throw new SchwabServiceError(
      SchwabErrorCode.DB_UPSERT_FAILED,
      `Failed to mark session as NEEDS_REAUTH for user ${userId}: ${error.message}`,
      { cause: error, context: { userId, pgCode: error.code } }
    );
  }

  logger.info('Session marked as NEEDS_REAUTH', { userId });
}
