import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { capabilitiesRouter } from './routes/capabilities.js';
import { healthRouter } from './routes/health.js';
import { paymentRouter } from './routes/payment.js';
import { agentRouter } from './routes/agent.js';
import { auditRouter } from './routes/audit.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount API Routers
  app.use('/api/health', healthRouter);
  app.use('/api/capabilities', capabilitiesRouter);
  app.use('/api/payment', paymentRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/audit', auditRouter);

  // Global Zod & Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        status: 'error',
        errorType: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({
      status: 'error',
      errorType: 'INTERNAL_ERROR',
      message,
    });
  });

  return app;
}
