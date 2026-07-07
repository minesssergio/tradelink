// Vercel serverless entry point — the platform routes every request here
// (see services/api/vercel.json). The Express app itself lives in src/server.ts
// and skips app.listen() when process.env.VERCEL is set.
import app from '../src/server.js';

export default app;
