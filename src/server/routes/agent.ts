import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CommerceAgentOrchestrator } from '../agent/orchestrator.js';

export const agentRouter = Router();

const AgentChatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  sessionId: z.string().optional(),
  userAuth: z
    .object({
      maxSpendInPaise: z.number().positive().optional(),
      allowedCurrencies: z.array(z.string()).optional(),
      allowedCategories: z.array(z.string()).optional(),
      maxDeliveryDays: z.number().int().positive().optional(),
      requireInStock: z.boolean().optional(),
      maxQuantityPerSku: z.number().int().positive().optional(),
      requireExplicitApproval: z.boolean().optional(),
      hasUserApproval: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/agent/chat
 * Synchronous AI Buyer reasoning endpoint.
 */
agentRouter.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = AgentChatSchema.parse(req.body);
    const orchestrator = new CommerceAgentOrchestrator();

    const result = await orchestrator.run({
      message: validated.message,
      sessionId: validated.sessionId,
      userAuth: validated.userAuth,
    });

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agent/stream
 * Real-time Server-Sent Events (SSE) stream for live agent execution timeline.
 */
agentRouter.post('/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = AgentChatSchema.parse(req.body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const orchestrator = new CommerceAgentOrchestrator();

    const result = await orchestrator.run(
      {
        message: validated.message,
        sessionId: validated.sessionId,
        userAuth: validated.userAuth,
      },
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: 'COMPLETE', result })}\n\n`);
    res.end();
  } catch (error) {
    next(error);
  }
});
