import { Router, Request, Response } from 'express';
import { CapabilityService } from '../capabilities/service.js';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const manifest = CapabilityService.getManifest();
  res.json({
    status: 'healthy',
    service: 'Merchant Agent Gateway',
    version: manifest.gatewayVersion,
    mode: 'TEST / DEMO',
    paymentIntegration: 'RAZORPAY_TEST_MODE_ACTIVE (Server-Side Orders + HMAC Verification)',
    policyEngine: 'DETERMINISTIC_ACTIVE (10 Rules Enforced)',
    activeCapabilities: manifest.capabilities.map((c) => c.name),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
