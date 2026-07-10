// =============================================================================
// Schwab Service — Entry Point
// This file wires together all modules and exports them for consumption
// by platform adapters (Vercel Functions, Express, Docker cron, etc.)
//
// Usage examples:
//
//   // 1. Generate authorization URL
//   import { getAuthorizationUrl, loadSchwabConfig } from './index';
//   const config = loadSchwabConfig();
//   const url = getAuthorizationUrl(config);
//
//   // 2. Handle OAuth callback
//   import { handleOAuthCallback } from './index';
//   const tokens = await handleOAuthCallback(authCode, userId);
//
//   // 3. Run token rotation (cron)
//   import { runTokenRotationCron } from './index';
//   await runTokenRotationCron();
// =============================================================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { loadSchwabConfig } from './config/schwab.config.js';
import { getAuthorizationUrl, exchangeCodeForTokens, calculateExpiresAt, ACCESS_TOKEN_LIFETIME_SECONDS, REFRESH_TOKEN_LIFETIME_SECONDS } from './lib/schwabAuth.js';
import { rotateTokensForAllUsers, rotateTokensForUser } from './lib/schwabTokenRotation.js';
import { createServiceClient, upsertTokens, getTokensByUserId } from './db/tokenRepository.js';
import { logger } from './lib/logger.js';

import type { SchwabConfig, SchwabTokenResponse, SchwabTokenRecord, TokenRotationResult } from './types/schwab.types.js';

// ---------------------------------------------------------------------------
// High-level orchestration functions
// These are the primary entry points for platform adapters.
// ---------------------------------------------------------------------------

/**
 * Handles the OAuth callback after the user completes Schwab login.
 * Exchanges the authorization code for tokens and stores them in the database.
 *
 * @param authorizationCode - The code from Schwab's callback URL
 * @param userId - The authenticated user's UUID from Supabase Auth
 * @returns The stored token record
 */
export async function handleOAuthCallback(
  authorizationCode: string,
  userId: string
): Promise<SchwabTokenRecord> {
  const config = loadSchwabConfig();

  logger.info('Handling OAuth callback', { userId });

  // 1. Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(authorizationCode, config);

  // 2. Store tokens in database
  const client = createServiceClient(config);
  const record = await upsertTokens(client, {
    user_id: userId,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    token_type: tokenResponse.token_type,
    scope: tokenResponse.scope,
    expires_at: calculateExpiresAt(tokenResponse.expires_in),
    refresh_expires_at: calculateExpiresAt(REFRESH_TOKEN_LIFETIME_SECONDS),
    status: 'ACTIVE',
    last_rotation_at: new Date().toISOString(),
    rotation_count: 0,
  });

  logger.info('OAuth callback handled successfully', {
    userId,
    recordId: record.id,
  });

  return record;
}

/**
 * Runs the token rotation cron job.
 * Finds all tokens needing refresh and rotates them.
 *
 * Call this from:
 * - Vercel Cron: `/api/cron/rotate-tokens`
 * - System crontab: `node dist/index.js --cron`
 * - pg_cron: via Supabase Edge Function
 *
 * @returns Array of rotation results
 */
export async function runTokenRotationCron(): Promise<TokenRotationResult[]> {
  const config = loadSchwabConfig();

  logger.info('Token rotation cron started');
  const results = await rotateTokensForAllUsers(config);
  logger.info('Token rotation cron finished', {
    total: results.length,
    successful: results.filter((r: TokenRotationResult) => r.success).length,
    failed: results.filter((r: TokenRotationResult) => !r.success).length,
  });

  return results;
}


// ---------------------------------------------------------------------------
// CLI mode: run tasks directly from command line
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--authorize')) {
    // 1. Generate Auth URL
    const config = loadSchwabConfig();
    const url = getAuthorizationUrl(config);
    logger.info('Generated Schwab authorization URL', { context: { callbackUrl: config.callbackUrl } });
    console.log(`\n🔗 Open this URL in your browser to authorize with Schwab:\n\n${url}\n`);
    console.log('After login, Schwab will redirect to your callback URL with a ?code= parameter.');
    console.log('Run this to save the token:\n  npx tsx src/index.ts --callback "YOUR_CODE_HERE"\n');
  } else if (args.includes('--callback')) {
    // Handle the callback
    const codeIndex = args.indexOf('--callback') + 1;
    const code = args[codeIndex];
    if (!code) {
      console.error('Error: You must provide the code string after --callback');
      process.exit(1);
    }
    logger.info('Processing OAuth callback code');
    // For CLI, we need a userId. Let's use a dummy or fetch the first user from auth if needed.
    // Assuming the user is running this locally for themselves, we'll hardcode a dummy UUID for the CLI testing.
    // In production, this comes from the web session.
    const TEST_USER_ID = '834eb033-7b5d-40bc-a87c-92d1bac18a1a'; // Reusing the UUID from the previous logs
    
    import('./lib/schwabAuth.js').then(async () => {
      try {
        const { handleOAuthCallback } = await import('./index.js');
        await handleOAuthCallback(code, TEST_USER_ID);
        console.log('\n✅ Successfully authenticated and saved tokens to Supabase!\n');
        console.log('You can now run: npx tsx src/index.ts --sync\n');
      } catch (err: any) {
        logger.error('Callback processing failed', { error: err.message });
        console.error(err);
      }
    });
  } else if (args.includes('--cron')) {
    // 2. Run Token Rotation
    logger.info('Starting manual token rotation cron');
    runTokenRotationCron().catch((err) => {
      logger.error('Manual cron execution failed', { error: err.message });
      process.exit(1);
    });
  } else if (args.includes('--sync')) {
    // 3. Run ETL Data Sync
    logger.info('Starting manual ETL Sync');
    const config = loadSchwabConfig();
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

    try {
      // Sync every ACTIVE user, or a single one if --user <uuid> is provided
      const userIndex = args.indexOf('--user');
      const singleUserId = userIndex !== -1 ? args[userIndex + 1] : undefined;

      // --start-date is an optional manual override (e.g. forced resync of a
      // specific range). Left unset, runSyncJob resolves an incremental start
      // per account from what's already stored — see syncCursor.ts.
      const startDateIndex = args.indexOf('--start-date');
      const startDateStr = (startDateIndex !== -1 && args[startDateIndex + 1]) ? args[startDateIndex + 1] : undefined;

      const { runSyncForAllActiveUsers } = await import('./etl/syncService.js');
      const results = await runSyncForAllActiveUsers(supabase, config, {
        userId: singleUserId,
        startDate: startDateStr,
        source: 'cli',
      });

      if (results.length === 0) {
        logger.error('No active users found for sync');
        process.exit(1);
      }

      console.log('\n📊 Sync Results:\n', JSON.stringify(results, null, 2));
      if (results.some((r) => !r.success)) process.exit(1);
    } catch (err: any) {
      logger.error('Sync CLI failed', { error: err.message });
      process.exit(1);
    }
  } else {
    console.log('Usage: npx tsx src/index.ts [--authorize | --cron | --sync]');
  }
}

// ---------------------------------------------------------------------------
// Re-exports for library usage
// ---------------------------------------------------------------------------

export {
  loadSchwabConfig,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  rotateTokensForAllUsers,
  rotateTokensForUser,
  createServiceClient,
  upsertTokens,
  getTokensByUserId,
  calculateExpiresAt,
  logger,
  ACCESS_TOKEN_LIFETIME_SECONDS,
  REFRESH_TOKEN_LIFETIME_SECONDS,
};

export type {
  SchwabConfig,
  SchwabTokenResponse,
  SchwabTokenRecord,
  TokenRotationResult,
};
