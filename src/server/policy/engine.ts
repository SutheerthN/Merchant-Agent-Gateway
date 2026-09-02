import crypto from 'crypto';
import {
  PurchaseProposal,
  UserAuthorizationPolicy,
  PolicyDecision,
  DEFAULT_DEMO_POLICY,
  PolicyAuditEvent,
} from '../types/policy.js';
import { TrustedTransactionResolver } from './resolver.js';
import { DETERMINISTIC_RULES } from './rules.js';

export class DeterministicPolicyEngine {
  private static auditLogs: PolicyAuditEvent[] = [];

  /**
   * Deterministically evaluates an untrusted PurchaseProposal against trusted server catalog data
   * and user authorization constraints.
   *
   * ZERO LLM DEPENDENCY:
   * This function contains 100% deterministic code.
   */
  public static evaluate(
    proposal: PurchaseProposal,
    customPolicy?: Partial<UserAuthorizationPolicy>
  ): PolicyDecision {
    const policy: UserAuthorizationPolicy = {
      ...DEFAULT_DEMO_POLICY,
      ...customPolicy,
    };

    // 1. Authoritatively resolve trusted facts from catalog
    const trustedTx = TrustedTransactionResolver.resolve(proposal);

    // 2. Execute all deterministic rules
    const ruleResults = DETERMINISTIC_RULES.map((rule) =>
      rule.evaluate(trustedTx, policy)
    );

    const failedRules = ruleResults.filter((r) => !r.passed);
    const passed = failedRules.length === 0;

    const violationReasons = failedRules.map((r) => `${r.ruleId} (${r.ruleName}): ${r.reason}`);

    const timestamp = new Date().toISOString();
    const decisionId = `dec_${crypto.randomUUID()}`;
    const auditEventId = `aud_evt_${crypto.randomUUID()}`;

    // 3. Construct immutable Audit Event
    const auditEvent: PolicyAuditEvent = {
      eventId: auditEventId,
      timestamp,
      sessionId: proposal.sessionId || trustedTx.sessionId,
      eventType: 'POLICY_EVALUATION',
      decision: passed ? 'ALLOW' : 'BLOCK',
      proposedItems: proposal.items,
      trustedCalculatedAmountInPaise: trustedTx.finalTotalInPaise,
      authorizedLimitInPaise: policy.maxSpendInPaise,
      ruleResults,
      violationReasons,
      razorpayCallExecuted: false,
    };

    this.auditLogs.push(auditEvent);

    // 4. Return type-safe PolicyDecision
    if (passed) {
      return {
        decisionId,
        auditEventId,
        timestamp,
        status: 'ALLOW',
        proposal,
        trustedTransaction: trustedTx,
        userPolicy: policy,
        ruleResults,
        violationReasons: [],
        razorpayCallExecuted: false,
      };
    }

    return {
      decisionId,
      auditEventId,
      timestamp,
      status: 'BLOCK',
      proposal,
      trustedTransaction: trustedTx,
      userPolicy: policy,
      ruleResults,
      violationReasons,
      razorpayCallExecuted: false,
    };
  }

  /**
   * Retrieves all recorded in-memory policy audit logs (for observability & testing).
   */
  public static getAuditLogs(): PolicyAuditEvent[] {
    return [...this.auditLogs];
  }

  /**
   * Clears audit logs (used for test isolation).
   */
  public static clearAuditLogs(): void {
    this.auditLogs = [];
  }
}
