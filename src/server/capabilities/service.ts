import {
  MERCHANT_CATALOG,
  MERCHANT_BUNDLE_RULES,
  Product,
  BundleRule,
} from '../catalog/products.js';
import {
  DiscoverProductsInput,
  GetProductInput,
  VerifyInventoryInput,
  CheckPriceInput,
  BuildBundleInput,
} from './schemas.js';

export interface CapabilityManifest {
  gatewayVersion: string;
  merchantId: string;
  merchantName: string;
  capabilities: Array<{
    name: string;
    description: string;
    endpoint: string;
    httpMethod: 'GET' | 'POST';
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }>;
}

export class CapabilityService {
  public static getManifest(): CapabilityManifest {
    return {
      gatewayVersion: '0.1.0',
      merchantId: 'merchant_aero_gear_in',
      merchantName: 'AeroGear Official Store',
      capabilities: [
        {
          name: 'DISCOVER_PRODUCTS',
          description: 'Search and filter merchant catalog by query, category, maximum price in paise, delivery ETA, and tags.',
          endpoint: '/api/capabilities/discover_products',
          httpMethod: 'POST',
          inputSchema: {
            query: 'string (optional)',
            category: 'string (optional)',
            maxPriceInPaise: 'number (optional)',
            maxDeliveryDays: 'number (optional)',
            tags: 'string[] (optional)',
            inStockOnly: 'boolean (default: true)',
            limit: 'number (default: 10)',
          },
          outputSchema: {
            products: 'Product[]',
            totalMatched: 'number',
          },
        },
        {
          name: 'GET_PRODUCT',
          description: 'Retrieve detailed product specifications and current availability for a specific SKU.',
          endpoint: '/api/capabilities/get_product',
          httpMethod: 'POST',
          inputSchema: {
            sku: 'string (required)',
          },
          outputSchema: {
            product: 'Product | null',
            found: 'boolean',
          },
        },
        {
          name: 'VERIFY_INVENTORY',
          description: 'Verify if requested SKUs and quantities are currently in stock and within max order limits.',
          endpoint: '/api/capabilities/verify_inventory',
          httpMethod: 'POST',
          inputSchema: {
            items: 'Array<{ sku: string, quantity: number }> (required)',
          },
          outputSchema: {
            allAvailable: 'boolean',
            items: 'Array<{ sku: string, requested: number, available: number, inStock: boolean, maxAllowed: number }>',
          },
        },
        {
          name: 'CHECK_PRICE',
          description: 'Calculate itemized price, applied bundle discounts, taxes, and final total in paise.',
          endpoint: '/api/capabilities/check_price',
          httpMethod: 'POST',
          inputSchema: {
            items: 'Array<{ sku: string, quantity: number }> (required)',
            applyEligibleBundles: 'boolean (default: true)',
          },
          outputSchema: {
            currency: 'string',
            subtotalInPaise: 'number',
            discountInPaise: 'number',
            appliedBundles: 'BundleRule[]',
            totalInPaise: 'number',
            lineItems: 'Array<{ sku: string, name: string, quantity: number, unitPriceInPaise: number, lineTotalInPaise: number }>',
          },
        },
        {
          name: 'BUILD_BUNDLE',
          description: 'Find active discount bundles and optimal combinations for a given list of SKUs.',
          endpoint: '/api/capabilities/build_bundle',
          httpMethod: 'POST',
          inputSchema: {
            skus: 'string[] (required)',
          },
          outputSchema: {
            eligibleBundles: 'BundleRule[]',
            potentialSavingsInPaise: 'number',
          },
        },
      ],
    };
  }

  public static discoverProducts(input: DiscoverProductsInput): { products: Product[]; totalMatched: number } {
    let results = [...MERCHANT_CATALOG];

    if (input.inStockOnly) {
      results = results.filter((p) => p.stock > 0);
    }

    if (input.maxPriceInPaise !== undefined) {
      results = results.filter((p) => p.priceInPaise <= input.maxPriceInPaise!);
    }

    if (input.maxDeliveryDays !== undefined) {
      results = results.filter((p) => p.deliveryEtaDays <= input.maxDeliveryDays!);
    }

    if (input.category) {
      const catLower = input.category.toLowerCase();
      results = results.filter((p) => p.category.toLowerCase().includes(catLower));
    }

    if (input.tags && input.tags.length > 0) {
      const searchTags = input.tags.map((t) => t.toLowerCase());
      results = results.filter((p) =>
        searchTags.some((tag) => p.tags.some((pTag) => pTag.toLowerCase().includes(tag)))
      );
    }

    if (input.query) {
      const q = input.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.sku.toLowerCase().includes(q)
      );
    }

