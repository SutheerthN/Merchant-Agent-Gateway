import { z } from 'zod';

export const DiscoverProductsSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  maxPriceInPaise: z.number().positive().optional(),
  maxDeliveryDays: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  inStockOnly: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export type DiscoverProductsInput = z.infer<typeof DiscoverProductsSchema>;

export const GetProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
});

export type GetProductInput = z.infer<typeof GetProductSchema>;

export const VerifyInventorySchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().min(1, 'SKU is required'),
      quantity: z.number().int().positive('Quantity must be positive'),
    })
  ).min(1, 'At least one item is required'),
});

export type VerifyInventoryInput = z.infer<typeof VerifyInventorySchema>;

export const CheckPriceSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().min(1, 'SKU is required'),
      quantity: z.number().int().positive('Quantity must be positive'),
    })
  ).min(1, 'At least one item is required'),
  applyEligibleBundles: z.boolean().optional().default(true),
});

export type CheckPriceInput = z.infer<typeof CheckPriceSchema>;

export const BuildBundleSchema = z.object({
  skus: z.array(z.string().min(1)).min(1, 'At least one SKU is required'),
});

export type BuildBundleInput = z.infer<typeof BuildBundleSchema>;

export const ValidatePolicySchema = z.object({
  merchantId: z.string().optional().default('merchant_aero_gear_in'),
  sessionId: z.string().optional(),
  items: z.array(
    z.object({
      sku: z.string().min(1, 'SKU is required'),
      quantity: z.number().int().positive('Quantity must be a positive integer'),
      claimedPriceInPaise: z.number().optional(),
      claimedTotalInPaise: z.number().optional(),
    })
  ).min(1, 'At least one item is required in proposal'),
  bundleId: z.string().optional(),
  applyEligibleBundles: z.boolean().optional().default(true),
  userAuth: z
    .object({
      maxSpendInPaise: z.number().positive().optional(),
      allowedCurrencies: z.array(z.string()).optional(),
      allowedCategories: z.array(z.string()).optional(),
      maxDeliveryDays: z.number().int().positive().optional(),
      requireInStock: z.boolean().optional(),
      maxQuantityPerSku: z.number().int().positive().optional(),
      requireExplicitApproval: z.boolean().optional(),
      hasUserApproval: z.boolean().optional(),
    })
    .optional(),
});

export type ValidatePolicyInput = z.infer<typeof ValidatePolicySchema>;

