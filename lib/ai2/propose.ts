/**
 * lib/ai2/propose.ts — AI proposals for the inputs that have NO cited basis.
 *
 * The suggestion catalogue (lib/engine2/suggest.ts) proposes a value only where the filing or a
 * cited convention supports one. Every other blank number on the sheet is the analyst's judgement,
 * and this module asks the model on the analyst's own key to propose a starting value for each,
 * with its reasoning. The rules that keep that honest:
 *
 *   - A proposal is never applied. It lands in the suggestion catalogue with basis kind 'ai' and
 *     is shown grey in its cell until the analyst accepts it; Build stays gated until then.
 *   - A cited value always wins: a path the catalogue already covers is never asked about.
 *   - A fact the source lacked is never sent (the taint rule).
 *   - A value outside the plausibility rail for its unit is DROPPED, never clamped: a clamped
 *     number is a number nobody proposed.
 *
 * Two tiers. A paid key takes the whole sheet in one request and returns reasoning tied to the
 * company. A free key gives a small model and a tight limit, so the same request goes out in
 * small batches with one-line reasons; the values are more generic and the page says so.
 */

import type { DealAssumptions, DealFacts } from '../engine2/types';
import type { SuggestionCatalogue } from '../engine2/suggest';
import { labelFor, type MissingInput } from '../engine2/draft';
import { PROPOSAL_MODELS, PROVIDER_DEFAULTS, tierOf, type AIProvider, type AiTier } from './gateway/providers';
import { AiError, type AiChatFn } from './textCall';

export type ProposalUnit = 'pct' | 'money' | 'mult' | 'years' | 'days' | 'beta' | 'ratio';

/**
 * The unit of a numeric input, from its path. The sheet draws the same units (the two are pinned
 * together by a test), so a proposal is read in the unit the analyst sees.
 */
export function unitOf(path: string): ProposalUnit {
  const leaf = path.replace(/\.\d+$/, '').split('.').pop() ?? path;
  if (leaf === 'growth_capex' || leaf === 'delta_nwc_before_growth') return 'money';
  if (leaf === 'capex_pct_of_da' || leaf === 'priority' || /lines\.capex\.pct$/.test(path)) return 'ratio';
  if (leaf === 'asset_beta' || leaf === 'debt_beta') return 'beta';
  if (leaf === 'dso' || leaf === 'dio' || leaf === 'dpo') return 'days';
  if (/_years$/.test(leaf) || leaf === 'hold_years' || /selldown\.year$/.test(path) || /refinancing\.\d+\.year$/.test(path)) return 'years';
  if (leaf === 'entry_multiple' || leaf === 'multiple' || leaf === 'x_ebitda' || leaf === 'hurdle_moic' || leaf === 'above_net_leverage' || leaf === 'event_multiple'
    || /^covenants\.(leverage_max|dscr_min|fccr_min|springing\.max|rp_trap\.level)/.test(path)) return 'mult';
  if (/pct|rate|growth|margin|spread|floor|coupon|fee$|fraction|risk_free|mrp/.test(leaf) || /\.growth\.\d+$/.test(path) || leaf === 'commitment_fee') return 'pct';
  return 'money';
}

const UNIT_WORD: Record<ProposalUnit, string> = { pct: '%', money: 'm', mult: 'x', years: 'yrs', days: 'days', beta: 'beta', ratio: 'ratio' };

/** Plausibility rails, in the engine's own units (a rate is a decimal). Outside ⇒ dropped. */
function inRail(unit: ProposalUnit, v: number, facts: DealFacts): boolean {
  if (!Number.isFinite(v)) return false;
  if (unit === 'pct') return v >= -0.5 && v <= 1;
  if (unit === 'mult') return v >= 0 && v <= 40;
  if (unit === 'years') return Number.isInteger(v) && v >= 1 && v <= 40;
  if (unit === 'days') return v >= 0 && v <= 365;
  if (unit === 'beta') return v >= 0 && v <= 3;
  if (unit === 'ratio') return v >= 0 && v <= 10;
  // money, in the deal's millions: nothing larger than a generous multiple of the company itself
  const scale = Math.max(facts.fy_revenue ?? 0, (facts.fy_ebitda ?? 0) * 30, 1000);
  return Math.abs(v) <= scale * 20;
}

