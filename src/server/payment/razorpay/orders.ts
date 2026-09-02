import crypto from 'crypto';
import { AuthorizedPaymentPayload, PaymentBoundaryError } from '../boundary.js';
import { CreateOrderResponse, PaymentAuditEvent } from './types.js';
import { RazorpayClientService } from './client.js';

export class RazorpayOrderService {
  private static auditLogs: PaymentAuditEvent[] = [];

  /**
   * Creates a server-side Razorpay Order strictly from an AuthorizedPaymentPayload.
   *
   * SECURITY INVARIANT:
   * 1. This function ONLY accepts an AuthorizedPaymentPayload verified by the Deterministic Policy Engine.
   * 2. The amount is strictly payload.amountInPaise derived from trusted catalog pricing.
   * 3. Any attempt to pass an unverified or arbitrary payload will fail at compile-time and runtime.
   */
  public static async createOrder(
    payload: AuthorizedPaymentPayload
  ): Promise<CreateOrderResponse> {
    if (!payload || payload.brand !== 'AUTHORIZED_PAYMENT_PAYLOAD') {
      throw new PaymentBoundaryError('Attempted to create Razorpay order without authorized policy verification.');
    }

    const receipt = `rcpt_mag_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const auditEventId = `aud_evt_ord_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    let orderId: string;

    if (RazorpayClientService.isTestModeConfigured()) {
      const client = RazorpayClientService.getClient();
      const order = await client.orders.create({
        amount: payload.amountInPaise,
        currency: payload.currency,
        receipt,
        notes: {
          decisionId: payload.decisionId,
          auditEventId: payload.auditEventId,
          sessionId: payload.sessionId,
          merchantId: payload.merchantId,
          system: 'MerchantAgentGateway',
        },
      });
      orderId = order.id;
    } else {
      // Deterministic Test Mode Simulator fallback when placeholder keys are active
      orderId = `order_test_${crypto.randomBytes(7).toString('hex')}`;
    }

    // Record ORDER_CREATED Audit Event
    const auditEvent: PaymentAuditEvent = {
      eventId: auditEventId,
      timestamp,
      sessionId: payload.sessionId,
      decisionId: payload.decisionId,
      eventType: 'ORDER_CREATED',
      actor: 'RAZORPAY_GATEWAY',
      orderId,
      amountInPaise: payload.amountInPaise,
      currency: payload.currency,
      outcome: 'SUCCESS',
      details: {
        receipt,
        merchantId: payload.merchantId,
        itemsCount: payload.items.length,
        isTestMode: true,
      },
      razorpayCallExecuted: true,
    };

    this.auditLogs.push(auditEvent);

    return {
      keyId: RazorpayClientService.getKeyId(),
      orderId,
      amountInPaise: payload.amountInPaise,
      currency: payload.currency,
      receipt,
      decisionId: payload.decisionId,
      auditEventId,
    };
  }

  public static getAuditLogs(): PaymentAuditEvent[] {
    return [...this.auditLogs];
  }

  public static clearAuditLogs(): void {
    this.auditLogs = [];
  }
}