    const limited = results.slice(0, input.limit || 10);
    return {
      products: limited,
      totalMatched: results.length,
    };
  }

  public static getProduct(input: GetProductInput): { product: Product | null; found: boolean } {
    const product = MERCHANT_CATALOG.find((p) => p.sku.toUpperCase() === input.sku.toUpperCase());
    return {
      product: product || null,
      found: Boolean(product),
    };
  }

  public static verifyInventory(input: VerifyInventoryInput) {
    const itemStatuses = input.items.map((item) => {
      const product = MERCHANT_CATALOG.find((p) => p.sku.toUpperCase() === item.sku.toUpperCase());
      if (!product) {
        return {
          sku: item.sku,
          requested: item.quantity,
          available: 0,
          inStock: false,
          maxAllowed: 0,
          error: 'SKU not found in catalog',
        };
      }

      const inStock = product.stock >= item.quantity && item.quantity <= product.maxQuantity;
      return {
        sku: item.sku,
        requested: item.quantity,
        available: product.stock,
        inStock,
        maxAllowed: product.maxQuantity,
        error: !inStock
          ? product.stock < item.quantity
            ? 'Insufficient stock'
            : 'Exceeds maximum allowed quantity per order'
          : undefined,
      };
    });

    const allAvailable = itemStatuses.every((status) => status.inStock);

    return {
      allAvailable,
      items: itemStatuses,
    };
  }

  public static checkPrice(input: CheckPriceInput) {
    let subtotalInPaise = 0;
    const lineItems: Array<{
      sku: string;
      name: string;
      quantity: number;
      unitPriceInPaise: number;
      lineTotalInPaise: number;
    }> = [];

    const presentSkus: string[] = [];

    for (const item of input.items) {
      const product = MERCHANT_CATALOG.find((p) => p.sku.toUpperCase() === item.sku.toUpperCase());
      if (!product) {
        throw new Error(`Product not found for SKU: ${item.sku}`);
      }

      const lineTotal = product.priceInPaise * item.quantity;
      subtotalInPaise += lineTotal;
      lineItems.push({
        sku: product.sku,
        name: product.name,
        quantity: item.quantity,
        unitPriceInPaise: product.priceInPaise,
        lineTotalInPaise: lineTotal,
      });

      for (let i = 0; i < item.quantity; i++) {
        presentSkus.push(product.sku);
      }
    }

    const appliedBundles: BundleRule[] = [];
    let discountInPaise = 0;

    if (input.applyEligibleBundles) {
      for (const rule of MERCHANT_BUNDLE_RULES) {
        const canApply = rule.requiredSkus.every((reqSku) =>
          presentSkus.includes(reqSku)
        );
        if (canApply) {
          appliedBundles.push(rule);
          discountInPaise += rule.discountInPaise;
        }
      }
    }

    const totalInPaise = Math.max(0, subtotalInPaise - discountInPaise);

    return {
      currency: 'INR',
      subtotalInPaise,
      discountInPaise,
      appliedBundles,
      totalInPaise,
      lineItems,
    };
  }

  public static buildBundle(input: BuildBundleInput) {
    const inputUpperSkus = input.skus.map((s) => s.toUpperCase());
    const eligibleBundles = MERCHANT_BUNDLE_RULES.filter((rule) =>
      rule.requiredSkus.every((reqSku) => inputUpperSkus.includes(reqSku.toUpperCase()))
    );

    const potentialSavingsInPaise = eligibleBundles.reduce((sum, b) => sum + b.discountInPaise, 0);

    return {
      eligibleBundles,
      potentialSavingsInPaise,
    };
  }
}
