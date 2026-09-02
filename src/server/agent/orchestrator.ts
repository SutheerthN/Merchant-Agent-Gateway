import crypto from 'crypto';
import {
  CommerceLLMProvider,
  LLMMessage,
  AgentEvent,
  AgentExecutionResult,
  StructuredPurchaseProposal,
  AgentChatInput,
} from './types.js';
import { COMMERCE_AGENT_SYSTEM_PROMPT } from './prompts.js';
import { AGENT_TOOL_DEFINITIONS, AgentToolExecutor } from './tools.js';
import { LLMProviderFactory } from './providers/llm.provider.js';
import { DeterministicPolicyEngine } from '../policy/engine.js';
import { PurchaseProposal } from '../types/policy.js';

export const MAX_AGENT_STEPS = 10;

export class CommerceAgentOrchestrator {
  private provider: CommerceLLMProvider;

  constructor(provider?: CommerceLLMProvider) {
    this.provider = provider || LLMProviderFactory.getProvider();
  }

  /**
   * Executes the autonomous AI Buyer orchestration loop.
   *
   * SECURITY GUARANTEES:
   * 1. The agent loop is bounded by MAX_AGENT_STEPS.
   * 2. No payment tools exist; the agent's terminal action is create_purchase_proposal.
   * 3. Financial authorization is 100% delegated to the Deterministic Policy Engine.
   * 4. No chain-of-thought is exposed; only safe operational events are emitted.
   */
  public async run(
    input: AgentChatInput,
    onEvent?: (event: AgentEvent) => void
  ): Promise<AgentExecutionResult> {
    const sessionId = input.sessionId || `sess_agent_${Date.now()}`;
    const events: AgentEvent[] = [];

    const emitEvent = (type: AgentEvent['type'], message: string, data?: unknown) => {
      const event: AgentEvent = {
        id: `evt_${crypto.randomUUID()}`,
        type,
        timestamp: new Date().toISOString(),
        message,
        data,
      };
      events.push(event);
      if (onEvent) {
        onEvent(event);
      }
    };

    emitEvent(
      'AGENT_STARTED',
      `AI Buyer session initialized (${this.provider.name}). Analyzing user request: "${input.message}"`
    );

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: COMMERCE_AGENT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: input.message,
      },
    ];

    let stepsTaken = 0;
    let createdProposal: StructuredPurchaseProposal | undefined;
    let finalAssistantMessage = '';

    while (stepsTaken < MAX_AGENT_STEPS) {
      stepsTaken++;

      emitEvent(
        'AGENT_THINKING',
        `Step ${stepsTaken}/${MAX_AGENT_STEPS}: Reasoned next commerce action...`
      );

      let response;
      try {
        response = await this.provider.generateResponse(
          messages,
          AGENT_TOOL_DEFINITIONS
        );
      } catch (err: any) {
        emitEvent('AGENT_ERROR', `LLM provider encountered an error: ${err.message}`);
        return {
          sessionId,
          userMessage: input.message,
          finalMessage: `Encountered an error while communicating with commerce reasoning model: ${err.message}`,
          events,
          toolCallsExecuted: stepsTaken - 1,
          completed: false,
          error: err.message,
        };
      }

      if (response.message) {
        finalAssistantMessage = response.message;
      }

      // If no tool calls, model produced final message
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // Record assistant tool calls in conversation history
      messages.push({
        role: 'assistant',
        content: response.message || '',
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });

      // Execute each tool call strictly through AgentToolExecutor
      for (const toolCall of response.toolCalls) {
        emitEvent(
          'TOOL_CALL',
          `Calling capability: ${toolCall.name}`,
          { tool: toolCall.name, arguments: toolCall.arguments }
        );

        const execution = await AgentToolExecutor.executeTool(toolCall);

        if (execution.proposalCreated) {
          createdProposal = execution.proposalCreated;
          emitEvent(
            'PROPOSAL_CREATED',
            `Purchase proposal formulated for SKU(s): ${createdProposal.items.map((i) => `${i.sku} (x${i.quantity})`).join(', ')}`,
            { proposal: createdProposal }
          );
        }

        emitEvent(
          'TOOL_RESULT',
          `Capability ${toolCall.name} returned structured result.`,
          {
            tool: toolCall.name,
            hasError: Boolean(execution.result.error),
          }
        );

        // Append tool result into context
        messages.push({
          role: 'tool',
          name: toolCall.name,
          tool_call_id: toolCall.id,
          content: JSON.stringify(execution.result),
        });
      }

      // If a purchase proposal was created, exit tool loop to proceed with policy handoff
      if (createdProposal) {
        break;
      }
    }

    // Step limit exceeded safety guard
    if (stepsTaken >= MAX_AGENT_STEPS && !createdProposal) {
      emitEvent(
        'AGENT_ERROR',
        `Agent loop reached maximum execution steps (${MAX_AGENT_STEPS}). Execution halted.`
      );
    }

    // POLICY HANDOFF: Run Deterministic Policy Engine if a proposal was created
    let policyDecision;
    if (createdProposal) {
      emitEvent(
        'POLICY_VALIDATING',
        'Handing off purchase proposal to Deterministic Policy Engine (Zero LLM)...'
      );

      const serverProposal: PurchaseProposal = {
        merchantId: 'merchant_aero_gear_in',
        sessionId,
        items: createdProposal.items,
        bundleId: createdProposal.bundleId,
        applyEligibleBundles: true,
      };

      policyDecision = DeterministicPolicyEngine.evaluate(serverProposal, input.userAuth);

      emitEvent(
        'POLICY_RESULT',
        policyDecision.status === 'ALLOW'
          ? `Policy Engine APPROVED transaction (₹${(policyDecision.trustedTransaction.finalTotalInPaise / 100).toLocaleString('en-IN')}). Ready for Razorpay Test Mode checkout.`
          : `Policy Engine BLOCKED transaction: ${policyDecision.violationReasons.join(' | ')}. Zero money movement executed.`,
        {
          decision: policyDecision.status,
          decisionId: policyDecision.decisionId,
          auditEventId: policyDecision.auditEventId,
          totalInPaise: policyDecision.trustedTransaction.finalTotalInPaise,
        }
      );
    }

    emitEvent('AGENT_COMPLETED', 'AI Buyer reasoning workflow completed.');

    return {
      sessionId,
      userMessage: input.message,
      finalMessage:
        finalAssistantMessage ||
        (policyDecision
          ? policyDecision.status === 'ALLOW'
            ? 'I have discovered the matching product, verified inventory, and obtained deterministic policy authorization. The purchase is ready for Razorpay Test Checkout.'
            : `I attempted to formulate the purchase proposal, but it was intercepted by the Deterministic Policy Engine: ${policyDecision.violationReasons.join('; ')}`
          : 'I inspected the catalog, but could not formulate a valid purchase proposal matching all constraints.'),
      proposal: createdProposal,
      policyDecision,
      events,
      toolCallsExecuted: stepsTaken,
      completed: true,
    };
  }
}
