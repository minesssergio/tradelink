import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve to the project root .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import schwabRoutes from './routes/schwab.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Protected API Routes
app.use('/api/v1/schwab', authMiddleware, schwabRoutes);
app.use('/api/v1/portfolio', authMiddleware, portfolioRoutes);

// Error Handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});
