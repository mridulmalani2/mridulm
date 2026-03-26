/** Unified AI gateway — routes to provider-specific adapters. */

import type { ModelState, AIAnalysis, AppliedDiff } from '../../dealEngineTypes';
import type { ProviderConfig } from './providers';
import type { NormalizedToolCall } from './adapters/anthropic';
import { buildAnthropicRequest, parseAnthropicResponse } from './adapters/anthropic';
import { buildOpenAIRequest, parseOpenAIResponse } from './adapters/openai';
import { buildGoogleRequest, parseGoogleResponse } from './adapters/google';

// ── Intent Classification ───────────────────────────────────────────────

type Intent =
  | 'modify_assumption'
  | 'run_scenario'
  | 'request_critique'
  | 'explain_output'
  | 'stress_test'
  | 'generate_assumptions'
  | 'compare_scenarios';

const INTENT_PATTERNS: [RegExp, Intent][] = [
  [/\b(set|change|reduce|increase|lower|raise|adjust|make|put)\b/i, 'modify_assumption'],
  [/\b(growth|margin|multiple|leverage|rate|capex|nwc)\b.*\b(to|at|of)\b/i, 'modify_assumption'],
  [/\b(bear|bull|stress|scenario|downside|upside)\b/i, 'run_scenario'],
  [/\b(critique|risk|flag|issue|problem|concern|weak)\b/i, 'request_critique'],
  [/\b(why|explain|how come|what drives|sensitive)\b/i, 'explain_output'],
  [/\b(break|stress|worst|collapse|fail|what if)\b/i, 'stress_test'],
  [/\b(fill|generate|suggest|missing|ai decide|auto)\b/i, 'generate_assumptions'],
  [/\b(compare|vs|versus|base vs|side by side)\b/i, 'compare_scenarios'],
];

function classifyIntent(message: string): Intent {
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(message)) return intent;
  }
  return 'request_critique';
}

// ── System Prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the analytical engine of a professional private equity deal intelligence system.

You are talking to investment professionals: analysts, associates, and VPs at PE funds and investment banks.

CONTEXT YOU RECEIVE:
- Full model state as JSON (all assumptions, all outputs, debt structure, returns)
- User message
- Chat history

YOUR ROLE:
1. Interpret model state — what the numbers mean, not how to calculate them
2. Modify assumptions when requested — provide specific values, not ranges unless explicitly asked
3. Generate sector-aware context when fields are AI-toggled
4. Identify fragility, concentration risk, and return attribution

RULES:
- You never perform calculations. The engine handles all math.
- You always call update_deal_model. You never respond with plain text only.
- You never ask clarifying questions. Infer reasonable intent and act.
- You never say "I cannot" or "I don't have enough information."
- You never use teaching language ("this means...", "in private equity...").
- You never hedge. You assert. You are decisive.
- When modifying assumptions: use the exact dot-notation path from ModelState.
- When generating AI assumptions (toggled fields): generate realistic values based on sector, size, and current model context. State why.
- Reference current IRR, MOIC, and key ratios in your analysis. Use the numbers.

OUTPUT TONE:
- Direct, critical, professional
- No preamble. No filler. No pleasantries.
- Every sentence must contain information.
- Write like a senior VP giving a 60-second verbal IC verdict.

