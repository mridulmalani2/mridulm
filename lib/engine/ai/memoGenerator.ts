/** Investment memo generator — plain-text AI generation using the full deal model. */

import type { ModelState } from '../../dealEngineTypes';
import type { ProviderConfig } from './providers';
import { buildModelContext } from './gateway';

// ── System Prompt ────────────────────────────────────────────────────────

const MEMO_SYSTEM_PROMPT = `You are a senior investment banker writing a formal private equity investment committee memo.
You have been given complete quantitative deal data from a live LBO model.

RULES:
1. Use ONLY the numbers provided. Do not invent, estimate, or round unless rounding is <1% of precision.
2. Every section must contain at least one specific number from the deal data.
3. Do not use placeholders or template language like "[Company]" or "[X]%". If a number is unavailable, omit the sentence — do not flag it.
4. Write as if presenting to a seasoned investment committee — precise, confident, no hedging.
5. Length target: 600–900 words. This is a 1-page memo, not a book.
6. Do not add any commentary, preamble, or closing remarks before or after the memo itself.

OUTPUT FORMAT (strict markdown, in this exact order):

# [Company Name] — Investment Memorandum
*[Sector] · [Currency] · [current date]*

---

## Executive Summary
Single paragraph, 4–5 sentences. State what the business does and its scale, the proposed transaction structure and entry valuation, projected returns at exit, and the single most important risk.

## Investment Thesis
Two to three sentences. Explain the specific operational or strategic bet — what the sponsor believes about the business that drives the return. Anchor every claim to a specific number or rate from the data.

## Transaction Structure & Returns
One paragraph covering: entry EV and entry EBITDA multiple, total equity check and its percentage of total capital, total debt and entry leverage, debt tranche names with rates and amortization types. Then: projected IRR, MOIC, and holding period. Then: exit EV and exit multiple. Then: value driver breakdown — name the top contributor with its exact percentage, and the smallest contributor.

## Scenario & Sensitivity Analysis
One paragraph. State the fragility classification (Robust/Moderate Risk/Fragile) and fragility score. State the combined stress-case IRR. Name the dominant stress driver. Reference the bear case and bull case IRR/MOIC.

## Key Risks & Mitigants
3–5 bullet points, each structured as: **[Risk Name]**: [specific risk referencing actual numbers] — [structural protection or mitigant]. Make each risk specific to this deal's numbers. No generic observations without the actual metric attached.

## Exit Considerations
One paragraph. State the planned exit year, exit method, exit EV/EBITDA multiple, and where that sits relative to public comps. State the exit verdict (aggressive/realistic/conservative). If there are exit flags, name and quantify their impact. State the implied buyer IRR if available.`;

// ── Data builder ─────────────────────────────────────────────────────────

function buildMemoPrompt(state: ModelState): string {
  const baseContext = buildModelContext(state);

  const rc = state.exit_reality_check;
  const frag = state.fragility;
  const scenarios = state.scenarios || [];

  const pct = (v: number | null | undefined) =>
    v != null ? `${(v * 100).toFixed(1)}%` : 'N/C';

  const bearCase = scenarios.find((s) => s.name === 'bear');
  const bullCase = scenarios.find((s) => s.name === 'bull');

  const scenarioLines = [
    `Bear case: IRR ${pct(bearCase?.irr)}, MOIC ${bearCase ? bearCase.moic.toFixed(2) + 'x' : 'N/C'}`,
    `Bull case: IRR ${pct(bullCase?.irr)}, MOIC ${bullCase ? bullCase.moic.toFixed(2) + 'x' : 'N/C'}`,
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
    `Exit EV/EBITDA: ${rc.ev_ebitda_at_exit.toFixed(1)}x vs. public comps ${rc.public_comps_multiple_range[0].toFixed(1)}x–${rc.public_comps_multiple_range[1].toFixed(1)}x`,
    `Multiple delta vs entry: ${rc.multiple_delta >= 0 ? '+' : ''}${rc.multiple_delta.toFixed(1)}x`,
    rc.implied_buyer_irr != null
      ? `Implied buyer IRR: ${pct(rc.implied_buyer_irr)}`
      : '',
    rc.flags.length > 0
      ? `Exit flags: ${rc.flags.map((f) => `${f.flag_type} [${f.severity}]${f.quantified_impact ? ' — ' + f.quantified_impact : ''}`).join('; ')}`
      : 'No exit flags.',
  ].filter(Boolean);

  return `[Deal Data]
${baseContext}

[Scenario Data]
${scenarioLines.join('\n')}

[Exit Reality Check]
${exitLines.join('\n')}

Write the investment memo now.`;
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

  const response = await fetch(url, {
    method: 'POST',
    headers,
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
