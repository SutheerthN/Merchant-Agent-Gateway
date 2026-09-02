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
