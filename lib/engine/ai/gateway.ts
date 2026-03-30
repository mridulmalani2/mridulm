/** Unified AI gateway — routes to provider-specific adapters. */

import type { ModelState, AIAnalysis, AppliedDiff } from '../../dealEngineTypes';
import type { ProviderConfig } from './providers';
import type { NormalizedToolCall } from './adapters/anthropic';
import { buildAnthropicRequest, parseAnthropicResponse, extractAnthropicText } from './adapters/anthropic';
import { buildOpenAIRequest, parseOpenAIResponse, extractOpenAIText } from './adapters/openai';
import { buildGoogleRequest, parseGoogleResponse, extractGoogleText } from './adapters/google';

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

const SYSTEM_PROMPT = `You are a senior PE deal advisor embedded in a live LBO model. The user is looking at an interactive deal model and chatting with you about it — like talking to a sharp colleague who has the full model open in front of them.

You receive the full model context (entry assumptions, projections, returns, debt, credit metrics, fragility analysis) with each message.

HOW TO RESPOND:
- For questions, explanations, or discussion: respond with natural text. No tool call needed. Just talk.
- For requests to change assumptions (set growth to X, reduce leverage, stress test at Y): call the update_deal_model tool to make the changes, and explain what you did in analysis.message.
- For deal critiques or full analysis requests: call update_deal_model with empty assumption_updates and deliver your analysis in the analysis fields.

WHEN RESPONDING WITH TEXT (no tool call):
- Answer the question directly, referencing actual numbers from the model
- Be conversational but substantive — every sentence adds information
- Match response length to the question. Simple question → concise answer. Deep analysis → thorough breakdown.

WHEN USING THE TOOL:
- Use exact dot-notation paths (e.g., revenue.growth_rates.0, exit.exit_ebitda_multiple)
- Set trigger_recalculation: true when changing assumptions
- Put your user-facing response in analysis.message
- Only fill return_decomposition, primary_driver, risk_concentration, fragility_test, improvement_levers for full deal critiques

STYLE:
- Direct, specific, decisive. Reference real numbers from the model.
- No preamble, filler, or teaching language. You're talking to PE professionals.
- Never say "I cannot" — infer reasonable intent and act.
- Never hedge. Assert with confidence.

EXAMPLE (text response for a question):
"IRR is driven primarily by margin expansion (contributing 42% of total value creation). Revenue growth at 8% CAGR adds ~350bps to IRR but isn't the swing factor. The real fragility is in the exit multiple — a 1x compression from 11x to 10x drops IRR from 24% to 18%. Debt paydown contributes 15% of value but deleveraging is slow given the bullet structure on TLB."

EXAMPLE (tool call for assumption change):
analysis.message: "Set revenue growth to 5% flat across all years. IRR drops from 24% to 19% — growth was contributing 280bps. At 5% growth, the deal depends almost entirely on margin expansion and exit multiple, making it significantly more fragile."`;


// ── Tool Definition ─────────────────────────────────────────────────────

