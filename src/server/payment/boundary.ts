import { AllowedPolicyDecision, BlockedPolicyDecision, PolicyDecision } from '../types/policy.js';

/**
 * Payment Boundary & Safety Invariant
 *
 * This boundary guarantees at the TypeScript compile level and runtime assertion level
 * that ONLY a validated PolicyDecision with status === "ALLOW" can ever reach the payment execution stage.
 *
 * Any attempt to invoke payment execution with a BlockedPolicyDecision or an unverified payload
 * will fail compile-time type checking and throw an immediate fatal runtime exception.
 */

export interface AuthorizedPaymentPayload {
  readonly brand: 'AUTHORIZED_PAYMENT_PAYLOAD';
  decisionId: string;
  auditEventId: string;
  amountInPaise: number;
  currency: string;
  sessionId: string;
  merchantId: string;
  items: Array<{ sku: string; quantity: number; unitPriceInPaise: number }>;
}

export class PaymentBoundaryError extends Error {
  constructor(message: string, public readonly violationReasons?: string[]) {
    super(`[PAYMENT_BOUNDARY_VIOLATION] ${message}`);
    this.name = 'PaymentBoundaryError';
  }
}

export class PaymentExecutor {
  /**
   * Type Guard: Asserts that a PolicyDecision is ALLOWED.
   */
  public static isAllowedDecision(decision: PolicyDecision): decision is AllowedPolicyDecision {
    return decision.status === 'ALLOW';
  }

  /**
   * Converts a verified AllowedPolicyDecision into an AuthorizedPaymentPayload.
   * Rejects any BlockedPolicyDecision.
   */
  public static createAuthorizedPayload(decision: PolicyDecision): AuthorizedPaymentPayload {
    if (decision.status !== 'ALLOW') {
      throw new PaymentBoundaryError(
        'Cannot construct authorized payment payload from a non-ALLOW decision.',
        (decision as BlockedPolicyDecision).violationReasons
      );
    }

    return {
      brand: 'AUTHORIZED_PAYMENT_PAYLOAD',
      decisionId: decision.decisionId,
      auditEventId: decision.auditEventId,
      amountInPaise: decision.trustedTransaction.finalTotalInPaise,
      currency: decision.trustedTransaction.currency,
      sessionId: decision.trustedTransaction.sessionId,
      merchantId: decision.trustedTransaction.merchantId,
      items: decision.trustedTransaction.lineItems.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        unitPriceInPaise: item.unitPriceInPaise,
      })),
    };
  }

  /**
   * Placeholder Payment Execution Function (Milestone 3 target).
   * Notice the strict type signature: it ONLY accepts AuthorizedPaymentPayload.
   * Passing an arbitrary object or a BlockedPolicyDecision will fail compile-time typing.
   */
  public static executePayment(payload: AuthorizedPaymentPayload): {
    status: 'NOT_IMPLEMENTED';
    message: string;
    payload: AuthorizedPaymentPayload;
  } {
    // Runtime assertion as defense-in-depth
    if (!payload || payload.brand !== 'AUTHORIZED_PAYMENT_PAYLOAD') {
      throw new PaymentBoundaryError('Unauthorized or tampered payment execution attempt detected.');
    }

    // Milestone 3 will hook up server-side Razorpay Test Mode Order creation here.
    return {
      status: 'NOT_IMPLEMENTED',
      message: 'Payment execution is gated behind Milestone 3 (Razorpay Test Mode integration).',
      payload,
    };
  }
}
