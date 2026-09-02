import { MERCHANT_CATALOG, MERCHANT_BUNDLE_RULES, BundleRule } from '../catalog/products.js';
import { PurchaseProposal, TrustedTransaction, TrustedLineItem } from '../types/policy.js';

export class TrustedTransactionResolver {
  /**
   * Resolves an untrusted PurchaseProposal into authoritative server-side facts.
   * Any client/LLM-supplied prices, totals, or currencies are discarded.
   */
  public static resolve(proposal: PurchaseProposal): TrustedTransaction {
    const lineItems: TrustedLineItem[] = [];
    let subtotalInPaise = 0;
    let maxDeliveryDays = 0;
    let allSkusFound = true;
    const presentSkus: string[] = [];

    for (const item of proposal.items) {
      const product = MERCHANT_CATALOG.find(
        (p) => p.sku.toUpperCase() === item.sku.trim().toUpperCase()
      );

      if (!product) {
        allSkusFound = false;
        lineItems.push({
          sku: item.sku,
          name: 'UNKNOWN PRODUCT',
          category: 'UNKNOWN',
          unitPriceInPaise: 0,
          quantity: item.quantity,
          lineTotalInPaise: 0,
          currency: 'UNKNOWN',
          inStock: false,
          availableStock: 0,
          maxOrderQuantity: 0,
          deliveryEtaDays: 999,
          skuFound: false,
        });
        continue;
      }

      const inStock = product.stock >= item.quantity;
      const lineTotal = product.priceInPaise * item.quantity;
      subtotalInPaise += lineTotal;

      if (product.deliveryEtaDays > maxDeliveryDays) {
        maxDeliveryDays = product.deliveryEtaDays;
      }

      for (let i = 0; i < item.quantity; i++) {
        presentSkus.push(product.sku);
      }

      lineItems.push({
        sku: product.sku,
        name: product.name,
        category: product.category,
        unitPriceInPaise: product.priceInPaise,
        quantity: item.quantity,
        lineTotalInPaise: lineTotal,
        currency: product.currency,
        inStock,
        availableStock: product.stock,
        maxOrderQuantity: product.maxQuantity,
        deliveryEtaDays: product.deliveryEtaDays,
        skuFound: true,
      });
    }

    // Apply bundle discounts based on trusted server-side rules
    const appliedBundles: BundleRule[] = [];
    let discountInPaise = 0;

    const shouldApplyBundles = proposal.applyEligibleBundles ?? true;
    if (shouldApplyBundles && allSkusFound) {
      if (proposal.bundleId) {
        const specificBundle = MERCHANT_BUNDLE_RULES.find(
          (b) => b.bundleId.toUpperCase() === proposal.bundleId?.trim().toUpperCase()
        );
        if (
          specificBundle &&
          specificBundle.requiredSkus.every((sku) => presentSkus.includes(sku))
        ) {
          appliedBundles.push(specificBundle);
          discountInPaise += specificBundle.discountInPaise;
        }
      } else {
        for (const rule of MERCHANT_BUNDLE_RULES) {
          const canApply = rule.requiredSkus.every((sku) => presentSkus.includes(sku));
          if (canApply) {
            appliedBundles.push(rule);
            discountInPaise += rule.discountInPaise;
          }
        }
      }
    }

    const finalTotalInPaise = Math.max(0, subtotalInPaise - discountInPaise);

    return {
      merchantId: proposal.merchantId || 'merchant_aero_gear_in',
      sessionId: proposal.sessionId || `sess_${Date.now()}`,
      lineItems,
      subtotalInPaise,
      discountInPaise,
      appliedBundles,
      finalTotalInPaise,
      currency: 'INR',
      maxDeliveryDays,
      allSkusFound,
      resolvedAt: new Date().toISOString(),
    };
  }
}