const DEAL_ENGINE_TOOL = {
  name: 'update_deal_model',
  description: 'Update deal model assumptions and/or provide structured investment analysis. Use this when changing assumptions or delivering a structured deal critique. For simple questions or explanations, you can respond with plain text instead.',
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
          message: { type: 'string', description: 'Your natural language response to the user. Write like a senior PE analyst — direct, specific, referencing actual numbers from the model. No templates. No filler. Adapt your response length and style to what the user asked.' },
          return_decomposition: { type: 'string', description: 'What is currently driving returns. Be specific. Reference numbers. Only include for full deal critiques.' },
          primary_driver: { type: 'string', description: 'Single clearest driver of returns. One sentence. Only include for full deal critiques.' },
          risk_concentration: { type: 'string', description: 'Where the model is most fragile. Name the variable and the threshold. Only include for full deal critiques.' },
          fragility_test: { type: 'string', description: 'What specific change breaks the deal. Quantify the break point. Only include for full deal critiques.' },
          improvement_levers: { type: 'array', items: { type: 'string' }, description: 'Ranked list of levers to improve IRR. Actionable. Specific. Only include for full deal critiques.' },
          assumption_rationale: { type: 'string', description: 'If assumptions were updated: explain why these values and not others. Reference sector context.' },
        },
        required: ['message'],
      },
      scenario_request: {
        type: 'object',
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

// ── Structured context builder ──────────────────────────────────────────

function buildModelContext(state: ModelState): string {
  const ret = state.returns;
  const su = state.sources_and_uses;
  const ds = state.debt_schedule;
  const vd = state.value_drivers;
  const frag = state.fragility;
  const ca = state.credit_analysis;
  const hp = state.exit.holding_period;
  const entryEbitda = state.revenue.base_revenue * state.margins.base_ebitda_margin;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtM = (v: number) => `${v.toFixed(1)}M`;

  const lines: string[] = [
    `DEAL: ${state.deal_name} | ${state.sector} | ${state.currency}`,
    `ENTRY: Revenue ${fmtM(state.revenue.base_revenue)}, EBITDA ${fmtM(entryEbitda)} (${pct(state.margins.base_ebitda_margin)}), EV ${fmtM(state.entry.enterprise_value)}, Entry Equity ${fmtM(ret.entry_equity)}`,
    `LEVERAGE: ${state.entry.leverage_ratio.toFixed(1)}x | Total Debt ${fmtM(su.total_debt)} across ${state.debt_tranches.length} tranches`,
    `EXIT: ${hp}yr hold, ${state.exit.exit_ebitda_multiple.toFixed(1)}x exit multiple → Exit EV ${fmtM(ret.exit_ev)}`,
    `RETURNS: IRR ${ret.irr != null ? pct(ret.irr) : 'N/C'} | Gross IRR ${ret.irr_gross != null ? pct(ret.irr_gross) : 'N/C'} | MOIC ${ret.moic.toFixed(2)}x | DPI ${ret.dpi.toFixed(2)}x`,
    `VALUE DRIVERS: Revenue ${vd.revenue_growth_contribution_pct.toFixed(0)}%, Margin ${vd.margin_expansion_contribution_pct.toFixed(0)}%, Multiple ${vd.multiple_expansion_contribution_pct.toFixed(0)}%, Debt Paydown ${vd.debt_paydown_contribution_pct.toFixed(0)}%, Fees ${vd.fees_drag_contribution_pct.toFixed(0)}%`,
    `GROWTH RATES: [${state.revenue.growth_rates.map(g => pct(g)).join(', ')}]`,
    `MARGINS: Base ${pct(state.margins.base_ebitda_margin)} → Target ${pct(state.margins.target_ebitda_margin)} (${state.margins.margin_trajectory})`,
    `OPERATING: D&A ${pct(state.margins.da_pct_revenue)}, Capex ${pct(state.margins.capex_pct_revenue)}, NWC ${pct(state.margins.nwc_pct_revenue)}`,
  ];

  // Debt tranches
  for (const t of state.debt_tranches) {
    lines.push(`  TRANCHE: ${t.name} | ${fmtM(t.principal)} | ${pct(t.interest_rate)} ${t.rate_type} | ${t.amortization_type}${t.cash_sweep_pct > 0 ? ` | ${pct(t.cash_sweep_pct)} sweep` : ''}`);
  }

  // Credit
  if (ds.leverage_ratio_by_year.length) {
    lines.push(`CREDIT: Leverage Y1 ${ds.leverage_ratio_by_year[0]?.toFixed(1)}x → Y${hp} ${ds.leverage_ratio_by_year[hp - 1]?.toFixed(1)}x | ICR Y1 ${ds.interest_coverage_by_year[0]?.toFixed(1)}x`);
  }
  if (ca.credit_rating_estimate) {
    lines.push(`CREDIT RATING: ${ca.credit_rating_estimate} | Refi Risk: ${ca.refinancing_risk ? 'YES' : 'NO'}`);
  }

  // Fragility
  if (frag && frag.score > 0) {
    lines.push(`FRAGILITY: Score ${(frag.score * 100).toFixed(0)}% (${frag.classification}) | Combined stressed IRR ${frag.combined_irr != null ? pct(frag.combined_irr) : 'N/C'}`);
  }

  // Exit reality check
  const rc = state.exit_reality_check;
  lines.push(`EXIT CHECK: ${rc.verdict} | EV/EBITDA ${rc.ev_ebitda_at_exit.toFixed(1)}x | Multiple delta ${rc.multiple_delta >= 0 ? '+' : ''}${rc.multiple_delta.toFixed(1)}x | ${rc.flags.length} flags`);

  // Fees
  lines.push(`FEES: Entry ${pct(state.fees.entry_fee_pct)}, Exit ${pct(state.fees.exit_fee_pct)}, Monitoring ${fmtM(state.fees.monitoring_fee_annual)}/yr, Tax ${pct(state.tax.tax_rate)}`);

  // S&U balance
  lines.push(`S&U: Total Uses ${fmtM(su.total_uses)}, Total Sources ${fmtM(su.total_sources)}, Balanced: ${su.sources_uses_balanced ? 'YES' : 'NO'}`);

  // MIP
  if (state.mip.mip_pool_pct > 0) {
    lines.push(`MIP: Pool ${pct(state.mip.mip_pool_pct)}, Hurdle ${state.mip.hurdle_moic.toFixed(1)}x, Payout ${fmtM(ret.mip_payout)}`);
  }

  // Projections summary (Year 1 and exit year)
  const y = state.projections.years;
  if (y.length >= 2) {
    lines.push(`PROJECTIONS Y1: Revenue ${fmtM(y[0].revenue)}, EBITDA ${fmtM(y[0].ebitda)} (${pct(y[0].ebitda_margin)}), FCF Pre-Debt ${fmtM(y[0].fcf_pre_debt)}`);
    const last = y[y.length - 1];
    lines.push(`PROJECTIONS Y${hp}: Revenue ${fmtM(last.revenue)}, EBITDA ${fmtM(last.ebitda)} (${pct(last.ebitda_margin)}), FCF Pre-Debt ${fmtM(last.fcf_pre_debt)}`);
  }

  return lines.join('\n');
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

/** Extract plain text when no tool call was made (conversational responses). */
function extractText(data: Record<string, unknown>, provider: string): string | null {
  switch (provider) {
    case 'anthropic':
      return extractAnthropicText(data);
    case 'openai':
    case 'mistral':
    case 'groq':
      return extractOpenAIText(data);
    case 'google':
      return extractGoogleText(data);
    default:
      return extractOpenAIText(data);
  }
}

// ── Panel Insights Generation ──────────────────────────────────────────

export interface PanelInsights {
  valueBridge: string[];
  fragility: string[];
  exitFlags: { flag_type: string; severity: string; description: string; quantified_impact: string }[];
}

const PANEL_INSIGHTS_TOOL = {
  name: 'generate_panel_insights',
  description: 'Generate IC-grade analytical insights for deal model output panels.',
  input_schema: {
    type: 'object',
    properties: {
      value_bridge_insights: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 sharp, specific insights about value creation drivers. Reference actual numbers. No generic observations.',
      },
      fragility_insights: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 insights about model fragility, stress test results, and where the deal breaks. Quantify thresholds.',
      },
      exit_flag_details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            flag_type: { type: 'string', description: 'The flag identifier (must match the engine flag_type)' },
            description: { type: 'string', description: 'IC-grade explanation of why this flag matters. Be specific, reference the actual deal numbers.' },
            quantified_impact: { type: 'string', description: 'Quantified statement of the impact — reference actual IRR, multiples, or dollar amounts from the model.' },
          },
          required: ['flag_type', 'description', 'quantified_impact'],
        },
        description: 'One entry per exit reality check flag. Generate proper descriptions and quantified impacts for each.',
      },
    },
    required: ['value_bridge_insights', 'fragility_insights', 'exit_flag_details'],
  },
};

