import { UserAuthorizationPolicy, PolicyDecision } from '../types/policy.js';

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface PurchaseProposalItem {
  sku: string;
  quantity: number;
}

export interface StructuredPurchaseProposal {
  intent: 'PURCHASE';
  items: PurchaseProposalItem[];
  bundleId?: string;
  reason: string;
}

export type AgentEventType =
  | 'AGENT_STARTED'
  | 'AGENT_THINKING'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'PROPOSAL_CREATED'
  | 'POLICY_VALIDATING'
  | 'POLICY_RESULT'
  | 'AGENT_COMPLETED'
  | 'AGENT_ERROR';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: string;
  message: string;
  data?: unknown;
}

export interface AgentExecutionResult {
  sessionId: string;
  userMessage: string;
  finalMessage: string;
  proposal?: StructuredPurchaseProposal;
  policyDecision?: PolicyDecision;
  events: AgentEvent[];
  toolCallsExecuted: number;
  completed: boolean;
  error?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LLMResponse {
  message: string;
  toolCalls?: AgentToolCall[];
}

export interface CommerceLLMProvider {
  name: string;
  isDemoFallback: boolean;
  generateResponse(
    messages: LLMMessage[],
    tools: AgentToolDefinition[]
  ): Promise<LLMResponse>;
}

export interface AgentChatInput {
  message: string;
  sessionId?: string;
  userAuth?: Partial<UserAuthorizationPolicy>;
}
