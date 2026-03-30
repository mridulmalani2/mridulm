/** Anthropic Claude adapter — builds request and parses tool_use response. */

import type { ProviderConfig } from '../providers';

export interface NormalizedToolCall {
  assumptionUpdates: Record<string, unknown>;
  triggerRecalculation: boolean;
  analysis: Record<string, unknown> | null;
  scenarioRequest: Record<string, unknown> | null;
}

/** Extracted plain-text response when no tool call is made. */
export interface NormalizedTextResponse {
  text: string;
}

export function buildAnthropicRequest(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  toolDef: Record<string, unknown>,
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  return {
    url: config.apiUrl,
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: {
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [toolDef],
      tool_choice: { type: 'auto' },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
  };
}

export function parseAnthropicResponse(data: Record<string, unknown>): NormalizedToolCall | null {
  const content = (data.content || []) as Array<Record<string, unknown>>;
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === 'update_deal_model') {
      const input = block.input as Record<string, unknown>;
      return {
        assumptionUpdates: (input.assumption_updates || {}) as Record<string, unknown>,
        triggerRecalculation: (input.trigger_recalculation as boolean) || false,
        analysis: (input.analysis || null) as Record<string, unknown> | null,
        scenarioRequest: (input.scenario_request || null) as Record<string, unknown> | null,
      };
    }
  }
  return null;
}

/** Extract plain text from Anthropic response when no tool call was made. */
export function extractAnthropicText(data: Record<string, unknown>): string | null {
  const content = (data.content || []) as Array<Record<string, unknown>>;
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text);
    }
  }
  return texts.length > 0 ? texts.join('\n') : null;
}