export interface ProposalField { path: string; label: string; unit: ProposalUnit }

/**
 * The inputs to ask about: every blank NUMBER the build is waiting for that the catalogue does not
 * already cover, that the analyst has not cleared, and that was not asked about before.
 */
export function proposalFields(
  missing: readonly MissingInput[],
  assumptions: DealAssumptions,
  catalogue: SuggestionCatalogue,
  skip: ReadonlySet<string>,
): ProposalField[] {
  const out: ProposalField[] = [];
  for (const m of missing) {
    if (m.path.startsWith('facts.') || skip.has(m.path)) continue;
    if (!Number.isNaN(valueAt(assumptions, m.path))) continue; // a choice, a mode or a group: not a number
    const parent = m.path.replace(/\.\d+$/, '');
    if (m.path in catalogue || (parent !== m.path && Array.isArray(catalogue[parent]?.value))) continue;
    out.push({ path: m.path, label: fieldLabel(m.path, assumptions), unit: unitOf(m.path) });
  }
  return out;
}

export function valueAt(node: unknown, path: string): unknown {
  let at: unknown = node;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/** A label the model can act on: a facility's own name in place of its position in the list. */
function fieldLabel(path: string, a: DealAssumptions): string {
  const t = /^structure\.tranches\.(\d+)\.(.+)$/.exec(path);
  if (t) {
    const tranche = a.structure.tranches[Number(t[1])];
    return `${tranche?.name ?? `Facility ${Number(t[1]) + 1}`} (${tranche?.type ?? 'debt'}): ${t[2].replace(/[._]/g, ' ')}`;
  }
  return labelFor(path);
}

const show = (v: number, unit: ProposalUnit): string => (unit === 'pct' ? `${+(v * 100).toFixed(2)}%` : unit === 'mult' ? `${+v.toFixed(2)}x` : `${+v.toFixed(2)}${unit === 'money' ? 'm' : unit === 'years' ? ' yrs' : unit === 'days' ? ' days' : ''}`);

/** Everything the model may know about the deal: filed facts (never a missing one), the history,
 *  what the analyst has entered, and the cited values already on offer. */
export function dealContext(facts: DealFacts, assumptions: DealAssumptions, missingFacts: readonly string[], catalogue: SuggestionCatalogue, tier: AiTier): string {
  const f = facts as unknown as Record<string, unknown>;
  const factKeys: [string, string, ProposalUnit][] = [
    ['fy_revenue', 'Revenue', 'money'], ['fy_ebitda', 'EBITDA', 'money'], ['fy_ebitda_margin', 'EBITDA margin', 'pct'],
    ['da_pct_revenue', 'D&A / revenue', 'pct'], ['maint_capex_pct_revenue', 'Capex / revenue', 'pct'],
    ['nwc_pct_revenue', 'Operating NWC / revenue', 'pct'], ['dso', 'DSO', 'days'], ['dio', 'DIO', 'days'], ['dpo', 'DPO', 'days'],
    ['net_debt', 'Net debt', 'money'], ['gross_debt', 'Gross debt', 'money'], ['cash', 'Cash', 'money'],
    ['effective_tax_rate', 'Effective tax rate', 'pct'], ['implied_cost_of_debt', 'Implied cost of debt', 'pct'],
    ['implied_trading_ev_ebitda', 'Trading EV / EBITDA', 'mult'],
  ];
  const factLines = factKeys
    .filter(([k]) => typeof f[k] === 'number' && Number.isFinite(f[k] as number) && !missingFacts.includes(k)) // taint rule
    .map(([k, label, unit]) => `${label}: ${show(f[k] as number, unit)}`);
  const history = facts.history.slice(tier === 'free' ? -4 : -8)
    .map((h) => `${h.period_end}: revenue ${h.revenue ?? 'n/a'}, EBITDA ${h.ebitda ?? 'n/a'}`);

  const entered: string[] = [];
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === 'number') { if (Number.isFinite(node) && prefix !== 'entry.hold_years') entered.push(`${fieldLabel(prefix, assumptions)}: ${show(node, unitOf(prefix))}`); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${prefix}.${i}`)); return; }
    if (node !== null && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(assumptions, '');

  const cited: string[] = [];
  for (const [path, s] of Object.entries(catalogue)) {
    if (s.basis.kind === 'ai') continue;
    if (typeof s.value === 'number') cited.push(`${fieldLabel(path, assumptions)}: ${show(s.value, unitOf(path))}`);
    else if (Array.isArray(s.value) && typeof s.value[0] === 'number') cited.push(`${fieldLabel(path, assumptions)}: ${show(s.value[0] as number, unitOf(path))} a year`);
  }
  const cap = tier === 'free' ? 14 : 60;
  const debt = assumptions.structure.tranches.map((t) => `${t.name} (${t.type})`).join(', ');
  return [
    `Company: ${facts.entity_name}. Sector: ${facts.sector}. Figures in ${facts.currency} millions.${facts.fiscal_year ? ` Latest year: FY${facts.fiscal_year}${facts.sizing_basis === 'LTM' ? ' (sizing on LTM)' : ''}.` : ' No historical year: a forecast-only case.'}`,
    `Holding period: ${assumptions.entry.hold_years} years.${debt ? ` Debt facilities: ${debt}.` : ''}`,
    factLines.length ? `Filed figures:\n${factLines.join('\n')}` : '',
    history.length ? `History:\n${history.join('\n')}` : '',
    entered.length ? `Already entered by the analyst:\n${entered.slice(0, cap).join('\n')}` : '',
    cited.length ? `Sourced values on offer for other inputs (stay consistent with them):\n${cited.slice(0, cap).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function proposalPrompt(context: string, fields: readonly ProposalField[], tier: AiTier, today: string): { system: string; user: string } {
  const why = tier === 'full'
    ? '"w" is two short sentences a sceptical finance professor would accept: first the figure it rests on (this company\'s own history where there is one, otherwise its sector, otherwise the market convention for a buyout of this size), then the judgement applied and what would change it.'
    : '"w" is one short sentence naming what the value rests on.';
  return {
    system: [
      'You assist a private-equity analyst who is filling the input sheet of a leveraged buyout model. The analyst builds the model; you propose a starting value for each input listed, which the analyst will accept, edit or reject.',
      `Anchor each value first on this company's own filed history, then on its sector, then on market convention for a buyout of this size as of ${today}. Keep the proposals consistent with one another, with the values already entered and with the sourced values on offer. A by-year input should follow a sensible path across the years, not one number repeated without reason.`,
      'Reply with STRICT JSON only, no prose before or after and no code fence: {"s":[{"p":"<the input\'s path exactly as given>","v":<number>,"w":"<why>"}]}',
      'Units: for an input marked % give the percentage number (5.5 means 5.5%); x is a multiple; m is millions in the deal currency; yrs is whole years; days is days; beta and ratio are plain numbers.',
      why,
      'If you cannot defend a value for an input, leave that input out. Never invent a fact about the company. Write plainly, with no dashes used as punctuation.',
    ].join('\n'),
    user: `${context}\n\nInputs to propose (path | what it is | unit):\n${fields.map((f) => `${f.path} | ${f.label} | ${UNIT_WORD[f.unit]}`).join('\n')}`,
  };
}

export interface ParsedProposals { proposals: SuggestionCatalogue; dropped: string[] }

/** Read the model's reply. Anything not asked for, not a number, or outside its rail is dropped. */
export function parseProposals(raw: string, fields: readonly ProposalField[], facts: DealFacts, by: string): ParsedProposals {
  const proposals: SuggestionCatalogue = {};
  const dropped: string[] = [];
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  let list: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { s?: unknown; suggestions?: unknown };
    const s = parsed.s ?? parsed.suggestions;
    if (Array.isArray(s)) list = s as Record<string, unknown>[];
  } catch {
    // a reply cut off mid-list still holds whole entries: keep those
    const re = /\{\s*"p"\s*:\s*"([^"]+)"\s*,\s*"v"\s*:\s*(-?[\d.]+(?:e-?\d+)?)\s*,\s*"w"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
    for (let m = re.exec(raw); m; m = re.exec(raw)) list.push({ p: m[1], v: Number(m[2]), w: m[3].replace(/\\"/g, '"') });
    if (list.length === 0) return { proposals, dropped: ['the reply could not be read'] };
  }
  const byPath = new Map(fields.map((f) => [f.path, f]));
  for (const item of list) {
    const field = byPath.get(String(item.p ?? item.path));
    if (!field) { dropped.push(`${String(item.p)}: not an input that was asked about`); continue; }
    const shown = typeof item.v === 'number' ? item.v : Number(String(item.v ?? item.value).replace(/[%xm,\s]/g, ''));
    if (!Number.isFinite(shown)) { dropped.push(`${field.label}: not a number`); continue; }
    const value = field.unit === 'pct' ? Math.round(shown * 1e6) / 1e8 : field.unit === 'years' ? Math.round(shown) : shown;
    if (!inRail(field.unit, value, facts)) { dropped.push(`${field.label}: ${shown} is outside what is plausible for this input`); continue; }
    let why = String(item.w ?? item.basis ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ').trim();
    if (why.length < 4) { dropped.push(`${field.label}: no reasoning given`); continue; }
    why = why[0].toUpperCase() + why.slice(1);
    if (!/[.!?]$/.test(why)) why += '.';
    proposals[field.path] = { value, basis: { kind: 'ai', detail: `${why} Source: ${by}` } };
  }
  return { proposals, dropped };
}

export interface ProposeProgress { proposals: SuggestionCatalogue; done: number; total: number }
export interface ProposeResult { proposals: SuggestionCatalogue; asked: string[]; dropped: string[]; stopped: string | null; tier: AiTier }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Who proposed a value, in the words the pop-up shows. */
export const proposedBy = (provider: AIProvider): string => {
  const who = PROVIDER_DEFAULTS[provider].displayName.replace(/\s*\(.*\)$/, '');
  return tierOf(provider) === 'free'
    ? `a free-tier model from ${who} on your key. Treat it as a generic starting point.`
    : `${who}'s model on your key.`;
};

/**
 * Ask for the fields, in one request on a paid key and in small batches on a free one. Whatever
 * arrives is handed to `onProgress` at once, so the sheet fills in as the answers come. A limit
 * with a short wait is waited out once; anything else stops the run and keeps what arrived.
 */
export async function proposeValues(p: {
  facts: DealFacts; assumptions: DealAssumptions; missingFacts: readonly string[]; catalogue: SuggestionCatalogue;
  fields: readonly ProposalField[]; provider: AIProvider; chat: AiChatFn; today: string;
  onProgress?: (x: ProposeProgress) => void; wait?: (ms: number) => Promise<void>;
}): Promise<ProposeResult> {
  const tier = tierOf(p.provider);
  const size = tier === 'free' ? 12 : 80;
  const batches: ProposalField[][] = [];
  for (let i = 0; i < p.fields.length; i += size) batches.push(p.fields.slice(i, i + size));
  const context = dealContext(p.facts, p.assumptions, p.missingFacts, p.catalogue, tier);
  const by = proposedBy(p.provider);
  const wait = p.wait ?? sleep;
  const all: SuggestionCatalogue = {};
  const asked: string[] = [];
  const dropped: string[] = [];
  let stopped: string | null = null;
  let done = 0;
  for (const batch of batches) {
    const { system, user } = proposalPrompt(context, batch, tier, p.today);
    const opts = { maxTokens: Math.min(tier === 'free' ? 1100 : 12000, 250 + batch.length * (tier === 'free' ? 70 : 130)), temperature: 0.2, models: PROPOSAL_MODELS[p.provider], effort: 'medium' as const };
    let raw: string | null = null;
    for (let attempt = 0; attempt < 2 && raw === null; attempt++) {
      try { raw = await p.chat(system, [{ role: 'user', content: user }], opts); }
      catch (e: unknown) {
        const err = e as AiError;
        if (attempt === 0 && err.kind === 'limit' && err.retryAfterSeconds !== null && err.retryAfterSeconds <= 40) { await wait((err.retryAfterSeconds + 1) * 1000); continue; }
        stopped = err.message ?? 'The AI request failed.';
        break;
      }
    }
    if (raw === null) break;
    const parsed = parseProposals(raw, batch, p.facts, by);
    Object.assign(all, parsed.proposals);
    dropped.push(...parsed.dropped);
    asked.push(...batch.map((f) => f.path));
    done += batch.length;
    p.onProgress?.({ proposals: parsed.proposals, done, total: p.fields.length });
  }
  return { proposals: all, asked, dropped, stopped, tier };
}
