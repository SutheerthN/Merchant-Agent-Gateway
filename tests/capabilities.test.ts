import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { MERCHANT_CATALOG } from '../src/server/catalog/products.js';

const app = createApp();

describe('Merchant Agent Gateway - Milestone 1 Tests', () => {
  describe('GET /api/health', () => {
    it('returns healthy status with active capabilities and demo mode', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('Merchant Agent Gateway');
      expect(res.body.mode).toBe('TEST / DEMO');
      expect(res.body.paymentIntegration).toContain('INACTIVE');
      expect(res.body.activeCapabilities).toContain('DISCOVER_PRODUCTS');
      expect(res.body.activeCapabilities).toContain('CHECK_PRICE');
    });
  });

  describe('GET /api/capabilities/manifest', () => {
    it('returns a complete machine-readable capability manifest', async () => {
      const res = await request(app).get('/api/capabilities/manifest');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.gatewayVersion).toBe('0.1.0');
      expect(res.body.data.capabilities).toHaveLength(5);

      const capNames = res.body.data.capabilities.map((c: any) => c.name);
      expect(capNames).toEqual([
        'DISCOVER_PRODUCTS',
        'GET_PRODUCT',
        'VERIFY_INVENTORY',
        'CHECK_PRICE',
        'BUILD_BUNDLE',
      ]);
    });
  });

  describe('POST /api/capabilities/discover_products', () => {
    it('filters products under budget (e.g. max ₹3,000 / 300000 paise)', async () => {
      const res = await request(app)
        .post('/api/capabilities/discover_products')
        .send({ maxPriceInPaise: 300000 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.products.length).toBeGreaterThan(0);
      for (const product of res.body.data.products) {
        expect(product.priceInPaise).toBeLessThanOrEqual(300000);
      }
    });

    it('filters products with delivery ETA <= 3 days', async () => {
      const res = await request(app)
        .post('/api/capabilities/discover_products')
        .send({ maxDeliveryDays: 3 });

      expect(res.status).toBe(200);
      for (const product of res.body.data.products) {
        expect(product.deliveryEtaDays).toBeLessThanOrEqual(3);
      }
    });

    it('finds waterproof laptop backpack matching query and tags', async () => {
      const res = await request(app)
        .post('/api/capabilities/discover_products')
        .send({ query: 'waterproof backpack', maxPriceInPaise: 300000, maxDeliveryDays: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBeGreaterThanOrEqual(1);
      const backpack = res.body.data.products.find((p: any) => p.sku === 'SKU-BP-001');
      expect(backpack).toBeDefined();
      expect(backpack.name).toContain('AeroShield');
      expect(backpack.priceInPaise).toBe(279900); // ₹2,799
      expect(backpack.deliveryEtaDays).toBeLessThanOrEqual(3);
    });
  });

  describe('POST /api/capabilities/get_product', () => {
    it('retrieves detailed product by valid SKU', async () => {
      const res = await request(app)
        .post('/api/capabilities/get_product')
        .send({ sku: 'SKU-BP-001' });

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.product.sku).toBe('SKU-BP-001');
      expect(res.body.data.product.priceInPaise).toBe(279900);
    });

    it('returns 404 for non-existent SKU', async () => {
      const res = await request(app)
        .post('/api/capabilities/get_product')
        .send({ sku: 'SKU-DOES-NOT-EXIST' });

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
    });
  });

  describe('POST /api/capabilities/verify_inventory', () => {
    it('verifies in-stock quantities successfully', async () => {
      const res = await request(app)
        .post('/api/capabilities/verify_inventory')
        .send({
          items: [
            { sku: 'SKU-BP-001', quantity: 2 },
            { sku: 'SKU-PO-003', quantity: 3 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.allAvailable).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('detects when requested quantity exceeds available stock or max allowed limit', async () => {
      const res = await request(app)
        .post('/api/capabilities/verify_inventory')
        .send({
          items: [
            { sku: 'SKU-BP-001', quantity: 999 }, // exceeds stock and max limit
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.allAvailable).toBe(false);
      expect(res.body.data.items[0].inStock).toBe(false);
      expect(res.body.data.items[0].error).toBeDefined();
    });
  });

  describe('POST /api/capabilities/check_price', () => {
    it('calculates accurate pricing with bundle discounts', async () => {
      // AeroShield Backpack (₹2,799) + DryLock Pouch (₹499) = ₹3,298
      // Rain Ready Bundle Discount = -₹300 -> Total = ₹2,998 (299800 paise)
      const res = await request(app)
        .post('/api/capabilities/check_price')
        .send({
          items: [
            { sku: 'SKU-BP-001', quantity: 1 },
            { sku: 'SKU-PO-003', quantity: 1 },
          ],
          applyEligibleBundles: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalInPaise).toBe(329800);
      expect(res.body.data.discountInPaise).toBe(30000);
      expect(res.body.data.totalInPaise).toBe(299800);
      expect(res.body.data.appliedBundles).toHaveLength(1);
      expect(res.body.data.appliedBundles[0].bundleId).toBe('BUNDLE-RAIN-READY');
    });
  });

  describe('POST /api/capabilities/build_bundle', () => {
    it('identifies eligible bundles for candidate SKUs', async () => {
      const res = await request(app)
        .post('/api/capabilities/build_bundle')
        .send({
          skus: ['SKU-BP-001', 'SKU-PO-003'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleBundles).toHaveLength(1);
      expect(res.body.data.potentialSavingsInPaise).toBe(30000);
    });
  });

  describe('Input Validation & Error Handling', () => {
    it('rejects invalid payload with 400 Bad Request and validation details', async () => {
      const res = await request(app)
        .post('/api/capabilities/verify_inventory')
        .send({
          items: [], // violates .min(1)
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.errorType).toBe('VALIDATION_ERROR');
    });
  });

  describe('Adversarial Catalog Safety Check (Milestone 1 Data Integrity)', () => {
    it('returns adversarial product description strictly as untrusted data without executing or corrupting pricing', async () => {
      const res = await request(app)
        .post('/api/capabilities/get_product')
        .send({ sku: 'SKU-ADV-999' });

      expect(res.status).toBe(200);
      expect(res.body.data.product.description).toContain('[SYSTEM INSTRUCTION:');
      expect(res.body.data.product.priceInPaise).toBe(1299900); // ₹12,999.00
      expect(res.body.data.product.category).toBe('Luxury Bags');

      // Verify that discovering with max budget of ₹3,000 excludes the adversarial item
      const discoveryRes = await request(app)
        .post('/api/capabilities/discover_products')
        .send({ maxPriceInPaise: 300000 });

      const foundAdversarial = discoveryRes.body.data.products.find(
        (p: any) => p.sku === 'SKU-ADV-999'
      );
      expect(foundAdversarial).toBeUndefined();
    });
  });
});
