/** Investment memo generator -plain-text AI generation using the full deal model. */

import type { ModelState } from '../../dealEngineTypes';
import type { ProviderConfig } from './providers';
import { buildModelContext } from './gateway';

// ── System Prompt ────────────────────────────────────────────────────────

const MEMO_SYSTEM_PROMPT = `You are a senior financial analyst preparing a formal investment committee memorandum based on a quantitative LBO model.
You have been given complete deal data from a live model. Your role is to present the financial outputs clearly, distinguish between what the model shows and what it cannot assess, and flag areas that require further diligence.

RULES:
1. Use ONLY the numbers provided. Do not invent, estimate, or round unless rounding is <1% of precision.
2. Every section must contain at least one specific number from the deal data.
3. Do not use placeholders or template language like "[Company]" or "[X]%". If a number is unavailable, omit the sentence -do not flag it.
4. Do not use evaluative language ("attractive," "strong," "reasonable," "moderate risk") unless the statement is directly provable from model outputs. Instead, state the metric and let the reader draw conclusions.
5. Clearly distinguish between:
   - FACTUAL OUTPUTS: numbers directly computed by the model (IRR, MOIC, leverage, margins, etc.)
   - MODEL-DRIVEN INFERENCES: conclusions that follow from the model's assumptions (e.g., value creation decomposition, stress scenarios)
   - UNKNOWNS: areas that cannot be assessed from financials alone (management quality, market dynamics, competitive position, regulatory risk, etc.)
6. Frame all conclusions as conditional on model assumptions, not as statements about the business itself. Use language like "the model projects," "under base case assumptions," "assuming [X], the returns imply."
7. Length target: 600-900 words. This is a 1-page memo, not a book.
8. Do not add any commentary, preamble, or closing remarks before or after the memo itself.

OUTPUT FORMAT (strict markdown, in this exact order):

# [Company Name] -Investment Memorandum
*[Sector] · [Currency] · [current date]*

---

## Executive Summary
Single paragraph, 4-5 sentences. State the company name, sector, and scale (LTM revenue/EBITDA). State the modelled transaction structure and entry valuation. State the projected returns under base case assumptions. Identify the single largest sensitivity in the model.

## Investment Thesis (Model-Implied)
Two to three sentences. Based on the model's assumptions, describe what must hold true for the projected returns to materialise -which assumptions drive the majority of value creation. Anchor every statement to a specific number or rate. Do not assert that these conditions will occur; state them as the model's embedded assumptions.

## Transaction Structure & Returns
One paragraph covering: entry EV and entry EBITDA multiple, total equity check and its percentage of total capital, total debt and entry leverage, debt tranche names with rates and amortization types. Then: projected IRR, MOIC, and holding period (all under base case assumptions). Then: exit EV and exit multiple. Then: value driver breakdown -name the top contributor with its exact percentage, and the smallest contributor. Clearly note that returns are a function of the assumed exit multiple and margin trajectory.

## Scenario & Sensitivity Analysis
One paragraph. State the fragility score and classification. State the combined stress-case IRR. Name the dominant stress driver. State the bear case and bull case IRR/MOIC. Note any scenario where returns fall below a meaningful threshold (e.g., <1.0x MOIC or negative IRR).

## Key Risks & Model Limitations
3-5 bullet points, each structured as: **[Risk/Limitation]**: [specific observation referencing actual numbers or model structure] -[what would need to be verified or mitigated through diligence]. Distinguish between risks quantifiable in the model (e.g., leverage levels, margin dependency) and risks that lie outside the model's scope (e.g., competitive dynamics, management execution, regulatory exposure). Do not invent mitigants that are not present in the deal structure.

## Exit Considerations
One paragraph. State the planned exit year, exit method, exit EV/EBITDA multiple, and where that sits relative to public comps. State the exit verdict. If there are exit flags, name and quantify their impact. State the implied buyer IRR if available. Note that exit assumptions are the single largest source of uncertainty in any LBO model.

## Diligence Items Not Addressable from Model
2-3 bullet points identifying the most critical qualitative unknowns that an IC would need answered before proceeding -areas where the model provides no insight (e.g., management track record, customer concentration, market cyclicality, regulatory environment). Be specific to the sector and deal structure rather than generic.`;

// ── Data builder ─────────────────────────────────────────────────────────

