import { Request, Response, NextFunction } from 'express';
import { loadSchwabConfig } from '@trading-journal/schwab-service/src/config/schwab.config.js';
import { getAuthorizationUrl } from '@trading-journal/schwab-service/src/lib/schwabAuth.js';
import { handleOAuthCallback } from '@trading-journal/schwab-service/src/index.js';
import { runSyncJob } from '@trading-journal/schwab-service/src/etl/syncService.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const getAuthUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadSchwabConfig();
    const url = getAuthorizationUrl(config);
    res.json({ url });
  } catch (err) {
    next(err);
  }
};

export const handleCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    const userId = req.user!.id;
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }
    
    await handleOAuthCallback(code, userId);
    
    res.json({ success: true, message: 'Tokens saved successfully' });
  } catch (err) {
    next(err);
  }
};

export const triggerSync = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate } = req.body;
    const userId = req.user!.id;
    const config = loadSchwabConfig();
    
    let start = startDate;
    if (!start) {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      start = d.toISOString();
    }
    
    const end = new Date().toISOString();
    
    const result = await runSyncJob(supabase, userId, config, start, end);
    
    if (!result.success) {
      return res.status(500).json({ error: 'Sync failed', details: result.error });
    }
    
    res.json(result);
  } catch (err) {
    next(err);
  }
};