const INSIGHTS_SYSTEM_PROMPT = `You are a senior PE deal advisor generating IC-grade analytical insights for an LBO model's output panels. You receive full model context.

Write like a senior analyst preparing IC materials — direct, specific, quantified. Every sentence must reference actual numbers from the model. No generic observations, no templates, no filler.

For VALUE BRIDGE insights: Explain what's actually driving returns and why. Reference the contribution split, identify if the deal is operationally or financially engineered, flag any concerning patterns.

For FRAGILITY insights: Identify where the model breaks, quantify the break points, and assess whether the stress scenarios are realistic for this sector.

For EXIT FLAG details: For each flag the engine has identified, write a proper IC-grade description explaining why it matters for THIS specific deal, and quantify the actual impact using the model's numbers. Do not use generic language — every description should be unique to this deal's specifics.`;

function buildInsightsRequest(
  messages: { role: string; content: string }[],
  config: ProviderConfig,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  let req: { url: string; headers: Record<string, string>; body: Record<string, unknown> };
  switch (config.provider) {
    case 'anthropic':
      req = buildAnthropicRequest(messages, INSIGHTS_SYSTEM_PROMPT, PANEL_INSIGHTS_TOOL, config);
      req.body.tool_choice = { type: 'tool', name: 'generate_panel_insights' };
      break;
    case 'google':
      req = buildGoogleRequest(messages, INSIGHTS_SYSTEM_PROMPT, PANEL_INSIGHTS_TOOL, config);
      ((req.body.tool_config as Record<string, unknown>).function_calling_config as Record<string, unknown>).mode = 'ANY';
      ((req.body.tool_config as Record<string, unknown>).function_calling_config as Record<string, unknown>).allowed_function_names = ['generate_panel_insights'];
      break;
    default:
      req = buildOpenAIRequest(messages, INSIGHTS_SYSTEM_PROMPT, PANEL_INSIGHTS_TOOL, config);
      req.body.tool_choice = { type: 'function', function: { name: 'generate_panel_insights' } };
      break;
  }
  return req;
}

