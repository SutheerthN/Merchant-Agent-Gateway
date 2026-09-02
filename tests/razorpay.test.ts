import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/server/app.js';
import { DeterministicPolicyEngine } from '../src/server/policy/engine.js';
import { PaymentExecutor, PaymentBoundaryError } from '../src/server/payment/boundary.js';
import { RazorpayOrderService } from '../src/server/payment/razorpay/orders.js';
import { RazorpayVerificationService } from '../src/server/payment/razorpay/verification.js';
import { RazorpayClientService } from '../src/server/payment/razorpay/client.js';
import { PurchaseProposal } from '../src/server/types/policy.js';
import { config } from '../src/server/config.js';

const app = createApp();

describe('Razorpay Test Mode Integration & Security Tests (Milestone 3)', () => {
  beforeEach(() => {
    DeterministicPolicyEngine.clearAuditLogs();
    RazorpayOrderService.clearAuditLogs();
    RazorpayVerificationService.clearAuditLogs();
  });

  // TEST 1: Valid ₹2,799 transaction → Policy ALLOW → Razorpay Order creation permitted
  it('TEST 1: Valid ₹2,799 transaction → Policy ALLOW → Razorpay Order creation is permitted', async () => {
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.order).toBeDefined();
    expect(res.body.data.order.orderId).toMatch(/^order_/);
    expect(res.body.data.order.amountInPaise).toBe(279900); // ₹2,799 in paise
    expect(res.body.data.order.currency).toBe('INR');
    expect(res.body.data.decision.status).toBe('ALLOW');
  });

  // TEST 2: ₹12,999 transaction with ₹3,000 limit → Policy BLOCK → Razorpay order creation function NOT called
  it('TEST 2: ₹12,999 transaction with ₹3,000 limit → Policy BLOCK → Razorpay order creation is NOT called', async () => {
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-ADV-999', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
    expect(res.body.errorType).toBe('POLICY_BLOCKED');
    expect(res.body.data.status).toBe('BLOCK');
    expect(res.body.data.razorpayCallExecuted).toBe(false);

    // Verify zero order audit logs were created
    const orderLogs = RazorpayOrderService.getAuditLogs();
    expect(orderLogs).toHaveLength(0);
  });

  // TEST 3: Client attempts to change amount from ₹2,799 to ₹1 → Server still creates order using trusted ₹2,799
  it('TEST 3: Client attempts to change amount to ₹1 → Server uses trusted catalog price ₹2,799', async () => {
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [
          {
            sku: 'SKU-BP-001',
            quantity: 1,
            claimedPriceInPaise: 100, // Client tries to claim ₹1.00
            claimedTotalInPaise: 100,
          },
        ],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.order.amountInPaise).toBe(279900); // Real ₹2,799 enforced
  });

  // TEST 4: Client attempts to change amount from ₹2,799 to ₹12,999 → Server ignores client amount
  it('TEST 4: Client attempts to change amount to ₹12,999 on ₹2,799 SKU → Server strictly derives amount from catalog', async () => {
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [
          {
            sku: 'SKU-BP-001',
            quantity: 1,
            claimedPriceInPaise: 1299900,
            claimedTotalInPaise: 1299900,
          },
        ],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.order.amountInPaise).toBe(279900); // ₹2,799
  });

  // TEST 5: Client attempts to change currency → Server rejects/ignores unauthorized currency
  it('TEST 5: Client attempts to change currency → Server enforces authorized INR currency', async () => {
    const res = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
        userAuth: {
          allowedCurrencies: ['EUR'], // INR not in allowed list
          maxSpendInPaise: 300000,
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.data.status).toBe('BLOCK');
    expect(res.body.data.violationReasons.some((r: string) => r.includes('RULE-005'))).toBe(true);
  });

  // TEST 6: Invalid Razorpay signature → PAYMENT_VERIFICATION_FAILED → NOT SUCCESS
  it('TEST 6: Invalid Razorpay signature → PAYMENT_VERIFICATION_FAILED', async () => {
    const res = await request(app)
      .post('/api/payment/verify')
      .send({
        razorpay_order_id: 'order_test_12345',
        razorpay_payment_id: 'pay_test_67890',
        razorpay_signature: 'tampered_or_invalid_signature_hex',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.errorType).toBe('SIGNATURE_VERIFICATION_FAILED');
    expect(res.body.data.verified).toBe(false);
    expect(res.body.data.status).toBe('PAYMENT_VERIFICATION_FAILED');
  });

  // TEST 7: Valid payment verification → PAYMENT_SUCCESS
  it('TEST 7: Valid HMAC-SHA256 signature verification → PAYMENT_SUCCESS', async () => {
    const orderId = 'order_test_valid_123';
    const paymentId = 'pay_test_valid_456';
    const secret = config.RAZORPAY_KEY_SECRET || 'placeholder_key_secret';

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const res = await request(app)
      .post('/api/payment/verify')
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.status).toBe('PAYMENT_SUCCESS');
  });

  // TEST 8: Payment failure → PAYMENT_FAILURE → No false success
  it('TEST 8: Deliberate or test failure reporting → PAYMENT_FAILED with no false success', async () => {
    const res = await request(app)
      .post('/api/payment/report_failure')
      .send({
        razorpay_order_id: 'order_test_failed_001',
        razorpay_payment_id: 'pay_test_failed_001',
        error_code: 'BAD_REQUEST_ERROR',
        error_description: 'Payment failed due to simulated test card rejection.',
        error_reason: 'payment_failed',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('PAYMENT_FAILED');
    expect(res.body.data.errorCode).toBe('BAD_REQUEST_ERROR');
    expect(res.body.data.errorDescription).toContain('simulated test card rejection');
  });

  // TEST 9: Missing credentials / Security checks → Secret is NEVER exposed to client
  it('TEST 9: Razorpay key_secret is NEVER exposed to client responses', async () => {
    const orderRes = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
      });

    expect(orderRes.status).toBe(200);
    const serialized = JSON.stringify(orderRes.body);
    expect(serialized).not.toContain(config.RAZORPAY_KEY_SECRET);
    expect(orderRes.body.data.order.keyId).toBeDefined();
    expect((orderRes.body.data.order as any).keySecret).toBeUndefined();
  });

  // TEST 10: Audit Log Chaining & Verification
  it('TEST 10: Audit logs record ORDER_CREATED with razorpayCallExecuted = true', async () => {
    await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
      });

    const auditRes = await request(app).get('/api/payment/audit_logs');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.totalEvents).toBeGreaterThanOrEqual(1);

    const orderCreatedEvt = auditRes.body.data.events.find(
      (e: any) => e.eventType === 'ORDER_CREATED'
    );
    expect(orderCreatedEvt).toBeDefined();
    expect(orderCreatedEvt.razorpayCallExecuted).toBe(true);
    expect(orderCreatedEvt.outcome).toBe('SUCCESS');
  });

  // TEST 11: Demo success endpoint verifies authorized order created by policy engine
  it('TEST 11: POST /api/payment/demo_success succeeds for authorized order', async () => {
    const orderRes = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-BP-001', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.data.order.orderId;

    const demoRes = await request(app)
      .post('/api/payment/demo_success')
      .send({
        sessionId: 'sess_test_demo',
        orderId,
      });

    expect(demoRes.status).toBe(200);
    expect(demoRes.body.status).toBe('success');
    expect(demoRes.body.data.verified).toBe(true);
    expect(demoRes.body.data.status).toBe('PAYMENT_SUCCESS');
  });

  // TEST 12: Demo success endpoint REJECTS fake/unauthorized order ID (Cannot bypass policy)
  it('TEST 12: POST /api/payment/demo_success REJECTS fake or unauthorized order ID with 403 Forbidden', async () => {
    const demoRes = await request(app)
      .post('/api/payment/demo_success')
      .send({
        sessionId: 'sess_test_fake',
        orderId: 'order_fake_unauthorized_999',
      });

    expect(demoRes.status).toBe(403);
    expect(demoRes.body.status).toBe('error');
    expect(demoRes.body.errorType).toBe('UNAUTHORIZED_DEMO_PAYMENT');
  });

  // TEST 13: Zero payment secrets in frontend source code
  it('TEST 13: Frontend source code contains ZERO payment secrets', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const appTsxContent = fs.readFileSync(
      path.join(__dirname, '../src/client/src/App.tsx'),
      'utf-8'
    );

    expect(appTsxContent).not.toContain('placeholder_key_secret');
    expect(appTsxContent).not.toContain('RAZORPAY_KEY_SECRET');
  });

  // TEST 14: Demo success endpoint CANNOT bypass POLICY_BLOCKED transaction
  it('TEST 14: POST /api/payment/demo_success CANNOT bypass POLICY_BLOCKED transaction', async () => {
    // 1. Attempt blocked transaction
    const blockedRes = await request(app)
      .post('/api/payment/create_order')
      .send({
        items: [{ sku: 'SKU-ADV-999', quantity: 1 }],
        userAuth: { maxSpendInPaise: 300000 },
      });

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.errorType).toBe('POLICY_BLOCKED');

    // 2. Attempt demo_success with blocked proposal details / arbitrary order ID
    const demoRes = await request(app)
      .post('/api/payment/demo_success')
      .send({
        sessionId: 'sess_test_blocked_bypass',
        orderId: 'order_blocked_attempt_001',
        decisionId: blockedRes.body.data.decisionId,
      });

    expect(demoRes.status).toBe(403);
    expect(demoRes.body.errorType).toBe('UNAUTHORIZED_DEMO_PAYMENT');
  });

  // TEST 15: Zero payment secrets in production compiled client bundle (dist/)
  it('TEST 15: Compiled client build bundle (dist/) contains ZERO payment secrets', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const distPath = path.join(__dirname, '../dist');

    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(path.join(distPath, 'assets'));
      for (const file of files) {
        if (file.endsWith('.js')) {
          const bundleContent = fs.readFileSync(path.join(distPath, 'assets', file), 'utf-8');
          expect(bundleContent).not.toContain('placeholder_key_secret');
          expect(bundleContent).not.toContain('RAZORPAY_KEY_SECRET');
        }
      }
    }
  });
});
