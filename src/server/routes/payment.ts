import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidatePolicySchema } from '../capabilities/schemas.js';
import { DeterministicPolicyEngine } from '../policy/engine.js';
import { PaymentExecutor } from '../payment/boundary.js';
import { RazorpayOrderService } from '../payment/razorpay/orders.js';
import { RazorpayVerificationService } from '../payment/razorpay/verification.js';
import { PurchaseProposal } from '../types/policy.js';
import { AuditService } from '../audit/audit.service.js';

export const paymentRouter = Router();

const VerifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
  decisionId: z.string().optional(),
  auditEventId: z.string().optional(),
  sessionId: z.string().optional(),
});

const ReportFailureSchema = z.object({
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  error_code: z.string().optional(),
  error_description: z.string().optional(),
  error_reason: z.string().optional(),
  error_source: z.string().optional(),
  error_step: z.string().optional(),
  decisionId: z.string().optional(),
  auditEventId: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * POST /api/payment/create_order
 *
 * CRITICAL SECURITY BOUNDARY:
 * 1. Takes an untrusted purchase proposal.
 * 2. Deterministically resolves server catalog pricing & inventory.
 * 3. Evaluates all 10 policy rules.
 * 4. IF BLOCK → Returns 403 Forbidden, NO Razorpay Order is created.
 * 5. IF ALLOW → Type-safe conversion to AuthorizedPaymentPayload & creates server-side Razorpay Order.
 */
paymentRouter.post('/create_order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ValidatePolicySchema.parse(req.body);
    const auditService = AuditService.getInstance();

    const proposal: PurchaseProposal = {
      merchantId: validated.merchantId || 'merchant_aero_gear_in',
      sessionId: validated.sessionId || `sess_${Date.now()}`,
      items: validated.items,
      bundleId: validated.bundleId,
      applyEligibleBundles: validated.applyEligibleBundles,
    };

    // 1. Run Deterministic Policy Engine (Zero LLM)
    const decision = DeterministicPolicyEngine.evaluate(proposal, validated.userAuth);

    // 2. Enforce Boundary: Rejection if status is not ALLOW
    if (decision.status !== 'ALLOW') {
      auditService.appendEvent({
        sessionId: proposal.sessionId,
        eventType: 'POLICY_BLOCKED',
        actor: 'DETERMINISTIC_POLICY_ENGINE',
        data: {
          decisionId: decision.decisionId,
          reasons: decision.violationReasons,
          totalInPaise: decision.trustedTransaction.finalTotalInPaise,
        },
      });

      res.status(403).json({
        status: 'error',
        errorType: 'POLICY_BLOCKED',
        message: 'Transaction was rejected by the Deterministic Policy Engine. Razorpay Order creation aborted.',
        data: decision,
      });
      return;
    }

    // 3. Guaranteed ALLOW: Record payment boundary reached
    auditService.appendEvent({
      sessionId: proposal.sessionId,
      eventType: 'PAYMENT_BOUNDARY_REACHED',
      actor: 'RAZORPAY_GATEWAY',
      data: {
        decisionId: decision.decisionId,
        authorizedTotalInPaise: decision.trustedTransaction.finalTotalInPaise,
      },
    });

    const authorizedPayload = PaymentExecutor.createAuthorizedPayload(decision);

    // 4. Server-Side Razorpay Order creation
    const orderResponse = await RazorpayOrderService.createOrder(authorizedPayload);

    auditService.appendEvent({
      sessionId: proposal.sessionId,
      transactionId: orderResponse.orderId,
      eventType: 'RAZORPAY_ORDER_CREATED',
      actor: 'RAZORPAY_GATEWAY',
      data: {
        orderId: orderResponse.orderId,
        amountInPaise: orderResponse.amountInPaise,
        currency: orderResponse.currency,
        receipt: orderResponse.receipt,
      },
    });

    res.json({
      status: 'success',
      data: {
        order: orderResponse,
        decision,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payment/verify
 *
 * Verifies Razorpay payment signature cryptographically using HMAC-SHA256.
 */
paymentRouter.post('/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = VerifyPaymentSchema.parse(req.body);
    const result = RazorpayVerificationService.verifySignature(validated);
    const auditService = AuditService.getInstance();
    const targetSessionId = validated.sessionId || `sess_verify_${Date.now()}`;

    if (!result.verified) {
      auditService.appendEvent({
        sessionId: targetSessionId,
        transactionId: validated.razorpay_order_id,
        eventType: 'PAYMENT_FAILED',
        actor: 'RAZORPAY_GATEWAY',
        data: {
          orderId: validated.razorpay_order_id,
          paymentId: validated.razorpay_payment_id,
          reason: result.reason || 'HMAC verification failed',
        },
      });

      res.status(400).json({
        status: 'error',
        errorType: 'SIGNATURE_VERIFICATION_FAILED',
        message: result.reason || 'Payment verification failed.',
        data: result,
      });
      return;
    }

    auditService.appendEvent({
      sessionId: targetSessionId,
      transactionId: validated.razorpay_order_id,
      eventType: 'PAYMENT_SUCCESS',
      actor: 'RAZORPAY_GATEWAY',
      data: {
        orderId: validated.razorpay_order_id,
        paymentId: validated.razorpay_payment_id,
        verifiedBy: 'HMAC-SHA256',
      },
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
 * POST /api/payment/report_failure
 *
 * Records explicit Razorpay Test Mode checkout failure.
 */
paymentRouter.post('/report_failure', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ReportFailureSchema.parse(req.body);
    const result = RazorpayVerificationService.reportFailure(validated);
    const auditService = AuditService.getInstance();
    const targetSessionId = validated.sessionId || `sess_fail_${Date.now()}`;

    auditService.appendEvent({
      sessionId: targetSessionId,
      transactionId: validated.razorpay_order_id,
      eventType: 'PAYMENT_FAILED',
      actor: 'RAZORPAY_GATEWAY',
      data: {
        orderId: validated.razorpay_order_id,
        paymentId: validated.razorpay_payment_id,
        errorDescription: validated.error_description || 'Payment rejected by test bank simulator',
      },
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
 * GET /api/payment/audit_logs
 *
 * Retrieves tamper-evident payment audit records.
 */
paymentRouter.get('/audit_logs', (_req: Request, res: Response) => {
  const orderLogs = RazorpayOrderService.getAuditLogs();
  const verLogs = RazorpayVerificationService.getAuditLogs();
  const combined = [...orderLogs, ...verLogs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  res.json({
    status: 'success',
    data: {
      totalEvents: combined.length,
      events: combined,
    },
  });
});