function buildMemoPrompt(state: ModelState): string {
  const baseContext = buildModelContext(state);

  const rc = state.exit_reality_check;
  const frag = state.fragility;
  const scenarios = state.scenarios || [];

  const pct = (v: number | null | undefined) =>
    v != null ? `${(v * 100).toFixed(1)}%` : 'N/C';

  const baseCase = scenarios.find((s) => s.name === 'base');
  const bearCase = scenarios.find((s) => s.name === 'bear');
  const bullCase = scenarios.find((s) => s.name === 'bull');
  const stressCase = scenarios.find((s) => s.name === 'stress');

  const fmtScenario = (label: string, s: typeof baseCase) =>
    s ? `${label}: IRR ${pct(s.irr)}, MOIC ${s.moic.toFixed(2)}x` : `${label}: N/C`;

  const scenarioLines = [
    fmtScenario('Base case', baseCase),
    fmtScenario('Bear case', bearCase),
    fmtScenario('Bull case', bullCase),
    fmtScenario('Stress case', stressCase),
  ];

  if (frag && frag.score > 0) {
    scenarioLines.push(
      `Fragility classification: ${frag.classification} (score: ${(frag.score * 100).toFixed(0)}%)`,
      `Combined stress IRR: ${pct(frag.combined_irr)}`,
      `Dominant stress driver: ${frag.dominant_stress_driver || 'N/C'}`,
    );
  }

  const exitLines = [
    `Exit verdict: ${rc.verdict}`,
    `Exit EV/EBITDA: ${rc.ev_ebitda_at_exit.toFixed(1)}x vs. public comps ${rc.public_comps_multiple_range[0].toFixed(1)}x-${rc.public_comps_multiple_range[1].toFixed(1)}x`,
    `Multiple delta vs entry: ${rc.multiple_delta >= 0 ? '+' : ''}${rc.multiple_delta.toFixed(1)}x`,
    rc.implied_buyer_irr != null
      ? `Implied buyer IRR: ${pct(rc.implied_buyer_irr)}`
      : '',
    rc.flags.length > 0
      ? `Exit flags: ${rc.flags.map((f) => `${f.flag_type} [${f.severity}]${f.quantified_impact ? ' -' + f.quantified_impact : ''}`).join('; ')}`
      : 'No exit flags.',
  ].filter(Boolean);

  return `[Deal Data -All values below are model outputs or model assumptions. No market data, qualitative assessments, or management projections are included.]
${baseContext}

[Scenario Data -Model-generated stress and upside cases]
${scenarioLines.join('\n')}

[Exit Reality Check -Model-derived exit analysis]
${exitLines.join('\n')}

Write the investment memo now. Remember: present findings as model outputs, not business assessments.`;
}

// ── Plain-text provider call ─────────────────────────────────────────────

async function callProviderForText(
  userPrompt: string,
  systemPrompt: string,
  config: ProviderConfig,
): Promise<string> {
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  const maxTokens = config.provider === 'groq' ? 4096 : 8192;

  switch (config.provider) {
    case 'anthropic':
      url = config.apiUrl;
      headers = {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      };
      body = {
        model: config.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      };
      break;

    case 'google': {
      url = `${config.apiUrl}/${config.model}:generateContent?key=${config.apiKey}`;
      headers = { 'content-type': 'application/json' };
      body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      };
      break;
    }

    default:
      // OpenAI-compatible: openai, mistral, groq
      url = config.apiUrl;
      headers = {
        Authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      };
      body = {
        model: config.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      };
      break;
  }

  // Sanitize header values: strip any non-ISO-8859-1 code points that
  // cause "Failed to read the 'headers' property" errors in browser fetch.
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    safeHeaders[k] = v.replace(/[^\x00-\xff]/g, '');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: safeHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI provider error ${response.status}: ${errText}`);
  }

  const result = await response.json() as Record<string, unknown>;

  // Extract text from provider-specific response shapes
  switch (config.provider) {
    case 'anthropic': {
      const content = (result.content || []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          return block.text;
        }
      }
      break;
    }
    case 'google': {
      const candidates = (result.candidates || []) as Array<Record<string, unknown>>;
      if (candidates.length) {
        const c = candidates[0].content as Record<string, unknown> | undefined;
        const parts = (c?.parts || []) as Array<Record<string, unknown>>;
        if (parts.length && typeof parts[0].text === 'string') {
          return parts[0].text;
        }
      }
      break;
    }
    default: {
      const choices = (result.choices || []) as Array<Record<string, unknown>>;
      if (choices.length) {
        const msg = choices[0].message as Record<string, unknown> | undefined;
        if (typeof msg?.content === 'string') return msg.content;
      }
      break;
    }
  }

  throw new Error('AI returned an empty response');
}

// ── Public API ───────────────────────────────────────────────────────────

export async function generateInvestmentMemo(
  modelState: ModelState,
  config: ProviderConfig,
): Promise<string> {
  const prompt = buildMemoPrompt(modelState);
  return callProviderForText(prompt, MEMO_SYSTEM_PROMPT, config);
}
