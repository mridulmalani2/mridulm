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
  toolDef: Record<string, unknown> | null,
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  // Gemini uses a different message format
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 4096 },
  };
  if (toolDef) {
    body.tools = [{ functionDeclarations: [toGeminiFunctionDeclaration(toolDef)] }];
    body.tool_config = {
      function_calling_config: {
        mode: 'AUTO',
        allowed_function_names: ['update_deal_model'],
      },
    };
  }
  return {
    url: `${config.apiUrl}/${config.model}:generateContent?key=${config.apiKey}`,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
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

/** Extract plain text from Gemini response when no tool call was made. */
export function extractGoogleText(data: Record<string, unknown>): string | null {
  const candidates = (data.candidates || []) as Array<Record<string, unknown>>;
  if (!candidates.length) return null;
  const content = candidates[0].content as Record<string, unknown>;
  const parts = (content?.parts || []) as Array<Record<string, unknown>>;
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part.text === 'string') texts.push(part.text);
  }
  return texts.length > 0 ? texts.join('\n') : null;
}
