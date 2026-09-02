export type AuditActor =
  | 'AI_BUYER_AGENT'
  | 'COMMERCE_TOOL'
  | 'DETERMINISTIC_POLICY_ENGINE'
  | 'RAZORPAY_GATEWAY'
  | 'SYSTEM';

export type AuditEventType =
  | 'GENESIS'
  | 'AGENT_STARTED'
  | 'AGENT_THINKING'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'PROPOSAL_CREATED'
  | 'POLICY_VALIDATING'
  | 'POLICY_RESULT'
  | 'POLICY_BLOCKED'
  | 'PAYMENT_BOUNDARY_REACHED'
  | 'RAZORPAY_ORDER_CREATED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'AGENT_COMPLETED'
  | 'AGENT_ERROR';

export interface AuditEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  transactionId?: string;
  eventType: AuditEventType;
  actor: AuditActor;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export type CreateAuditEventInput = Omit<AuditEvent, 'id' | 'timestamp' | 'previousHash' | 'hash'>;

export interface ChainVerificationResult {
  valid: boolean;
  eventCount: number;
  firstInvalidEventId: string | null;
  reason?: string;
}
