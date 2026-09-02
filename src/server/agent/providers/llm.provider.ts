import { CommerceLLMProvider, LLMMessage, AgentToolDefinition, LLMResponse, AgentToolCall } from '../types.js';
import { DemoScriptedLLMProvider } from './demo.provider.js';

export class OpenAICompatibleProvider implements CommerceLLMProvider {
  public readonly name: string;
  public readonly isDemoFallback = false;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    this.model = model || 'gpt-4o-mini';
    this.name = `OpenAI Compatible (${this.model})`;
  }

  public async generateResponse(
    messages: LLMMessage[],
    tools: AgentToolDefinition[]
  ): Promise<LLMResponse> {
    const formattedTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: formattedTools,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM Provider API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      throw new Error('No completion choice returned from LLM provider.');
    }

    const toolCalls: AgentToolCall[] = [];
    if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
      for (const tc of choice.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    return {
      message: choice.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

export class LLMProviderFactory {
  /**
   * Retrieves the configured LLM provider or defaults to DemoScriptedLLMProvider.
   * Safe and robust: Never throws on missing keys.
   */
  public static getProvider(): CommerceLLMProvider {
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;

    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('placeholder')) {
      return new OpenAICompatibleProvider(apiKey.trim(), baseUrl, model);
    }

    return new DemoScriptedLLMProvider();
  }
}
