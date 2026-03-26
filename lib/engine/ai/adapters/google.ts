/** Google Gemini adapter — converts to/from Gemini function calling format. */

import type { ProviderConfig } from '../providers';
import type { NormalizedToolCall } from './anthropic';

/** Convert our Anthropic-style tool def to Gemini functionDeclarations format. */
function toGeminiFunctionDeclaration(toolDef: Record<string, unknown>): Record<string, unknown> {
  return {
    name: toolDef.name as string,
    description: toolDef.description as string,
    parameters: toolDef.input_schema,
  };
}

export function buildGoogleRequest(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  toolDef: Record<string, unknown>,
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  // Gemini uses a different message format
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  return {
    url: `${config.apiUrl}/${config.model}:generateContent?key=${config.apiKey}`,
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: [toGeminiFunctionDeclaration(toolDef)] }],
      tool_config: {
        function_calling_config: {
          mode: 'ANY',
          allowed_function_names: ['update_deal_model'],
        },
      },
      generationConfig: { maxOutputTokens: 4096 },
    },
  };
}

export function parseGoogleResponse(data: Record<string, unknown>): NormalizedToolCall | null {
  const candidates = (data.candidates || []) as Array<Record<string, unknown>>;
  if (!candidates.length) return null;

  const content = candidates[0].content as Record<string, unknown>;
  const parts = (content?.parts || []) as Array<Record<string, unknown>>;

  for (const part of parts) {
    const fc = part.functionCall as Record<string, unknown> | undefined;
    if (fc && fc.name === 'update_deal_model') {
      const args = (fc.args || {}) as Record<string, unknown>;
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
