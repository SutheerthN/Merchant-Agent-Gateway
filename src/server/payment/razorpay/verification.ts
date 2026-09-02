import crypto from 'crypto';
import { config } from '../../config.js';
import {
  PaymentVerificationInput,
  PaymentVerificationResult,
  PaymentFailureInput,
  PaymentFailureResult,
  PaymentAuditEvent,
} from './types.js';

export class RazorpayVerificationService {
  private static auditLogs: PaymentAuditEvent[] = [];

  /**
   * Performs cryptographic HMAC-SHA256 signature verification for a completed Razorpay checkout.
   *
   * Formula:
   * generated_signature = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
   */
  public static verifySignature(
    input: PaymentVerificationInput
  ): PaymentVerificationResult {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = input;
    const auditEventId = `aud_evt_ver_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      const result: PaymentVerificationResult = {
        verified: false,
        status: 'PAYMENT_VERIFICATION_FAILED',
        orderId: razorpay_order_id || 'UNKNOWN',
        paymentId: razorpay_payment_id || 'UNKNOWN',
        auditEventId,
        timestamp,
        reason: 'Missing one or more required payment verification parameters.',
      };

      this.recordAudit({
        eventId: auditEventId,
        timestamp,
        decisionId: input.decisionId,
        eventType: 'PAYMENT_VERIFICATION_FAILED',
        actor: 'RAZORPAY_GATEWAY',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        outcome: 'FAILURE',
        details: { reason: result.reason },
        razorpayCallExecuted: true,
      });

      return result;
    }

    const secret = config.RAZORPAY_KEY_SECRET || 'placeholder_key_secret';
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Safe constant-time equality comparison
    const signaturesMatch =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(razorpay_signature, 'utf-8')
      );

    if (signaturesMatch) {
      const result: PaymentVerificationResult = {
        verified: true,
        status: 'PAYMENT_SUCCESS',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        auditEventId,
        timestamp,
      };

      this.recordAudit({
        eventId: auditEventId,
        timestamp,
        decisionId: input.decisionId,
        eventType: 'PAYMENT_SUCCESS',
        actor: 'RAZORPAY_GATEWAY',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        outcome: 'SUCCESS',
        details: {
          verifiedBy: 'HMAC-SHA256',
          status: 'SUCCESS',
        },
        razorpayCallExecuted: true,
      });

      return result;
    }

    // Signature mismatch
    const result: PaymentVerificationResult = {
      verified: false,
      status: 'PAYMENT_VERIFICATION_FAILED',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      auditEventId,
      timestamp,
      reason: 'HMAC-SHA256 signature mismatch. Payment payload integrity check failed.',
    };

    this.recordAudit({
      eventId: auditEventId,
      timestamp,
      decisionId: input.decisionId,
      eventType: 'PAYMENT_VERIFICATION_FAILED',
      actor: 'RAZORPAY_GATEWAY',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      outcome: 'FAILURE',
      details: {
        reason: result.reason,
        expectedLength: expectedSignature.length,
        actualLength: razorpay_signature.length,
      },
      razorpayCallExecuted: true,
    });

    return result;
  }

  /**
   * Records and processes a deliberate or runtime Razorpay payment failure.
   * Prevents false success hallucinations.
   */
  public static reportFailure(input: PaymentFailureInput): PaymentFailureResult {
    const auditEventId = `aud_evt_fail_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const errorCode = input.error_code || 'BAD_REQUEST_ERROR';
    const errorDescription =
      input.error_description ||
      input.error_reason ||
      'Payment was cancelled or failed by the issuing bank / test card simulator.';

    const result: PaymentFailureResult = {
      status: 'PAYMENT_FAILED',
      orderId: input.razorpay_order_id || 'UNKNOWN',
      paymentId: input.razorpay_payment_id,
      errorCode,
      errorDescription,
      auditEventId,
      timestamp,
    };

    this.recordAudit({
      eventId: auditEventId,
      timestamp,
      decisionId: input.decisionId,
      eventType: 'PAYMENT_FAILURE',
      actor: 'RAZORPAY_GATEWAY',
      orderId: input.razorpay_order_id,
      paymentId: input.razorpay_payment_id,
      outcome: 'FAILURE',
      details: {
        errorCode,
        errorDescription,
        errorSource: input.error_source,
        errorStep: input.error_step,
        moneyCollected: false,
      },
      razorpayCallExecuted: true,
    });

    return result;
  }

  private static recordAudit(event: PaymentAuditEvent): void {
    this.auditLogs.push(event);
  }

  public static getAuditLogs(): PaymentAuditEvent[] {
    return [...this.auditLogs];
  }

  public static clearAuditLogs(): void {
    this.auditLogs = [];
  }
}
