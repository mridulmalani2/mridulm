/** OpenAI-compatible adapter — works for OpenAI, Mistral, and Groq. */

import type { ProviderConfig } from '../providers';
import type { NormalizedToolCall } from './anthropic';

/** Convert our Anthropic-style tool def to OpenAI function calling format. */
function toOpenAITool(toolDef: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: toolDef.name as string,
      description: toolDef.description as string,
      parameters: toolDef.input_schema,
    },
  };
}

export function buildOpenAIRequest(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  toolDef: Record<string, unknown>,
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const openAIMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  return {
    url: config.apiUrl,
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: config.model,
      max_tokens: 4096,
      messages: openAIMessages,
      tools: [toOpenAITool(toolDef)],
      tool_choice: 'auto',
    },
  };
}

export function parseOpenAIResponse(data: Record<string, unknown>): NormalizedToolCall | null {
  const choices = (data.choices || []) as Array<Record<string, unknown>>;
  if (!choices.length) return null;

  const message = choices[0].message as Record<string, unknown>;
  const toolCalls = (message?.tool_calls || []) as Array<Record<string, unknown>>;

  for (const tc of toolCalls) {
    const fn = tc.function as Record<string, unknown>;
    if (fn?.name === 'update_deal_model') {
      let args: Record<string, unknown>;
      try {
        args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments as string) : fn.arguments as Record<string, unknown>;
      } catch {
        return null;
      }
      return {
        assumptionUpdates: (args.assumption_updates || {}) as Record<string, unknown>,
        triggerRecalculation: (args.trigger_recalculation as boolean) || false,
        analysis: (args.analysis || null) as Record<string, unknown> | null,
        scenarioRequest: (args.scenario_request || null) as Record<string, unknown> | null,
      };
    }
  }
  return null;
}

/** Extract plain text from OpenAI response when no tool call was made. */
export function extractOpenAIText(data: Record<string, unknown>): string | null {
  const choices = (data.choices || []) as Array<Record<string, unknown>>;
  if (!choices.length) return null;
  const message = choices[0].message as Record<string, unknown>;
  return (message?.content as string) || null;
}