function parseInsightsResponse(data: Record<string, unknown>, provider: string): PanelInsights | null {
  let args: Record<string, unknown> | null = null;

  switch (provider) {
    case 'anthropic': {
      const content = (data.content || []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === 'tool_use') {
          args = block.input as Record<string, unknown>;
          break;
        }
      }
      break;
    }
    case 'openai':
    case 'mistral':
    case 'groq': {
      const choices = (data.choices || []) as Array<Record<string, unknown>>;
      if (choices.length) {
        const message = choices[0].message as Record<string, unknown>;
        const toolCalls = (message?.tool_calls || []) as Array<Record<string, unknown>>;
        if (toolCalls.length) {
          const fn = toolCalls[0].function as Record<string, unknown>;
          try {
            args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments as string) : fn.arguments as Record<string, unknown>;
          } catch { /* skip */ }
        }
      }
      break;
    }
    case 'google': {
      const candidates = (data.candidates || []) as Array<Record<string, unknown>>;
      if (candidates.length) {
        const content = candidates[0].content as Record<string, unknown>;
        const parts = (content?.parts || []) as Array<Record<string, unknown>>;
        for (const part of parts) {
          const fc = part.functionCall as Record<string, unknown> | undefined;
          if (fc) { args = (fc.args || {}) as Record<string, unknown>; break; }
        }
      }
      break;
    }
  }

  if (!args) return null;

  const flagDetails = (args.exit_flag_details || []) as Array<Record<string, string>>;
  return {
    valueBridge: (args.value_bridge_insights || []) as string[],
    fragility: (args.fragility_insights || []) as string[],
    exitFlags: flagDetails.map((f) => ({
      flag_type: f.flag_type || '',
      severity: f.severity || 'warning',
      description: f.description || '',
      quantified_impact: f.quantified_impact || '',
    })),
  };
}

export async function generatePanelInsights(
  modelState: ModelState,
  config: ProviderConfig,
): Promise<PanelInsights> {
  const modelContext = buildModelContext(modelState);

  // Include engine flag types so AI knows what to write about
  const rc = modelState.exit_reality_check;
  const flagContext = rc.flags.length > 0
    ? `\n\nEXIT FLAGS TO DESCRIBE (generate description + quantified_impact for each):\n${rc.flags.map((f) => `- ${f.flag_type} [${f.severity}]`).join('\n')}`
    : '\n\nNo exit flags triggered.';

  const messages = [{
    role: 'user' as const,
    content: `[Model Context]\n${modelContext}${flagContext}\n\nGenerate IC-grade panel insights for this deal model.`,
  }];

  const { url, headers, body } = buildInsightsRequest(messages, config);

  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) return { valueBridge: [], fragility: [], exitFlags: [] };
    const result = await response.json();
    return parseInsightsResponse(result, config.provider) || { valueBridge: [], fragility: [], exitFlags: [] };
  } catch {
    return { valueBridge: [], fragility: [], exitFlags: [] };
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

  // Build structured model context (much more token-efficient than raw JSON)
  const modelContext = buildModelContext(modelState);

  const messages = [
    ...chatHistory.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: `[Model Context]\n${modelContext}\n\n${message}`,
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

    // On 400 schema validation errors (e.g. AI sent wrong type for a field),
    // try to extract the AI's message from the malformed tool call in the error body
    if (response.status === 400 && errorText.includes('tool call validation failed')) {
      const msgMatch = errorText.match(/"message":\s*"([^"]+)"/);
      if (msgMatch) {
        return {
          updatedStateDict: null,
          analysis: { message: msgMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') } as unknown as AIAnalysis,
          appliedDiffs: [],
          triggerRecalculation: false,
          intent,
        };
      }
    }

    return { updatedStateDict: null, analysis: null, appliedDiffs: [], triggerRecalculation: false, intent, error: `API error ${response.status}: ${errorText}` };
  }

  const result = await response.json();
  const toolCall = parseResponse(result, config.provider);

  // If the AI responded with a tool call, apply assumption updates
  if (toolCall) {
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

  // If no tool call, extract plain text response (conversational Q&A)
  const textResponse = extractText(result, config.provider);
  if (textResponse) {
    return {
      updatedStateDict: null,
      analysis: { message: textResponse } as unknown as AIAnalysis,
      appliedDiffs: [],
      triggerRecalculation: false,
      intent,
    };
  }

  return { updatedStateDict: null, analysis: null, appliedDiffs: [], triggerRecalculation: false, intent, error: 'AI returned an empty response' };
}
