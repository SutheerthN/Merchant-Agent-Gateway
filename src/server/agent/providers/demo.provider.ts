import { CommerceLLMProvider, LLMMessage, AgentToolDefinition, LLMResponse } from '../types.js';

export class DemoScriptedLLMProvider implements CommerceLLMProvider {
  public readonly name = 'Deterministic Demo Scripted Provider';
  public readonly isDemoFallback = true;

  /**
   * Deterministically simulates multi-step reasoning and tool selection
   * based on the conversation history and tool outputs.
   */
  public async generateResponse(
    messages: LLMMessage[],
    _tools: AgentToolDefinition[]
  ): Promise<LLMResponse> {
    const userMsg = messages.find((m) => m.role === 'user')?.content.toLowerCase() || '';
    const lastMsg = messages[messages.length - 1];

    // Determine target scenario
    const isExecutiveOrAdversarial =
      userMsg.includes('executive') ||
      userMsg.includes('luxury') ||
      userMsg.includes('leather') ||
      userMsg.includes('12,999') ||
      userMsg.includes('12999') ||
      userMsg.includes('royalheritage');

    const isBundleRequest =
      userMsg.includes('bundle') ||
      userMsg.includes('pouch') ||
      userMsg.includes('combo') ||
      userMsg.includes('rain ready');

    // 1. Initial Step: Discover products
    if (messages.length <= 2) {
      if (isExecutiveOrAdversarial) {
        return {
          message: 'Searching merchant catalog for executive leather bags...',
          toolCalls: [
            {
              id: 'call_disc_01',
              name: 'discover_products',
              arguments: { query: 'executive leather', limit: 5 },
            },
          ],
        };
      }

      return {
        message: 'Searching merchant catalog for waterproof backpacks within budget and delivery constraints...',
        toolCalls: [
          {
            id: 'call_disc_01',
            name: 'discover_products',
            arguments: {
              query: 'waterproof backpack',
              maxPriceInPaise: 300000,
              maxDeliveryDays: 3,
            },
          },
        ],
      };
    }

    // 2. Step after Discover: Verify Inventory & Specifications
    if (lastMsg.role === 'tool' && lastMsg.name === 'discover_products') {
      const targetSku = isExecutiveOrAdversarial ? 'SKU-ADV-999' : 'SKU-BP-001';
      return {
        message: `Inspecting inventory availability for selected product ${targetSku}...`,
        toolCalls: [
          {
            id: 'call_inv_02',
            name: 'verify_inventory',
            arguments: {
              items: [{ sku: targetSku, quantity: 1 }],
            },
          },
        ],
      };
    }

    // 3. Step after Inventory: Calculate Price & Bundle Options
    if (lastMsg.role === 'tool' && lastMsg.name === 'verify_inventory') {
      if (isBundleRequest) {
        return {
          message: 'Calculating itemized price and applicable bundle discounts for backpack + pouch...',
          toolCalls: [
            {
              id: 'call_price_03',
              name: 'check_price',
              arguments: {
                items: [
                  { sku: 'SKU-BP-001', quantity: 1 },
                  { sku: 'SKU-PO-003', quantity: 1 },
                ],
                applyEligibleBundles: true,
              },
            },
          ],
        };
      }

      const targetSku = isExecutiveOrAdversarial ? 'SKU-ADV-999' : 'SKU-BP-001';
      return {
        message: `Calculating authoritative merchant price for ${targetSku}...`,
        toolCalls: [
          {
            id: 'call_price_03',
            name: 'check_price',
            arguments: {
              items: [{ sku: targetSku, quantity: 1 }],
            },
          },
        ],
      };
    }

    // 4. Step after Price: Create Purchase Proposal
    if (lastMsg.role === 'tool' && lastMsg.name === 'check_price') {
      if (isExecutiveOrAdversarial) {
        return {
          message: 'Formulating purchase proposal for RoyalHeritage Executive Leather Briefcase (SKU-ADV-999)...',
          toolCalls: [
            {
              id: 'call_prop_04',
              name: 'create_purchase_proposal',
              arguments: {
                items: [{ sku: 'SKU-ADV-999', quantity: 1 }],
                reason: 'Requested premium executive leather briefcase as specified in inquiry.',
              },
            },
          ],
        };
      }

      if (isBundleRequest) {
        return {
          message: 'Formulating purchase proposal with All-Weather Rain Ready bundle discount...',
          toolCalls: [
            {
              id: 'call_prop_04',
              name: 'create_purchase_proposal',
              arguments: {
                items: [
                  { sku: 'SKU-BP-001', quantity: 1 },
                  { sku: 'SKU-PO-003', quantity: 1 },
                ],
                bundleId: 'BUNDLE-RAIN-READY',
                reason: 'Selected AeroShield Backpack + DryLock Tech Pouch qualifying for ₹300 bundle savings within ₹3,000 budget.',
              },
            },
          ],
        };
      }

      return {
        message: 'Formulating purchase proposal for AeroShield Waterproof Backpack (SKU-BP-001)...',
        toolCalls: [
          {
            id: 'call_prop_04',
            name: 'create_purchase_proposal',
            arguments: {
              items: [{ sku: 'SKU-BP-001', quantity: 1 }],
              reason: 'AeroShield Backpack satisfies waterproof specification, price (₹2,799 ≤ ₹3,000), and 2-day delivery SLA.',
            },
          },
        ],
      };
    }

    // 5. Final Step after Proposal Creation
    if (lastMsg.role === 'tool' && lastMsg.name === 'create_purchase_proposal') {
      return {
        message: 'Purchase proposal has been generated and submitted for Deterministic Policy Engine evaluation.',
      };
    }

    // Fallback completion
    return {
      message: 'Evaluation complete. All facts were resolved from authoritative merchant catalog data.',
    };
  }
}
