/**
 * Policy & Safety Types for Deterministic Evaluation
 *
 * CRITICAL SECURITY INVARIANT:
 * 1. The LLM is UNTRUSTED.
 * 2. LLM proposes only intent (SKU, quantity, optional bundle request).
 * 3. ALL financial & physical facts (price, stock, currency, category, ETA)
 *    are resolved from trusted server-side catalog data.
 * 4. The Deterministic Policy Engine has ZERO LLM dependency (100% pure code).
 * 5. ONLY an AllowedPolicyDecision can ever be passed to the Payment Boundary.
 */

import { BundleRule } from '../catalog/products.js';

// --- 1. UNTRUSTED AGENT PROPOSAL ---
export interface ProposedItem {
  sku: string;
  quantity: number;
  // Note: If an untrusted agent includes claimed prices or totals, they are ignored by the server.
  claimedPriceInPaise?: number;
  claimedTotalInPaise?: number;
}

export interface PurchaseProposal {
  merchantId: string;
  sessionId: string;
  items: ProposedItem[];
  bundleId?: string;
  applyEligibleBundles?: boolean;
  userAuthContextId?: string;
}

// --- 2. USER AUTHORIZATION POLICY ---
export interface UserAuthorizationPolicy {
  maxSpendInPaise: number;
  allowedCurrencies: string[];
  allowedCategories: string[];
  maxDeliveryDays: number;
  requireInStock: boolean;
  maxQuantityPerSku: number;
  requireExplicitApproval: boolean;
  hasUserApproval?: boolean;
}

// Default policy for demo & standard checkout sessions
export const DEFAULT_DEMO_POLICY: UserAuthorizationPolicy = {
  maxSpendInPaise: 300000, // ₹3,000.00
  allowedCurrencies: ['INR'],
  allowedCategories: ['Bags & Backpacks', 'Accessories', 'Luggage'],
  maxDeliveryDays: 3,
  requireInStock: true,
  maxQuantityPerSku: 5,
  requireExplicitApproval: true,
  hasUserApproval: true,
};

// --- 3. TRUSTED SERVER-RESOLVED TRANSACTION ---
export interface TrustedLineItem {
  sku: string;
  name: string;
  category: string;
  unitPriceInPaise: number;
  quantity: number;
  lineTotalInPaise: number;
  currency: string;
  inStock: boolean;
  availableStock: number;
  maxOrderQuantity: number;
  deliveryEtaDays: number;
  skuFound: boolean;
}

export interface TrustedTransaction {
  merchantId: string;
  sessionId: string;
  lineItems: TrustedLineItem[];
  subtotalInPaise: number;
  discountInPaise: number;
  appliedBundles: BundleRule[];
  finalTotalInPaise: number;
  currency: string;
  maxDeliveryDays: number;
  allSkusFound: boolean;
  resolvedAt: string;
}

// --- 4. DETERMINISTIC RULE RESULTS ---
export type RuleId =
  | 'RULE-001' // SKU Exists
  | 'RULE-002' // Quantity Positive
  | 'RULE-003' // Max Quantity Per SKU
  | 'RULE-004' // In Stock Required
  | 'RULE-005' // Currency Allowed
  | 'RULE-006' // Category Allowed
  | 'RULE-007' // Delivery SLA Satisfied
  | 'RULE-008' // Max Spend Limit
  | 'RULE-009' // User Authorization Present
  | 'RULE-010'; // Server-Derived Calculation Invariant

export interface RuleEvaluationResult {
  ruleId: RuleId;
  ruleName: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  reason: string;
}

// --- 5. POLICY DECISION ---
export interface PolicyDecisionBase {
  decisionId: string;
  auditEventId: string;
  timestamp: string;
  proposal: PurchaseProposal;
  trustedTransaction: TrustedTransaction;
  userPolicy: UserAuthorizationPolicy;
  ruleResults: RuleEvaluationResult[];
  razorpayCallExecuted: false;
}

export interface AllowedPolicyDecision extends PolicyDecisionBase {
  status: 'ALLOW';
  violationReasons: [];
}

export interface BlockedPolicyDecision extends PolicyDecisionBase {
  status: 'BLOCK';
  violationReasons: string[];
}

export type PolicyDecision = AllowedPolicyDecision | BlockedPolicyDecision;

// --- 6. AUDIT EVENT FOR POLICY EVALUATION ---
export interface PolicyAuditEvent {
  eventId: string;
  timestamp: string;
  sessionId: string;
  eventType: 'POLICY_EVALUATION';
  decision: 'ALLOW' | 'BLOCK';
  proposedItems: ProposedItem[];
  trustedCalculatedAmountInPaise: number;
  authorizedLimitInPaise: number;
  ruleResults: RuleEvaluationResult[];
  violationReasons: string[];
  razorpayCallExecuted: false;
}
