import { Router, Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';

export const auditRouter = Router();

/**
 * GET /api/audit/session/:sessionId
 * Retrieves all cryptographic audit events for a specific agent session.
 */
auditRouter.get('/session/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const auditService = AuditService.getInstance();
  const events = auditService.getSessionEvents(sessionId);

  res.json({
    status: 'success',
    data: {
      sessionId,
      eventCount: events.length,
      events,
    },
  });
});

/**
 * GET /api/audit/verify/:sessionId
 * Cryptographically verifies the SHA-256 hash chain for a specific session.
 * Recomputes all hashes and checks sequential previousHash linkage from GENESIS.
 */
auditRouter.get('/verify/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const auditService = AuditService.getInstance();
  const verification = auditService.verifyChain(sessionId);

  res.json({
    status: 'success',
    data: verification,
  });
});

/**
 * GET /api/audit/transaction/:transactionId
 * Retrieves audit records linked to a specific transaction/order ID.
 */
auditRouter.get('/transaction/:transactionId', (req: Request, res: Response) => {
  const transactionId = req.params.transactionId as string;
  const auditService = AuditService.getInstance();
  const events = auditService.getTransactionEvents(transactionId);

  res.json({
    status: 'success',
    data: {
      transactionId,
      eventCount: events.length,
      events,
    },
  });
});
