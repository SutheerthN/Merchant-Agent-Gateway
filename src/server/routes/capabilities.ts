import { Router, Request, Response, NextFunction } from 'express';
import { CapabilityService } from '../capabilities/service.js';
import {
  DiscoverProductsSchema,
  GetProductSchema,
  VerifyInventorySchema,
  CheckPriceSchema,
  BuildBundleSchema,
} from '../capabilities/schemas.js';

export const capabilitiesRouter = Router();

// GET /api/capabilities/manifest
capabilitiesRouter.get('/manifest', (_req: Request, res: Response) => {
  const manifest = CapabilityService.getManifest();
  res.json({
    status: 'success',
    data: manifest,
  });
});

// POST /api/capabilities/discover_products
capabilitiesRouter.post('/discover_products', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = DiscoverProductsSchema.parse(req.body);
    const result = CapabilityService.discoverProducts(validated);
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/capabilities/get_product
capabilitiesRouter.post('/get_product', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = GetProductSchema.parse(req.body);
    const result = CapabilityService.getProduct(validated);
    if (!result.found) {
      res.status(404).json({
        status: 'error',
        message: `Product with SKU ${validated.sku} not found`,
      });
      return;
    }
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/capabilities/verify_inventory
capabilitiesRouter.post('/verify_inventory', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = VerifyInventorySchema.parse(req.body);
    const result = CapabilityService.verifyInventory(validated);
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/capabilities/check_price
capabilitiesRouter.post('/check_price', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = CheckPriceSchema.parse(req.body);
    const result = CapabilityService.checkPrice(validated);
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/capabilities/build_bundle
capabilitiesRouter.post('/build_bundle', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = BuildBundleSchema.parse(req.body);
    const result = CapabilityService.buildBundle(validated);
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});