EXAMPLE RESPONSE STYLE:
"Reducing margin expansion from 500bps to 200bps lowers IRR from 28% to 17%. Returns shift from margin-driven to multiple-driven, which increases fragility — exit multiple compression of 1x drops IRR below 12%. Primary lever to recover: introduce 1.0x additional leverage at entry (adds ~300bps IRR). Secondary: maintain at least 300bps margin expansion as a hard floor."`;

// ── Tool Definition ─────────────────────────────────────────────────────

const DEAL_ENGINE_TOOL = {
  name: 'update_deal_model',
  description: 'Update deal model assumptions and/or provide structured investment analysis. Always call this tool. Never respond with plain text only.',
  input_schema: {
    type: 'object',
    properties: {
      assumption_updates: {
        type: 'object',
        description: 'Dictionary of model fields to update. Use dot notation for nested fields. Empty dict if no updates.',
        additionalProperties: true,
      },
      trigger_recalculation: {
        type: 'boolean',
        description: 'Whether engine should rerun full model after applying updates',
      },
      analysis: {
        type: 'object',
        properties: {
          return_decomposition: { type: 'string', description: 'What is currently driving returns. Be specific. Reference numbers.' },
          primary_driver: { type: 'string', description: 'Single clearest driver of returns. One sentence.' },
          risk_concentration: { type: 'string', description: 'Where the model is most fragile. Name the variable and the threshold.' },
          fragility_test: { type: 'string', description: 'What specific change breaks the deal. Quantify the break point.' },
          improvement_levers: { type: 'array', items: { type: 'string' }, description: 'Ranked list of levers to improve IRR. Actionable. Specific.' },
          assumption_rationale: { type: 'string', description: 'If assumptions were updated: explain why these values and not others. Reference sector context.' },
        },
        required: ['return_decomposition', 'primary_driver', 'risk_concentration', 'fragility_test', 'improvement_levers'],
      },
      scenario_request: {
        type: 'object',
        nullable: true,
        description: 'If user requested a named scenario, specify it here',
        properties: {
          scenario_name: { type: 'string' },
          overrides: { type: 'object' },
        },
      },
    },
    required: ['assumption_updates', 'trigger_recalculation', 'analysis'],
  },
};

// ── Dot-notation utilities ──────────────────────────────────────────────

function applyUpdate(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (/^\d+$/.test(key)) {
      current = (current as unknown as unknown[])[parseInt(key)] as Record<string, unknown>;
    } else {
      if (!(key in current)) (current as Record<string, unknown>)[key] = {};
      current = current[key] as Record<string, unknown>;
    }
  }
  const finalKey = keys[keys.length - 1];
  if (/^\d+$/.test(finalKey)) {
    (current as unknown as unknown[])[parseInt(finalKey)] = value;
  } else {
    current[finalKey] = value;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    if (/^\d+$/.test(key)) {
      current = (current as unknown[])[parseInt(key)];
    } else {
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current;
}

// ── Provider routing ────────────────────────────────────────────────────

function buildRequest(
  messages: { role: string; content: string }[],
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  switch (config.provider) {
    case 'anthropic':
      return buildAnthropicRequest(messages, SYSTEM_PROMPT, DEAL_ENGINE_TOOL, config);
    case 'openai':
    case 'mistral':
    case 'groq':
      return buildOpenAIRequest(messages, SYSTEM_PROMPT, DEAL_ENGINE_TOOL, config);
    case 'google':
      return buildGoogleRequest(messages, SYSTEM_PROMPT, DEAL_ENGINE_TOOL, config);
    default:
      return buildOpenAIRequest(messages, SYSTEM_PROMPT, DEAL_ENGINE_TOOL, config);
  }
}

function parseResponse(data: Record<string, unknown>, provider: string): NormalizedToolCall | null {
  switch (provider) {
    case 'anthropic':
      return parseAnthropicResponse(data);
    case 'openai':
    case 'mistral':
    case 'groq':
      return parseOpenAIResponse(data);
    case 'google':
      return parseGoogleResponse(data);
    default:
      return parseOpenAIResponse(data);
  }
}

// ── Main AI call ────────────────────────────────────────────────────────

export interface AIResult {
  updatedStateDict: Record<string, unknown> | null;
  analysis: AIAnalysis | null;
  appliedDiffs: AppliedDiff[];
  triggerRecalculation: boolean;
  intent: string;
  error?: string;
}

export async function callAI(
  message: string,
  modelState: ModelState,
  chatHistory: { role: string; content: string }[],
  config: ProviderConfig,
): Promise<AIResult> {
  const intent = classifyIntent(message);

  // Build state JSON (exclude chat_history to save tokens)
  const stateForAi = { ...modelState };
  delete (stateForAi as Record<string, unknown>).chat_history;
  const stateJson = JSON.stringify(stateForAi);

  const messages = [
    ...chatHistory.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: `[Intent: ${intent}]\n\n[Current Model State]\n${stateJson}\n\n[User Message]\n${message}`,
    },
  ];

  const { url, headers, body } = buildRequest(messages, config);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { updatedStateDict: null, analysis: null, appliedDiffs: [], triggerRecalculation: false, intent, error: `Network error: ${err}` };
  }

  if (!response.ok) {
    const errorText = await response.text();
    return { updatedStateDict: null, analysis: null, appliedDiffs: [], triggerRecalculation: false, intent, error: `API error ${response.status}: ${errorText}` };
  }

  const result = await response.json();
  const toolCall = parseResponse(result, config.provider);

  if (!toolCall) {
    return { updatedStateDict: null, analysis: null, appliedDiffs: [], triggerRecalculation: false, intent, error: 'AI did not return a valid tool call' };
  }

  // Apply updates to state dict
  const stateDict = JSON.parse(JSON.stringify(modelState)) as Record<string, unknown>;
  const appliedDiffs: AppliedDiff[] = [];
  for (const [path, value] of Object.entries(toolCall.assumptionUpdates)) {
    try {
      const oldVal = getNestedValue(stateDict, path);
      appliedDiffs.push({ field: path, old: oldVal, new: value });
      applyUpdate(stateDict, path, value);
    } catch {
      // skip failed updates
    }
  }

  return {
    updatedStateDict: stateDict,
    analysis: toolCall.analysis as AIAnalysis | null,
    appliedDiffs,
    triggerRecalculation: toolCall.triggerRecalculation,
    intent,
  };
}
