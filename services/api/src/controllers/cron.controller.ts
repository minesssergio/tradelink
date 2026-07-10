import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSchwabConfig } from '@trading-journal/schwab-service/src/config/schwab.config.js';
import { runSyncForAllActiveUsers } from '@trading-journal/schwab-service/src/etl/syncService.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Vercel Cron entry point: syncs every user with an ACTIVE Schwab token.
 * Each user's sync uses their own stored token and only touches their own
 * account_hash rows — one user's failure or slow sync never blocks another's.
 * Protected by CRON_SECRET (see cronAuthMiddleware in server.ts), not by the
 * regular per-user JWT auth — there's no logged-in user in a cron invocation.
 */
export const runCronSync = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadSchwabConfig();
    const results = await runSyncForAllActiveUsers(supabase, config, { source: 'cron' });
    const failed = results.filter((r) => !r.success);

    res.json({
      success: failed.length === 0,
      usersProcessed: results.length,
      usersFailed: failed.length,
      results,
    });
  } catch (err) {
    next(err);
  }
};
