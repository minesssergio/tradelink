import express from 'express';
import cors from 'cors';
import helmetImport from 'helmet';
import dotenv from 'dotenv';

// helmet@8's .d.cts uses `export {helmet as default}` instead of `export =`,
// which some NodeNext module-resolution passes (observed: full `tsc` build,
// but not `tsc --noEmit`) fail to recognize as callable. The runtime value is
// always correct either way; only the static type is ambiguous.
const helmet = helmetImport as unknown as () => express.RequestHandler;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve to the project root .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import schwabRoutes from './routes/schwab.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import cronRoutes from './routes/cron.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import type { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
// CORS: open in dev; restrict in production via CORS_ORIGIN (comma-separated list)
app.use(cors(
  process.env.CORS_ORIGIN
    ? { origin: process.env.CORS_ORIGIN.split(',').map(o => o.trim()) }
    : undefined
));
app.use(express.json());

// Health Check
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Protected API Routes
app.use('/api/v1/schwab', authMiddleware, schwabRoutes);
app.use('/api/v1/portfolio', authMiddleware, portfolioRoutes);

// Cron routes: no logged-in user, so they use their own shared-secret check
// instead of the per-user JWT authMiddleware. Vercel Cron automatically sends
// `Authorization: Bearer ${CRON_SECRET}` when that env var is set — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
const cronAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('CRON_SECRET is not set — refusing all cron requests');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
app.use('/api/v1/cron', cronAuthMiddleware, cronRoutes);

// Error Handling
app.use(errorHandler);

// Without these, an unhandled promise rejection or sync throw outside a
// request handler kills the process with NO log line — it happened silently
// mid-session (tsx watch's parent stayed alive, the actual server died, the
// port went unbound, and nothing in the logs explained why). Log loudly and
// exit deliberately so a supervisor (Task Scheduler, pm2, etc.) can restart
// it and the cause is visible next time.
process.on('uncaughtException', (err) => {
  console.error('🔥 uncaughtException — API process is exiting:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔥 unhandledRejection — API process is exiting:', reason);
  process.exit(1);
});

// On serverless platforms (Vercel) the platform invokes the exported app;
// only bind a port when running as a standalone process.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
  });
}

export default app;
