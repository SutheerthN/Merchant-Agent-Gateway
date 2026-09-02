/**
 * Policy & Safety Types (For Deterministic Evaluation in Milestone 2)
 *
 * INVARIANT:
 * LLM / Agent ---> Proposes Transaction Payload
 *                       ↓
 *          Deterministic Policy Engine (Zero LLM, 100% Deterministic Code)
 *                       ↓
 *      ALLOW → Execute Payment / BLOCK → Abort & Record Audit Event
 */

export interface UserAuthorizationConstraints {
  maxSpendInPaise: number;
  allowedCurrencies: string[];
  maxDeliveryDays?: number;
  allowedCategories?: string[];
  restrictedSkus?: string[];
}

export interface ProposedTransactionItem {
  sku: string;
  quantity: number;
  unitPriceInPaise: number;
}

export interface ProposedTransaction {
  merchantId: string;
  items: ProposedTransactionItem[];
  totalAmountInPaise: number;
  currency: string;
  deliveryEtaDays: number;
  userAuth: UserAuthorizationConstraints;
}

export type PolicyRuleDecision = 'PASS' | 'FAIL';

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  decision: PolicyRuleDecision;
  reason: string;
  expected: unknown;
  actual: unknown;
}

export interface PolicyEvaluationResult {
  status: 'ALLOW' | 'BLOCK';
  totalRulesEvaluated: number;
  passedRules: number;
  failedRules: number;
  evaluations: RuleEvaluationResult[];
  rejectionReason?: string;
  evaluatedAt: string;
  auditEventId: string;
}
