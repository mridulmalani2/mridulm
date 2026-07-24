/**
 * lib/ai2/suggest.ts — E4 AI-suggest against the NEW schema. The model proposes Class-B
 * refinements ONLY, over a whitelist of true-input paths, and every accepted value is
 * (a) clamped to the SAME plausibility rails as the deterministic suggestions and
 * (b) badged {kind:'ai'} with the model's stated one-line basis. MISSING facts are
 * NEVER sent (the taint rule); out-of-bounds or non-whitelisted proposals are DROPPED
 * with a note, never silently applied.
 */

import type { DealAssumptions, DealFacts } from '../engine2/types';
import type { AiTextFn } from './textCall';

export interface AiFieldSuggestion {
  path: AiPath;
  value: number | number[];
  basis: string;
}

export interface AiSuggestResult {
  assumptions: DealAssumptions;
  aiBasis: Record<string, { kind: 'ai'; detail: string }>;
  applied: AiFieldSuggestion[];
  dropped: string[];
}

const AI_PATHS = [
  'operations.growth',
  'operations.target_margin',
  'operations.maint_capex_pct_revenue',
  'entry.entry_multiple',
  'exit.multiple',
  'structure.sweep.base_pct',
] as const;
type AiPath = (typeof AI_PATHS)[number];

/** The suggestion layer's rails — identical bounds, one clamp table. */
const RAILS: Record<AiPath, [number, number]> = {
  'operations.growth': [-0.15, 0.35],
  'operations.target_margin': [0.01, 0.6],
  'operations.maint_capex_pct_revenue': [0, 0.2],
  'entry.entry_multiple': [1, 30],
  'exit.multiple': [1, 30],
  'structure.sweep.base_pct': [0, 1],
};

export function buildSuggestPrompt(facts: DealFacts, assumptions: DealAssumptions, missingFacts: string[]): { system: string; user: string } {
  const factLines = Object.entries({
    fy_revenue: facts.fy_revenue,
    fy_ebitda: facts.fy_ebitda,
    fy_ebitda_margin: facts.fy_ebitda_margin,
    da_pct_revenue: facts.da_pct_revenue,
    maint_capex_pct_revenue: facts.maint_capex_pct_revenue,
    net_debt: facts.net_debt,
    effective_tax_rate: facts.effective_tax_rate,
    implied_trading_ev_ebitda: facts.implied_trading_ev_ebitda,
    implied_cost_of_debt: facts.implied_cost_of_debt,
  })
    .filter(([k, v]) => v !== null && !missingFacts.includes(k)) // taint rule: MISSING never leaves the app
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const history = facts.history.map((h) => `${h.period_end}: revenue ${h.revenue ?? 'gap'}, ebitda ${h.ebitda ?? 'gap'}`).join('\n');
  return {
    system: `You are a PE operating partner refining LBO assumptions. Respond with STRICT JSON only: {"suggestions":[{"path":<one of ${JSON.stringify(AI_PATHS)}>,"value":<number or per-year number array for operations.growth>,"basis":"<one line citing the fact/history that justifies it>"}]}. Rates and percentages are DECIMALS. Suggest only fields you would actually move; never invent facts.`,
    user: `Sector: ${facts.sector}. Filing facts (verified):\n${factLines}\nHistory:\n${history}\nCurrent assumptions: growth ${JSON.stringify(assumptions.operations.growth)}, target margin ${assumptions.operations.target_margin}, maint capex ${assumptions.operations.maint_capex_pct_revenue}, entry ${assumptions.entry.entry_multiple}x, exit ${assumptions.exit.multiple}x, sweep ${assumptions.structure.sweep.base_pct}. Hold ${assumptions.entry.hold_years}y.`,
  };
}

function clamp(path: AiPath, v: number): number {
  const [lo, hi] = RAILS[path];
  return Math.min(hi, Math.max(lo, v));
}

export function applyAiSuggestions(assumptions: DealAssumptions, rawText: string): AiSuggestResult {
  const aiBasis: AiSuggestResult['aiBasis'] = {};
  const applied: AiFieldSuggestion[] = [];
  const dropped: string[] = [];
  let next = assumptions;

  let parsed: { suggestions?: unknown } = {};
  try {
    const jsonStart = rawText.indexOf('{');
    parsed = JSON.parse(rawText.slice(jsonStart)) as { suggestions?: unknown };
  } catch {
    return { assumptions, aiBasis, applied, dropped: ['unparseable AI response — nothing applied'] };
  }
  const list = Array.isArray(parsed.suggestions) ? (parsed.suggestions as Record<string, unknown>[]) : [];

  for (const s of list) {
    const path = s.path as AiPath;
    const basis = typeof s.basis === 'string' && s.basis.length > 3 ? s.basis : null;
    if (!AI_PATHS.includes(path) || !basis) {
      dropped.push(`${String(s.path)}: not a whitelisted true input (or no stated basis)`);
      continue;
    }
    if (path === 'operations.growth') {
      const arr = Array.isArray(s.value) ? (s.value as unknown[]).map(Number) : null;
      if (!arr || arr.length !== assumptions.entry.hold_years || arr.some((x) => !Number.isFinite(x))) {
        dropped.push('operations.growth: needs a full per-year numeric array');
        continue;
      }
      const clamped = arr.map((x) => clamp(path, x));
      next = { ...next, operations: { ...next.operations, growth: clamped } };
      applied.push({ path, value: clamped, basis });
    } else {
      const v = Number(s.value);
      if (!Number.isFinite(v)) { dropped.push(`${path}: non-numeric`); continue; }
      const c = clamp(path, v);
      if (path === 'operations.target_margin') next = { ...next, operations: { ...next.operations, target_margin: c } };
      else if (path === 'operations.maint_capex_pct_revenue') next = { ...next, operations: { ...next.operations, maint_capex_pct_revenue: c } };
      else if (path === 'entry.entry_multiple') next = { ...next, entry: { ...next.entry, driver: 'multiple', entry_multiple: c, enterprise_value: null } };
      else if (path === 'exit.multiple') next = { ...next, exit: { ...next.exit, multiple: c } };
      else next = { ...next, structure: { ...next.structure, sweep: { ...next.structure.sweep, base_pct: c } } };
      applied.push({ path, value: c, basis: c === v ? basis : `${basis} (clamped from ${v} to the plausibility rail)` });
    }
    aiBasis[path] = { kind: 'ai', detail: applied[applied.length - 1].basis };
  }
  return { assumptions: next, aiBasis, applied, dropped };
}

export async function aiRefineAssumptions(
  facts: DealFacts,
  assumptions: DealAssumptions,
  missingFacts: string[],
  aiText: AiTextFn,
): Promise<AiSuggestResult> {
  const { system, user } = buildSuggestPrompt(facts, assumptions, missingFacts);
  return applyAiSuggestions(assumptions, await aiText(system, user));
}
