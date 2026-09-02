import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { AuditService } from '../src/server/audit/audit.service.js';
import { GENESIS_PREVIOUS_HASH, computeEventHash } from '../src/server/audit/audit.hash.js';
import { CommerceAgentOrchestrator } from '../src/server/agent/orchestrator.js';
import { DemoScriptedLLMProvider } from '../src/server/agent/providers/demo.provider.js';

const app = createApp();
const auditService = AuditService.getInstance();

describe('Tamper-Evident Cryptographic Audit Trail (Milestone 5)', () => {
  beforeEach(() => {
    auditService.clearForTests();
  });

  // TEST 1: First audit event uses GENESIS as previousHash
  it('TEST 1: First audit event for a session uses GENESIS as previousHash', () => {
    const event = auditService.appendEvent({
      sessionId: 'sess_genesis_test',
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { message: 'Session started' },
    });

    expect(event.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(event.hash).toBeDefined();
    expect(event.hash.length).toBe(64); // SHA-256 hex string
  });

  // TEST 2: Second event references first event's hash
  it('TEST 2: Second audit event references first event hash as its previousHash', () => {
    const event1 = auditService.appendEvent({
      sessionId: 'sess_link_test',
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { step: 1 },
    });

    const event2 = auditService.appendEvent({
      sessionId: 'sess_link_test',
      eventType: 'TOOL_CALL',
      actor: 'COMMERCE_TOOL',
      data: { step: 2 },
    });

    expect(event2.previousHash).toBe(event1.hash);
  });

  // TEST 3: Hashes are deterministic
  it('TEST 3: SHA-256 hashes are 100% deterministic for identical canonical content', () => {
    const eventData = {
      id: 'aud_evt_fixed_100',
      timestamp: '2026-09-02T10:00:00.000Z',
      sessionId: 'sess_det_test',
      eventType: 'POLICY_RESULT' as const,
      actor: 'DETERMINISTIC_POLICY_ENGINE' as const,
      data: { status: 'ALLOW', total: 279900 },
      previousHash: 'GENESIS',
    };

    const hash1 = computeEventHash(eventData);
    const hash2 = computeEventHash(eventData);

    expect(hash1).toBe(hash2);
  });

  // TEST 4: Changing event data invalidates chain
  it('TEST 4: Mutating event data invalidates the audit chain', () => {
    const sessionId = 'sess_tamper_data';
    auditService.appendEvent({
      sessionId,
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { amount: 279900 },
    });

    const events = auditService.getSessionEvents(sessionId);
    // Mutate data directly in store
    events[0].data = { amount: 100 }; // Attacker modified price from ₹2,799 to ₹1

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidEventId).toBe(events[0].id);
  });

  // TEST 5: Changing previousHash invalidates chain
  it('TEST 5: Mutating previousHash invalidates the audit chain', () => {
    const sessionId = 'sess_tamper_prev';
    auditService.appendEvent({
      sessionId,
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { step: 1 },
    });
    const event2 = auditService.appendEvent({
      sessionId,
      eventType: 'TOOL_CALL',
      actor: 'COMMERCE_TOOL',
      data: { step: 2 },
    });

    // Mutate previousHash of event 2
    event2.previousHash = 'tampered_fake_previous_hash';

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidEventId).toBe(event2.id);
  });

  // TEST 6: Changing hash invalidates chain
  it('TEST 6: Forged hash on an event invalidates the audit chain', () => {
    const sessionId = 'sess_tamper_hash';
    const event = auditService.appendEvent({
      sessionId,
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { step: 1 },
    });

    event.hash = 'f' + event.hash.substring(1); // Forge first character of hash

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidEventId).toBe(event.id);
  });

  // TEST 7: Earlier-event tampering is identified with exact firstInvalidEventId
  it('TEST 7: Tampering with an earlier event in a multi-event chain reports the exact first invalid event ID', () => {
    const sessionId = 'sess_multi_tamper';
    const e1 = auditService.appendEvent({ sessionId, eventType: 'AGENT_STARTED', actor: 'AI_BUYER_AGENT', data: { step: 1 } });
    const e2 = auditService.appendEvent({ sessionId, eventType: 'TOOL_CALL', actor: 'COMMERCE_TOOL', data: { step: 2 } });
    const e3 = auditService.appendEvent({ sessionId, eventType: 'POLICY_RESULT', actor: 'DETERMINISTIC_POLICY_ENGINE', data: { step: 3 } });

    // Mutate e2 (middle event)
    e2.data = { step: 'tampered' };

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidEventId).toBe(e2.id);
  });

  // TEST 8: Policy ALLOW is audited
  it('TEST 8: Policy ALLOW decision creates a valid POLICY_RESULT audit event', async () => {
    const sessionId = 'sess_allow_audit';
    const orchestrator = new CommerceAgentOrchestrator(new DemoScriptedLLMProvider());
    await orchestrator.run({
      message: 'Find a waterproof laptop backpack under ₹3,000',
      sessionId,
      userAuth: { maxSpendInPaise: 300000 },
    });

    const events = auditService.getSessionEvents(sessionId);
    const policyEvent = events.find((e) => e.eventType === 'POLICY_RESULT');

    expect(policyEvent).toBeDefined();
    expect(policyEvent?.actor).toBe('DETERMINISTIC_POLICY_ENGINE');
    expect(policyEvent?.data.decision).toBe('ALLOW');

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(true);
  });

  // TEST 9: Policy BLOCK is audited (POLICY_BLOCKED)
  it('TEST 9: Policy BLOCK decision creates a valid POLICY_BLOCKED audit event', async () => {
    const sessionId = 'sess_block_audit';
    const orchestrator = new CommerceAgentOrchestrator(new DemoScriptedLLMProvider());
    await orchestrator.run({
      message: 'Buy the luxury executive leather briefcase',
      sessionId,
      userAuth: { maxSpendInPaise: 300000 },
    });

    const events = auditService.getSessionEvents(sessionId);
    const policyEvent = events.find((e) => e.eventType === 'POLICY_BLOCKED');

    expect(policyEvent).toBeDefined();
    expect(policyEvent?.actor).toBe('DETERMINISTIC_POLICY_ENGINE');
    expect(policyEvent?.data.decision).toBe('BLOCK');
  });

  // TEST 10: Blocked policy produces no Razorpay order audit event
  it('TEST 10: A POLICY_BLOCKED transaction produces ZERO RAZORPAY_ORDER_CREATED audit events', async () => {
    const sessionId = 'sess_zero_order_audit';
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        sessionId,
        items: [{ sku: 'SKU-ADV-999', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(403);

    const events = auditService.getSessionEvents(sessionId);
    const orderCreatedEvent = events.find((e) => e.eventType === 'RAZORPAY_ORDER_CREATED');

    expect(orderCreatedEvent).toBeUndefined();
    expect(events.some((e) => e.eventType === 'POLICY_BLOCKED')).toBe(true);
  });

  // TEST 11: Successful Razorpay order is audited
  it('TEST 11: Authorized payment produces a valid RAZORPAY_ORDER_CREATED audit event', async () => {
    const sessionId = 'sess_valid_order_audit';
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        sessionId,
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(200);

    const events = auditService.getSessionEvents(sessionId);
    const orderCreatedEvent = events.find((e) => e.eventType === 'RAZORPAY_ORDER_CREATED');

    expect(orderCreatedEvent).toBeDefined();
    expect(orderCreatedEvent?.data.amountInPaise).toBe(279900);
    expect(orderCreatedEvent?.transactionId).toBeDefined();

    const verification = auditService.verifyChain(sessionId);
    expect(verification.valid).toBe(true);
  });

  // TEST 12: Failed payment is audited
  it('TEST 12: Payment failure reporting appends a PAYMENT_FAILED audit event', async () => {
    const sessionId = 'sess_fail_audit';
    const res = await request(app)
      .post('/api/payment/report_failure')
      .send({
        sessionId,
        razorpay_order_id: 'order_test_fail_123',
        error_description: 'Test bank card decline',
      });

    expect(res.status).toBe(200);

    const events = auditService.getSessionEvents(sessionId);
    const failEvent = events.find((e) => e.eventType === 'PAYMENT_FAILED');

    expect(failEvent).toBeDefined();
    expect(failEvent?.data.errorDescription).toBe('Test bank card decline');
  });

  // TEST 13: Secrets are not persisted
  it('TEST 13: Secrets, API keys, and CVVs are automatically redacted from audit events', () => {
    const event = auditService.appendEvent({
      sessionId: 'sess_scrub_test',
      eventType: 'AGENT_STARTED',
      actor: 'SYSTEM',
      data: {
        key_secret: 'super_secret_razorpay_key',
        cardNumber: '4111111111111111',
        safeProperty: 'public_value',
      },
    });

    expect(event.data.key_secret).toBe('[REDACTED_SENSITIVE_DATA]');
    expect(event.data.cardNumber).toBe('[REDACTED_SENSITIVE_DATA]');
    expect(event.data.safeProperty).toBe('public_value');
  });

  // TEST 14: Hidden chain-of-thought is not persisted
  it('TEST 14: Hidden model reasoning fields are redacted from audit log', () => {
    const event = auditService.appendEvent({
      sessionId: 'sess_cot_test',
      eventType: 'AGENT_THINKING',
      actor: 'AI_BUYER_AGENT',
      data: {
        message: 'Reasoning next step',
        reasoning: 'Internal private chain of thought...',
      },
    });

    expect(event.data.reasoning).toBe('[REDACTED_SENSITIVE_DATA]');
  });

  // TEST 15 & 16: LLM cannot provide hash or previousHash values
  it('TEST 15 & 16: Inputs with user-supplied hash or previousHash are discarded in favor of server calculation', () => {
    const input: any = {
      sessionId: 'sess_no_override',
      eventType: 'AGENT_STARTED',
      actor: 'AI_BUYER_AGENT',
      data: { test: true },
      previousHash: 'FORGED_PREVIOUS_HASH',
      hash: 'FORGED_HASH',
    };

    const event = auditService.appendEvent(input);

    expect(event.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(event.hash).not.toBe('FORGED_HASH');
  });

  // TEST 17: GET /api/audit/verify/:sessionId API endpoint
  it('TEST 17: GET /api/audit/verify/:sessionId correctly reports chain status for valid and tampered sessions', async () => {
    const sessionId = 'sess_api_verify';
    auditService.appendEvent({ sessionId, eventType: 'AGENT_STARTED', actor: 'AI_BUYER_AGENT', data: { step: 1 } });
    auditService.appendEvent({ sessionId, eventType: 'POLICY_RESULT', actor: 'DETERMINISTIC_POLICY_ENGINE', data: { status: 'ALLOW' } });

    // Valid check
    const validRes = await request(app).get(`/api/audit/verify/${sessionId}`);
    expect(validRes.status).toBe(200);
    expect(validRes.body.data.valid).toBe(true);
    expect(validRes.body.data.eventCount).toBe(2);

    // Tamper event 1
    const events = auditService.getSessionEvents(sessionId);
    events[0].data = { tampered: true };

    // Invalid check
    const invalidRes = await request(app).get(`/api/audit/verify/${sessionId}`);
    expect(invalidRes.status).toBe(200);
    expect(invalidRes.body.data.valid).toBe(false);
    expect(invalidRes.body.data.firstInvalidEventId).toBe(events[0].id);
  });
});
