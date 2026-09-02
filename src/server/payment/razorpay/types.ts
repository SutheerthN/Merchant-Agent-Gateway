export interface RazorpayOrderResult {
  id: string;
  entity: 'order';
  amount: number; // in paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface CreateOrderResponse {
  keyId: string;
  orderId: string;
  amountInPaise: number;
  currency: string;
  receipt: string;
  decisionId: string;
  auditEventId: string;
}

export interface PaymentVerificationInput {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  decisionId?: string;
  auditEventId?: string;
}

export interface PaymentVerificationResult {
  verified: boolean;
  status: 'PAYMENT_SUCCESS' | 'PAYMENT_VERIFICATION_FAILED';
  orderId: string;
  paymentId: string;
  auditEventId: string;
  timestamp: string;
  reason?: string;
}

export interface PaymentFailureInput {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  error_code?: string;
  error_description?: string;
  error_reason?: string;
  error_source?: string;
  error_step?: string;
  decisionId?: string;
  auditEventId?: string;
}

export interface PaymentFailureResult {
  status: 'PAYMENT_FAILED';
  orderId: string;
  paymentId?: string;
  errorCode: string;
  errorDescription: string;
  auditEventId: string;
  timestamp: string;
}

export type PaymentAuditEventType =
  | 'ORDER_CREATED'
  | 'CHECKOUT_STARTED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILURE'
  | 'PAYMENT_VERIFICATION_FAILED';

export interface PaymentAuditEvent {
  eventId: string;
  timestamp: string;
  sessionId?: string;
  decisionId?: string;
  eventType: PaymentAuditEventType;
  actor: 'RAZORPAY_GATEWAY' | 'POLICY_ENGINE' | 'CLIENT_CHECKOUT';
  orderId?: string;
  paymentId?: string;
  amountInPaise?: number;
  currency?: string;
  outcome: 'SUCCESS' | 'FAILURE';
  details: Record<string, unknown>;
  razorpayCallExecuted: boolean;
}
