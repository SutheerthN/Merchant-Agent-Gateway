import { AgentToolDefinition, AgentToolCall, AgentToolResult, StructuredPurchaseProposal } from './types.js';
import { CapabilityService } from '../capabilities/service.js';
import {
  DiscoverProductsSchema,
  GetProductSchema,
  VerifyInventorySchema,
  CheckPriceSchema,
  BuildBundleSchema,
} from '../capabilities/schemas.js';
import { z } from 'zod';

export const CreatePurchaseProposalSchema = z.object({
  intent: z.literal('PURCHASE').default('PURCHASE'),
  items: z.array(
    z.object({
      sku: z.string().min(1, 'SKU is required'),
      quantity: z.number().int().positive('Quantity must be a positive integer'),
    })
  ).min(1, 'At least one item required in proposal'),
  bundleId: z.string().optional(),
  reason: z.string().min(1, 'Reason for proposal is required'),
});

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: 'discover_products',
    description: 'Search and filter the merchant catalog by query, category, maximum price in paise, delivery days, and tags.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., waterproof backpack)' },
        category: { type: 'string', description: 'Product category' },
        maxPriceInPaise: { type: 'number', description: 'Maximum price in paise (e.g., 300000 for ₹3,000)' },
        maxDeliveryDays: { type: 'number', description: 'Maximum delivery ETA in days (e.g., 3)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to match' },
        limit: { type: 'number', description: 'Max results to return' },
      },
    },
  },
  {
    name: 'get_product',
    description: 'Get detailed product specifications, category, delivery ETA, price, and current stock for a specific SKU.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'The exact SKU code (e.g. SKU-BP-001)' },
      },
      required: ['sku'],
    },
  },
  {
    name: 'verify_inventory',
    description: 'Verify if requested items are in stock and within maximum allowable order limits.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['sku', 'quantity'],
          },
          description: 'Items to verify in stock',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'check_price',
    description: 'Calculate authoritative line-item prices, applied bundle discounts, and final total in paise.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['sku', 'quantity'],
          },
        },
        applyEligibleBundles: { type: 'boolean', description: 'Whether to compute promotional bundle discounts' },
      },
      required: ['items'],
    },
  },
  {
    name: 'build_bundle',
    description: 'Find active discount bundles and potential savings for a set of product SKUs.',
    parameters: {
      type: 'object',
      properties: {
        skus: { type: 'array', items: { type: 'string' }, description: 'List of SKUs' },
      },
      required: ['skus'],
    },
  },
  {
    name: 'create_purchase_proposal',
    description: 'Terminal agent action: Formulate and submit a structured purchase proposal for deterministic policy validation.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['sku', 'quantity'],
          },
          description: 'Proposed items and quantities',
        },
        bundleId: { type: 'string', description: 'Optional promotional bundle ID' },
        reason: { type: 'string', description: 'Explanation of why these items were selected' },
      },
      required: ['items', 'reason'],
    },
  },
];

export class AgentToolExecutor {
  /**
   * Executes a tool call from the agent.
   * STRICT VALIDATION: Rejects unknown tools and malformed parameters.
   */
  public static async executeTool(
    toolCall: AgentToolCall
  ): Promise<{ result: AgentToolResult; proposalCreated?: StructuredPurchaseProposal }> {
    const { id, name, arguments: args } = toolCall;

    try {
      switch (name) {
        case 'discover_products': {
          const validated = DiscoverProductsSchema.parse(args);
          const data = CapabilityService.discoverProducts(validated);
          return {
            result: { toolCallId: id, name, result: data },
          };
        }

        case 'get_product': {
          const validated = GetProductSchema.parse(args);
          const data = CapabilityService.getProduct(validated);
          return {
            result: { toolCallId: id, name, result: data },
          };
        }

        case 'verify_inventory': {
          const validated = VerifyInventorySchema.parse(args);
          const data = CapabilityService.verifyInventory(validated);
          return {
            result: { toolCallId: id, name, result: data },
          };
        }

        case 'check_price': {
          const validated = CheckPriceSchema.parse(args);
          const data = CapabilityService.checkPrice(validated);
          return {
            result: { toolCallId: id, name, result: data },
          };
        }

        case 'build_bundle': {
          const validated = BuildBundleSchema.parse(args);
          const data = CapabilityService.buildBundle(validated);
          return {
            result: { toolCallId: id, name, result: data },
          };
        }

        case 'create_purchase_proposal': {
          const validated = CreatePurchaseProposalSchema.parse(args);
          const proposal: StructuredPurchaseProposal = {
            intent: 'PURCHASE',
            items: validated.items,
            bundleId: validated.bundleId,
            reason: validated.reason,
          };
          return {
            result: {
              toolCallId: id,
              name,
              result: {
                status: 'PROPOSAL_SUBMITTED_FOR_POLICY_EVALUATION',
                proposal,
              },
            },
            proposalCreated: proposal,
          };
        }

        default: {
          return {
            result: {
              toolCallId: id,
              name,
              result: null,
              error: `Unknown tool "${name}". Available tools: ${AGENT_TOOL_DEFINITIONS.map((t) => t.name).join(', ')}. No payment tools exist.`,
            },
          };
        }
      }
    } catch (err: any) {
      return {
        result: {
          toolCallId: id,
          name,
          result: null,
          error: `Invalid tool arguments: ${err.message}`,
        },
      };
    }
  }
}
