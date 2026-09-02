import {
  TrustedTransaction,
  UserAuthorizationPolicy,
  RuleEvaluationResult,
  RuleId,
} from '../types/policy.js';

export interface PolicyRule {
  id: RuleId;
  name: string;
  evaluate(
    tx: TrustedTransaction,
    policy: UserAuthorizationPolicy
  ): RuleEvaluationResult;
}

export const DETERMINISTIC_RULES: PolicyRule[] = [
  // RULE-001: SKU must exist in catalog
  {
    id: 'RULE-001',
    name: 'SKU Validity Check',
    evaluate(tx: TrustedTransaction): RuleEvaluationResult {
      const missingSkus = tx.lineItems.filter((i) => !i.skuFound).map((i) => i.sku);
      const passed = missingSkus.length === 0;
      return {
        ruleId: 'RULE-001',
        ruleName: 'SKU Validity Check',
        passed,
        expected: 'All proposed SKUs must exist in merchant catalog',
        actual: passed ? 'All SKUs valid' : `Missing SKUs: ${missingSkus.join(', ')}`,
        reason: passed
          ? 'All requested SKUs exist in the trusted merchant catalog.'
          : `Proposal references invalid SKU(s): ${missingSkus.join(', ')}`,
      };
    },
  },

  // RULE-002: Quantity must be positive
  {
    id: 'RULE-002',
    name: 'Positive Quantity Check',
    evaluate(tx: TrustedTransaction): RuleEvaluationResult {
      const nonPositive = tx.lineItems.filter((i) => !Number.isInteger(i.quantity) || i.quantity <= 0);
      const passed = nonPositive.length === 0 && tx.lineItems.length > 0;
      return {
        ruleId: 'RULE-002',
        ruleName: 'Positive Quantity Check',
        passed,
        expected: 'All item quantities must be integers > 0',
        actual: passed
          ? 'All quantities positive'
          : `Invalid item quantities for: ${nonPositive.map((i) => `${i.sku} (${i.quantity})`).join(', ')}`,
        reason: passed
          ? 'All quantities are valid positive integers.'
          : 'One or more items contain non-positive or non-integer quantities.',
      };
    },
  },

  // RULE-003: Quantity must not exceed maximum order quantity
  {
    id: 'RULE-003',
    name: 'Maximum Quantity Limit Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      const exceeded = tx.lineItems.filter((i) => {
        if (!i.skuFound) return false;
        const maxAllowed = Math.min(i.maxOrderQuantity, policy.maxQuantityPerSku);
        return i.quantity > maxAllowed;
      });
      const passed = exceeded.length === 0;
      return {
        ruleId: 'RULE-003',
        ruleName: 'Maximum Quantity Limit Check',
        passed,
        expected: `Item quantities must not exceed product limit or policy limit (${policy.maxQuantityPerSku})`,
        actual: passed
          ? 'All quantities within allowable limits'
          : `Exceeded on: ${exceeded.map((i) => `${i.sku} (${i.quantity} requested, max ${Math.min(i.maxOrderQuantity, policy.maxQuantityPerSku)})`).join(', ')}`,
        reason: passed
          ? 'Quantities for all items are within product and user policy limits.'
          : `Quantities exceed maximum order limits for: ${exceeded.map((i) => i.sku).join(', ')}`,
      };
    },
  },

  // RULE-004: Product must be in stock when required
  {
    id: 'RULE-004',
    name: 'Inventory Availability Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      if (!policy.requireInStock) {
        return {
          ruleId: 'RULE-004',
          ruleName: 'Inventory Availability Check',
          passed: true,
          expected: 'Stock check bypassed by policy',
          actual: 'Policy requireInStock = false',
          reason: 'Inventory availability requirement is disabled in user authorization policy.',
        };
      }

      const outOfStock = tx.lineItems.filter((i) => !i.inStock);
      const passed = outOfStock.length === 0;
      return {
        ruleId: 'RULE-004',
        ruleName: 'Inventory Availability Check',
        passed,
        expected: 'All requested products must have sufficient in-stock inventory',
        actual: passed
          ? 'All items in stock'
          : `Insufficient stock for: ${outOfStock.map((i) => `${i.sku} (Req: ${i.quantity}, Available: ${i.availableStock})`).join(', ')}`,
        reason: passed
          ? 'All requested items have verified in-stock quantities in warehouse inventory.'
          : `Requested quantities exceed available stock for: ${outOfStock.map((i) => i.sku).join(', ')}`,
      };
    },
  },

  // RULE-005: Currency must be allowed
  {
    id: 'RULE-005',
    name: 'Currency Authorization Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      const allowed = policy.allowedCurrencies.map((c) => c.toUpperCase());
      const txCurrency = tx.currency.toUpperCase();
      const passed = allowed.includes(txCurrency);
      return {
        ruleId: 'RULE-005',
        ruleName: 'Currency Authorization Check',
        passed,
        expected: `Currency must be one of: [${allowed.join(', ')}]`,
        actual: txCurrency,
        reason: passed
          ? `Transaction currency ${txCurrency} is authorized.`
          : `Currency ${txCurrency} is not in authorized list: [${allowed.join(', ')}]`,
      };
    },
  },

  // RULE-006: Category must be allowed
  {
    id: 'RULE-006',
    name: 'Product Category Authorization Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      const allowedCategories = policy.allowedCategories.map((c) => c.toLowerCase());
      const disallowed = tx.lineItems.filter(
        (i) => i.skuFound && !allowedCategories.includes(i.category.toLowerCase())
      );
      const passed = disallowed.length === 0;
      return {
        ruleId: 'RULE-006',
        ruleName: 'Product Category Authorization Check',
        passed,
        expected: `Categories must be in: [${policy.allowedCategories.join(', ')}]`,
        actual: passed
          ? 'All product categories authorized'
          : `Unauthorized categories for: ${disallowed.map((i) => `${i.sku} (${i.category})`).join(', ')}`,
        reason: passed
          ? 'All purchased items belong to authorized product categories.'
          : `Disallowed category detected on items: ${disallowed.map((i) => `${i.sku} (${i.category})`).join(', ')}`,
      };
    },
  },

  // RULE-007: Delivery ETA must satisfy maximum delivery constraint
  {
    id: 'RULE-007',
    name: 'Delivery ETA Constraint Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      const passed = tx.maxDeliveryDays <= policy.maxDeliveryDays;
      return {
        ruleId: 'RULE-007',
        ruleName: 'Delivery ETA Constraint Check',
        passed,
        expected: `Delivery ETA must be <= ${policy.maxDeliveryDays} days`,
        actual: `${tx.maxDeliveryDays} days`,
        reason: passed
          ? `Delivery ETA of ${tx.maxDeliveryDays} day(s) satisfies the maximum threshold (${policy.maxDeliveryDays} days).`
          : `Delivery ETA of ${tx.maxDeliveryDays} day(s) exceeds user authorized limit (${policy.maxDeliveryDays} days).`,
      };
    },
  },

  // RULE-008: Calculated final amount must not exceed max spend
  {
    id: 'RULE-008',
    name: 'Maximum Spend Limit Check',
    evaluate(tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      const passed = tx.finalTotalInPaise <= policy.maxSpendInPaise;
      const formatRupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;
      return {
        ruleId: 'RULE-008',
        ruleName: 'Maximum Spend Limit Check',
        passed,
        expected: `Final total must be <= ${formatRupees(policy.maxSpendInPaise)} (${policy.maxSpendInPaise} paise)`,
        actual: `${formatRupees(tx.finalTotalInPaise)} (${tx.finalTotalInPaise} paise)`,
        reason: passed
          ? `Final transaction amount ${formatRupees(tx.finalTotalInPaise)} is within authorized spend limit ${formatRupees(policy.maxSpendInPaise)}.`
          : `Transaction amount ${formatRupees(tx.finalTotalInPaise)} exceeds user authorized spend limit ${formatRupees(policy.maxSpendInPaise)}.`,
      };
    },
  },

  // RULE-009: Explicit user authorization must exist when required
  {
    id: 'RULE-009',
    name: 'User Explicit Authorization Check',
    evaluate(_tx: TrustedTransaction, policy: UserAuthorizationPolicy): RuleEvaluationResult {
      if (!policy.requireExplicitApproval) {
        return {
          ruleId: 'RULE-009',
          ruleName: 'User Explicit Authorization Check',
          passed: true,
          expected: 'Explicit approval not required by policy',
          actual: 'requireExplicitApproval = false',
          reason: 'Autonomous approval permitted by policy configuration.',
        };
      }

      const passed = Boolean(policy.hasUserApproval);
      return {
        ruleId: 'RULE-009',
        ruleName: 'User Explicit Authorization Check',
        passed,
        expected: 'User explicit session authorization must be present',
        actual: passed ? 'User approval active' : 'User approval missing or revoked',
        reason: passed
          ? 'Explicit user authorization confirmed for current session.'
          : 'Transaction blocked: Missing explicit user authorization signature.',
      };
    },
  },

  // RULE-010: Server-derived calculation invariant
  {
    id: 'RULE-010',
    name: 'Server-Derived Financial Integrity Check',
    evaluate(tx: TrustedTransaction): RuleEvaluationResult {
      const expectedTotal = Math.max(0, tx.subtotalInPaise - tx.discountInPaise);
      const passed = tx.finalTotalInPaise === expectedTotal;
      return {
        ruleId: 'RULE-010',
        ruleName: 'Server-Derived Financial Integrity Check',
        passed,
        expected: `Calculated total must equal (subtotal - discount) = ${expectedTotal} paise`,
        actual: `${tx.finalTotalInPaise} paise`,
        reason: passed
          ? 'Financial calculation is mathematically sound and derived 100% from trusted server catalog data.'
          : 'Mathematical mismatch detected in subtotal and discount calculations.',
      };
    },
  },
];
