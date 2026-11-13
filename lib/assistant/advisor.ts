/**
 * lib/assistant/advisor.ts — what the assistant says on each step, worked out from the model's own
 * state by plain rules. No AI call is made here and no figure is invented: a value on offer is a
 * proposal already in the suggestion catalogue (a filing figure or a cited source), a figure the
 * filing itself reports, or a number read off the built model.
 *
 * Each step follows the order an analyst works in. The first thing not yet done is the "next"
 * move; when the analyst is inside a field, the move after that field is the one predicted.
 * Pure functions: the same state always gives the same advice.
 */
import { labelFor, type MissingInput } from '../engine2/draft';
import type { Suggestion, SuggestionCatalogue } from '../engine2/suggest';
import type { DealAssumptions } from '../engine2/types';
import type { Engine2ModelOutput } from '../engine2/facade';
import { headlineNotMeaningful } from '../engine2/display';
import { headlineOf } from '../analysis';
import { money, multiple, num, pct, toPctInput, type Engine2Currency } from '../format';
import type { AdjustmentCandidate, StatementPack } from '../statements/types';
import type { Adjustment, CleaningFlag, CleaningLedger } from '../cleaning/types';
import { candidateAccepted } from '../cleaning/ops';
import { periodLabel } from '../cleaning/apply';
import { CLEAN_NOTES, noteFor } from './guidance';
import type { Advice, AssistItem, Rationale } from './types';

// ── wording shared by every step ─────────────────────────────────────────────────────────────

const BASIS_WORD: Record<string, string> = {
  facts: 'Read from the source',
  history: 'Worked out from the filing history',
  convention: 'A cited market convention or statute',
  template: 'A cited template',
  ai: 'Proposed by the AI model you connected',
};

const WORD: Record<string, string> = { fy: 'the historical year', ntm: 'forecast year 1', ebitda: 'EBITDA', ebit: 'EBIT', days: 'days', pct: 'share of revenue' };

const TRANCHE_FIELD: [RegExp, string][] = [
  [/\.pricing\.base_rate$/, 'base rate'], [/\.pricing\.spread$/, 'spread'], [/\.pricing\.floor$/, 'floor'], [/\.pricing\.(rate|fixed_rate)$/, 'fixed rate'],
  [/\.maturity_years$/, 'maturity'], [/\.amort_pct_of_face$/, 'amortization'], [/\.oid_pct$/, 'OID'], [/\.size\.x_ebitda$/, 'size'], [/\.size\.amount$/, 'size'],
  [/\.cash_coupon$/, 'cash coupon'], [/\.pik_coupon$/, 'PIK coupon'], [/\.sweep\.priority$/, 'sweep priority'], [/\.sweep\.participates$/, 'takes the sweep'],
  [/\.commitment_fee(_pct)?$/, 'commitment fee'], [/\.commitment(\.(x_ebitda|amount))?$/, 'commitment'],
];

/** Proposals that fill several inputs at once have a name of their own. */
const GROUP_TITLE: Record<string, string> = {
  'tax.s163j': 'Interest deduction cap', 'operations.nwc': 'Working capital', 'operations.nwc.method': 'Working capital', 'mip': 'Management promote',
  'structure.tranches': 'Debt structure',
};

/** An input's name as a person would say it ("TLB: base rate", "Revenue growth by year"). */
export function fieldTitle(path: string, assumptions: DealAssumptions | null): string {
  const tr = /^structure\.tranches\.(\d+)(\..+)$/.exec(path);
  if (tr) {
    const name = assumptions?.structure.tranches[Number(tr[1])]?.name || `Facility ${Number(tr[1]) + 1}`;
    const field = TRANCHE_FIELD.find(([re]) => re.test(tr[2]));
    if (field) return `${name}: ${field[1]}`;
  }
  if (GROUP_TITLE[path]) return GROUP_TITLE[path];
  // the engine's label, without the bracketed aside that only matters on the sheet
  const label = labelFor(path).replace(/\s*\([^)]*\)\s*$/, '');
  // an input the engine has no label for is never shown as its internal name
  if (label !== path) return label;
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? path;
  return sentence(last.replace(/_/g, ' ')).replace(/\.$/, '');
}

/** A proposed value as the page would show it, or null when it has no short form. */
export function valueText(path: string, v: unknown, ccy: Engine2Currency): string | null {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string') return WORD[v] ?? v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (/(hold_years|maturity_years)$/.test(path)) return `${v} years`;
    if (/(multiple|x_ebitda|hurdle_moic|leverage_max|springing\.max|capex_pct_of_da)$/.test(path)) return multiple(v, /capex_pct_of_da$/.test(path) ? 2 : 1);
    if (/\.(dso|dio|dpo)$/.test(path)) return `${num(v, 0)} days`;
    if (/(acquired_opening|min_cash|rollover_equity|enterprise_value)$/.test(path)) return money(v, ccy, 1);
    return `${toPctInput(v)}%`;
  }
  if (Array.isArray(v)) {
    const nums = v.filter((x): x is number => typeof x === 'number');
    if (nums.length !== v.length || nums.length === 0) return null;
    return nums.every((x) => x === nums[0]) ? `${toPctInput(nums[0])}% a year` : 'a value for each year';
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (path === 'structure.tranches') return null;
    if (o.method === 'days') return `${num(o.dso as number, 0)} / ${num(o.dio as number, 0)} / ${num(o.dpo as number, 0)} days`;
    if (o.method === 'pct') return `${toPctInput(o.pct_revenue as number)}% of revenue`;
    if (typeof o.ati_pct === 'number') return `${toPctInput(o.ati_pct)}% of ${WORD[String(o.ati_basis)] ?? 'ATI'}`;
    if (typeof o.pool_pct === 'number' && typeof o.hurdle_moic === 'number') return `${toPctInput(o.pool_pct)}% above ${multiple(o.hurdle_moic, 1)}`;
  }
  return null;
}

/** Group proposals that fill several inputs at once, keyed by the path they sit under. */
const GROUP_KEYS = ['operations.growth', 'operations.nwc', 'tax.s163j', 'mip'];

/** The catalogue key that offers a value for an input, or null. */
export function suggestionKeyFor(path: string, catalogue: SuggestionCatalogue): string | null {
  if (path in catalogue) return path;
  const group = GROUP_KEYS.find((g) => path === g || path.startsWith(`${g}.`));
  // a group proposal serves its members only while no member has a proposal of its own
  return group && group in catalogue ? group : null;
}

function splitDetail(detail: string): { how: string; source?: string } {
  const [how, source] = detail.split(/\s*Source:\s*/);
  return { how: sentence(how), source: source?.trim() || undefined };
}
const sentence = (s: string) => { const t = s.trim(); return t === '' ? t : `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`; };

function fieldNotes(path: string): Rationale['notes'] {
  const n = noteFor(path);
  if (!n) return [];
  return [
    { heading: 'What it is', text: n.what },
    { heading: 'How it is usually set', text: n.how },
    ...(n.watch ? [{ heading: 'What to watch', text: n.watch }] : []),
  ];
}

/** How a proposal was reached, in the parts a reader checks. */
export function rationaleFor(path: string, sug: Suggestion, assumptions: DealAssumptions | null, ccy: Engine2Currency): Rationale {
  const { how, source } = splitDetail(sug.basis.detail);
  return {
    subject: fieldTitle(path, assumptions),
    value: valueText(path, sug.value, ccy) ?? undefined,
    basis: BASIS_WORD[sug.basis.kind] ?? sug.basis.kind,
    how,
    source,
    notes: fieldNotes(path),
  };
}

/** What the assistant can say about an input that has no proposal. */
function unsourced(path: string, assumptions: DealAssumptions | null): Rationale | undefined {
  const notes = fieldNotes(path);
  if (!notes.length) return undefined;
  return {
    subject: fieldTitle(path, assumptions),
    basis: 'No sourced value is held for this input',
    how: 'Neither the filing nor a cited market source gives a figure for it, so nothing is proposed. The notes below say where the number usually comes from.',
    notes,
  };
}

/** A flag's opening words as a title: the list shows what each one is about, not "a flag". */
const gist = (message: string): string => {
  const first = message.split(/(?<=[.:;])\s/)[0].replace(/[.:;]$/, '');
  return first.length > 78 ? `${first.slice(0, 76).trimEnd()}…` : first;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Assumptions ──────────────────────────────────────────────────────────────────────────────

export interface AssumptionsState {
  assumptions: DealAssumptions | null;
  /** The build gate's list, in sheet order. */
  blanks: MissingInput[];
  /** Figures the source lacks that the analyst must confirm before anything else. */
  missingFacts: string[];
  suggestions: SuggestionCatalogue;
  currency: Engine2Currency;
  /** The input the analyst is in, or null. */
  focusPath: string | null;
  /** The live run on the inputs as they stand: null while any input is blank. */
  live: { ok: true; flags: { severity: string; message: string }[] } | { ok: false; reason: string } | null;
  /** Which section an input belongs to, and the section's title. */
  sectionOf: (path: string) => string;
  sectionTitle: (id: string) => string;
  /** The sheet's sections, top to bottom. */
  sectionOrder: string[];
}

/** The order inputs sit in on the sheet, within a section: the order an analyst meets them. */
const SHEET_ORDER = [
  'entry.entry_multiple', 'entry.enterprise_value', 'entry.basis', 'exit.multiple', 'exit.basis', 'exit.fees_pct', 'fees.transaction', 'fees.financing', 'rollover_equity',
  'structure.tranches', 'structure.sweep', 'structure.min_cash',
  'operations.lines', 'operations.growth.', 'operations.growth', 'operations.target_margin', 'operations.margin_path', 'operations.da', 'operations.maint', 'operations.growth_capex', 'operations.nwc',
  'tax.rate', 'tax.interest', 'tax.s163j', 'tax.nol', 'tax.minimum',
];
function inSheetOrder(rows: string[], s: Pick<AssumptionsState, 'sectionOf' | 'sectionOrder'>): string[] {
  const rank = (p: string) => { const i = SHEET_ORDER.findIndex((k) => p === k || p.startsWith(k)); return i < 0 ? SHEET_ORDER.length : i; };
  const section = (p: string) => { const i = s.sectionOrder.indexOf(s.sectionOf(p)); return i < 0 ? s.sectionOrder.length : i; };
  return rows.map((p, i) => ({ p, i })).sort((a, b) => section(a.p) - section(b.p) || rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/** A per-year line counts once: the analyst fills a row, not a cell. */
const rowOf = (path: string): string => {
  const m = /^(operations\.(growth|growth_capex))\.\d+$/.exec(path);
  return m ? m[1] : path;
};

function inputItem(path: string, s: AssumptionsState, tone: AssistItem['tone']): AssistItem {
  const key = suggestionKeyFor(path, s.suggestions);
  const title = fieldTitle(path, s.assumptions);
  if (key) {
    const sug = s.suggestions[key];
    const why = rationaleFor(key, sug, s.assumptions, s.currency);
    return {
      id: `in:${path}`, tone, title: key === path ? title : why.subject, value: why.value, body: why.how, why,
      actions: [{ kind: 'accept', key, label: why.value ? `Use ${why.value}` : 'Use the proposal' }, { kind: 'jump', path, label: 'Show the field' }],
    };
  }
  const why = unsourced(path, s.assumptions);
  return {
    id: `in:${path}`, tone, title, why,
    body: noteFor(path)?.how ?? 'No sourced value is held for this input. It is yours to enter.',
    actions: [{ kind: 'jump', path, label: 'Show the field' }],
  };
}

export function adviseAssumptions(s: AssumptionsState): Advice {
  // the holding period opens the sheet: nothing else exists until it is entered
  if (s.assumptions === null) {
    const key = suggestionKeyFor('entry.hold_years', s.suggestions);
    const next = inputItem('entry.hold_years', s, 'next');
    return {
      status: 'The sheet opens once the holding period is entered',
      here: null,
      next: { ...next, title: 'Start with the holding period', body: key ? next.body : 'It sets the length of every yearly line, so it comes first.' },
      more: [],
    };
  }

  const rows = inSheetOrder([...new Set(s.blanks.map((b) => rowOf(b.path)))].filter((p) => !p.startsWith('facts.')), s);
  const focusRow = s.focusPath ? rowOf(s.focusPath) : null;
  const here = focusRow && (noteFor(focusRow) || suggestionKeyFor(focusRow, s.suggestions)) ? { ...inputItem(focusRow, s, 'info'), id: `here:${focusRow}` } : null;
  // the analyst is already in the field: there is nowhere to be shown
  if (here) here.actions = here.actions.filter((a) => a.kind !== 'jump');
  // an input that is already entered is explained, not offered again
  if (here && !rows.includes(focusRow!)) { here.actions = []; here.value = undefined; here.body = noteFor(focusRow!)?.what ?? here.body; here.why = unsourced(focusRow!, s.assumptions); }

  if (s.missingFacts.length > 0) {
    return {
      status: `${plural(s.missingFacts.length, 'figure')} the source lacks`,
      here,
      next: { id: 'facts', tone: 'check', title: 'Confirm the figures the source lacks', body: 'The source does not give them, and nothing is assumed in their place. Enter each one at the top of the sheet; the return appears once the inputs below are complete too.', actions: [{ kind: 'jump', path: 'section:transaction', label: 'Go to the top of the sheet' }] },
      more: [],
    };
  }

  if (rows.length === 0) {
    const checks: AssistItem[] = s.live?.ok
      ? s.live.flags.map((f, i) => ({ id: `flag:${i}`, tone: 'check' as const, title: gist(f.message), body: f.message, actions: [] }))
      : [];
    const stuck = s.live && !s.live.ok ? s.live.reason : null;
    return {
      status: stuck ? 'One input stops the run' : 'Every input is entered',
      here,
      next: stuck
        ? { id: 'stuck', tone: 'check', title: 'The model cannot run on these inputs', body: stuck, actions: [] }
        : { id: 'build', tone: 'next', title: 'Build the model', body: checks.length ? `Every input is entered. The run on these inputs raises ${plural(checks.length, 'point')} listed below; you can build and read them in full on Results.` : 'Every input is entered and the run raises nothing to check.', actions: [{ kind: 'build', label: 'Build model' }] },
      more: checks,
      moreLabel: 'Raised by the run on these inputs',
    };
  }

  // the move after the field in hand, when the analyst is in one; otherwise the first blank
  const at = focusRow ? rows.indexOf(focusRow) : -1;
  const nextRow = at >= 0 ? rows[at + 1] ?? rows.find((r) => r !== focusRow) ?? null : rows[0];
  const next = nextRow ? inputItem(nextRow, s, 'next') : null;
  const rest = rows.filter((r) => r !== nextRow && r !== focusRow);
  const offers = rest.filter((r) => suggestionKeyFor(r, s.suggestions)).map((r) => inputItem(r, s, 'offer'));
  const yours = rest.filter((r) => !suggestionKeyFor(r, s.suggestions)).map((r) => inputItem(r, s, 'info'));
  const sourced = rows.filter((r) => suggestionKeyFor(r, s.suggestions)).length;
  const where = nextRow ? s.sectionTitle(s.sectionOf(nextRow)) : null;
  return {
    // the count is the build gate's own, so it always matches the figure beside the Build button
    status: `${plural(s.blanks.length, 'input')} still blank${sourced ? `, and a sourced value is ready for ${plural(sourced, 'line')} of them` : ''}${where ? `. Next is in ${where}` : ''}`,
    here,
    next,
    more: [...offers, ...yours],
  };
}

// ── Clean ────────────────────────────────────────────────────────────────────────────────────

export interface CleanState {
  pack: StatementPack;
  ledger: CleaningLedger;
  flags: CleaningFlag[];
  dismissed: string[];
}

const LEASE_WORD = { none: 'no leases', finance: 'finance leases only', all: 'all leases' } as const;

function leaseItem(pack: StatementPack, message: string): AssistItem {
  const choice = pack.gaap === 'us-gaap' ? 'finance' : pack.gaap === 'ifrs' ? 'all' : null;
  const framework = pack.gaap === 'us-gaap' ? 'US GAAP' : pack.gaap === 'ifrs' ? 'IFRS' : null;
  const how = choice === 'finance'
    ? 'These are US GAAP figures. Operating lease rent is already deducted in EBITDA, so counting those leases as debt as well would charge the same cost twice. Finance leases are debt in both frameworks.'
    : choice === 'all'
      ? 'These are IFRS figures. EBITDA is before lease cost, so the lease liabilities have to sit in debt for the price and the leverage to be consistent.'
      : 'The source does not say which accounting framework the figures follow, so no option is proposed. Match the choice to how rent is treated in the EBITDA you entered.';
  const why: Rationale = {
    subject: 'Leases in net debt', value: choice ? sentence(LEASE_WORD[choice]).replace(/\.$/, '') : undefined,
    basis: framework ? `Follows from the accounting framework of the source (${framework})` : 'No option is proposed', how,
    notes: [{ heading: 'The rule', text: CLEAN_NOTES.leases.text }],
  };
  return {
    id: 'lease', tone: 'check', title: 'Choose how leases count in net debt', value: why.value, body: choice ? how : message, why,
    actions: choice ? [{ kind: 'lease', choice, label: `Use ${LEASE_WORD[choice]}` }] : [],
  };
}

function candidateItem(c: AdjustmentCandidate, pack: StatementPack): AssistItem {
  const periods = Object.keys(c.amounts).sort();
  const latest = periods[periods.length - 1];
  const each = periods.map((p) => `${periodLabel(pack, p)} ${num(c.amounts[p], 1)}`).join(', ');
  const note = CLEAN_NOTES[c.category];
  const target = c.bridge === 'ebitda' ? 'the EBITDA bridge' : 'the net debt bridge';
  // an item whose last amount is before the latest filed year changes the history, not the year
  // the deal is sized on: said plainly, so an old charge is not mistaken for a current one
  const old = c.bridge === 'ebitda' && latest !== undefined && pack.anchor !== null && latest < pack.anchor
    ? ` Its last amount is in ${periodLabel(pack, latest)}, before the latest filed year, so it changes the history and not the year the deal is sized on.`
    // the model reads the sizing period; a filing tags these items by fiscal year only
    : c.bridge === 'ebitda' && pack.sizing !== null && !(pack.sizing in c.amounts)
      ? ` The model reads ${periodLabel(pack, pack.sizing)} and the filing gives this by fiscal year, so after adding it you enter the amount for that period yourself.` : '';
  const why: Rationale = {
    subject: c.label, value: latest ? `${num(c.amounts[latest], 1)} in ${periodLabel(pack, latest)}` : undefined,
    basis: 'Reported in the filing',
    how: sentence(`${c.rationale.replace(/\.$/, '')}. The filing reports: ${each}`),
    source: `the filing’s tagged line ${c.tag}`,
    notes: [
      ...(note ? [{ heading: note.title, text: note.text }] : []),
      ...(c.caveat ? [{ heading: 'Before you add it', text: c.caveat }] : []),
    ],
  };
  return {
    id: `cand:${c.id}`, tone: 'offer', title: c.label, value: why.value, body: `${c.rationale}${c.caveat ? ` ${c.caveat}` : ''}${old}`, why,
    actions: [{ kind: 'candidate', id: c.id, label: `Add to ${target}` }, { kind: 'dismiss', id: c.id, label: 'Set aside' }],
  };
}

/** Whether a kind of cost usually stops with the deal. Kinds that depend on the case get no proposal. */
const STOPS: Record<string, 'gone' | 'continues'> = {
  impairment: 'gone', non_recurring: 'gone', restructuring: 'gone', litigation: 'gone', transaction_costs: 'gone',
  sbc: 'continues', run_rate: 'continues',
};

function forecastItem(a: Adjustment): AssistItem {
  const name = a.label.trim() || 'this adjustment';
  const choice = STOPS[a.category] ?? null;
  const note = CLEAN_NOTES[a.category];
  const how = choice === 'gone'
    ? 'A cost of this kind is a one-off: it is added back for the price and it is not expected again, so the forecast margin starts without it.'
    : choice === 'continues'
      ? 'A cost of this kind is added back for the price by convention, but the business keeps paying it. Marked as continuing, it stays in the forecast, so the model does not start from a margin the company has not reached.'
      : 'Whether this cost comes back depends on the case, so no answer is proposed. If the business will keep paying it, mark it as continuing.';
  const value = choice === 'gone' ? 'It stops' : choice === 'continues' ? 'It continues' : undefined;
  const why: Rationale = {
    subject: `${name}: does it stop or continue?`, value,
    basis: choice ? 'Follows from the kind of adjustment' : 'No answer is proposed', how,
    notes: [
      ...(note ? [{ heading: note.title, text: note.text }] : []),
      { heading: 'What the choice does', text: 'Either way the amount is added back to the EBITDA the deal is priced and levered on. Only a cost that stops is also left out of the forecast.' },
    ],
  };
  return {
    id: `forecast:${a.id}`, tone: 'check', title: `Does “${name}” stop or continue after the deal?`, value, body: how, why,
    actions: choice
      ? [{ kind: 'forecast', id: a.id, choice, label: choice === 'gone' ? 'Mark as stopping' : 'Mark as continuing' }, { kind: 'forecast', id: a.id, choice: choice === 'gone' ? 'continues' : 'gone', label: choice === 'gone' ? 'It continues' : 'It stops' }]
      : [{ kind: 'forecast', id: a.id, choice: 'gone', label: 'It stops' }, { kind: 'forecast', id: a.id, choice: 'continues', label: 'It continues' }],
  };
}

const FLAG_TITLE: Record<string, string> = {
  adjustment_amount: 'An amount is missing', net_debt_amount: 'An amount is missing', adjustment_label: 'An adjustment has no name', net_debt_label: 'An item has no name',
  override_reason: 'A restated figure needs a reason', adjustment_no_base: 'The source gives no figure to adjust', net_debt_base: 'Net debt cannot be worked out',
};

export function adviseClean(s: CleanState): Advice {
  if (s.ledger.as_reported) {
    return {
      status: 'The figures are used as reported',
      here: null,
      next: { id: 'continue', tone: 'next', title: 'Continue to Assumptions', body: 'You chose to model the figures exactly as sourced. Your adjustments are kept and not applied; you can switch back at any time.', actions: [{ kind: 'go', step: 'assumptions', label: 'Go to Assumptions' }] },
      more: [],
    };
  }
  const blocks = s.flags.filter((f) => f.severity === 'block');
  const warns = s.flags.filter((f) => f.severity !== 'block');
  const ltm = s.pack.periods.find((p) => p.key === s.pack.sizing)?.kind === 'LTM';
  const open: AssistItem[] = [
    ...blocks.filter((f) => f.code !== 'forecast_choice').map((f, i) => f.code === 'lease_choice'
      ? leaseItem(s.pack, f.message)
      : {
        id: `block:${f.code}:${i}`, tone: 'check' as const, title: FLAG_TITLE[f.code] ?? gist(f.message),
        body: f.code === 'adjustment_amount' && ltm ? `${f.message} Filings tag these items by fiscal year, so take the amount from the latest quarterly reports. If nothing of the kind fell in that period, enter 0 in the bridge.` : f.message,
        actions: [],
      }),
    // each adjustment that still needs its answer, with the usual one for its kind
    ...s.ledger.adjustments.filter((a) => a.included && a.target === 'ebitda' && a.forecast === null).map(forecastItem),
  ];
  // the items that reach the latest year come first: they are the ones that move the price basis
  const lastPeriod = (c: AdjustmentCandidate) => Object.keys(c.amounts).sort().pop() ?? '';
  const pending = s.pack.candidates
    .filter((c) => !candidateAccepted(s.ledger, c) && !s.dismissed.includes(c.id))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.bridge === b.c.bridge ? lastPeriod(b.c).localeCompare(lastPeriod(a.c)) || a.i - b.i : a.c.bridge === 'ebitda' ? -1 : 1))
    .map(({ c }) => candidateItem(c, s.pack));
  const notes: AssistItem[] = warns.map((f, i) => ({ id: `warn:${f.code}:${i}`, tone: 'info' as const, title: gist(f.message), body: f.message, actions: [] }));

  if (open.length > 0) {
    return { status: `${plural(open.length, 'item')} to settle before you continue`, here: null, next: open[0], more: [...open.slice(1), ...pending, ...notes] };
  }
  if (pending.length > 0) {
    return {
      status: `Nothing blocks the step. The filing reports ${plural(pending.length, 'item')} you may want in the bridges`,
      here: null, next: { ...pending[0], tone: 'next' }, more: [...pending.slice(1), ...notes],
    };
  }
  return {
    status: 'Nothing is open',
    here: null,
    next: { id: 'continue', tone: 'next', title: 'Continue to Assumptions', body: 'Every item the filing reports has been added or set aside, and nothing blocks the step. The model will read the adjusted figures shown at the top of the page.', actions: [{ kind: 'continue', label: 'Continue with adjusted figures' }] },
    more: notes,
  };
}

// ── Results ──────────────────────────────────────────────────────────────────────────────────

export interface ResultsState {
  output: Engine2ModelOutput;
  currency: Engine2Currency;
  /** Cases the analyst has saved for this deal. */
  casesSaved: number;
}

export function adviseResults(s: ResultsState): Advice {
  const o = s.output;
  const ccy = s.currency;
  const head = headlineOf(o);
  const blocks = o.coherence.filter((f) => f.severity === 'block');
  const warns = o.coherence.filter((f) => f.severity !== 'block');
  const flagItems: AssistItem[] = [...blocks, ...warns].map((f, i) => ({
    id: `flag:${i}`, tone: 'check' as const, title: gist(f.message), body: f.message, actions: [{ kind: 'go' as const, step: 'assumptions' as const, label: 'Edit assumptions' }],
  }));

  // where the gain comes from: the largest of the three bars the Returns view draws
  const bars = [
    { name: 'EBITDA growth', v: o.bridge.ebitda_growth_at_entry_multiple },
    { name: 'the change in multiple', v: o.bridge.multiple_change_bar },
    { name: 'debt paydown', v: o.bridge.net_debt_paydown },
  ];
  let top = bars[0];
  for (const b of bars) if (b.v > top.v) top = b;
  const drivers: AssistItem = {
    id: 'drivers', tone: 'info', title: 'Where the return comes from',
    body: `The largest part of the equity gain is ${top.name}, ${money(top.v, ccy, 0)}. EBITDA growth gives ${money(bars[0].v, ccy, 0)}, the change in multiple ${money(bars[1].v, ccy, 0)} and debt paydown ${money(bars[2].v, ccy, 0)}.`,
    actions: [{ kind: 'view', view: 'returns', label: 'Open Returns' }],
  };
  const cash: AssistItem = {
    id: 'cash', tone: 'info', title: 'The tightest point',
    body: `The lowest cash balance in the hold is ${money(head.min_cash, ccy, 0)}${head.min_leverage_headroom !== null ? `, and the tightest headroom to the leverage covenant is ${num(head.min_leverage_headroom, 2)}x` : '. No leverage covenant is entered, so there is no headroom to report'}.`,
    actions: [{ kind: 'view', view: 'credit', label: 'Open Credit and covenants' }],
  };
  const sensitivity: AssistItem = {
    id: 'sensitivity', tone: 'next', title: 'See what moves the return most',
    body: 'One build is one point. The Sensitivity view flexes each input in turn and ranks them by how far the IRR moves, so you know which assumptions to defend.',
    actions: [{ kind: 'view', view: 'sensitivity', label: 'Open Sensitivity' }],
  };
  const save: AssistItem = {
    id: 'case', tone: 'info', title: s.casesSaved ? 'Save another case' : 'Save this as a case',
    body: s.casesSaved ? `${plural(s.casesSaved, 'case')} saved. Save this one too to compare them side by side.` : 'Save these inputs as a named case before you change them, so a downside can be compared with it side by side.',
    actions: [{ kind: 'panel', panel: 'cases', label: 'Open cases' }],
  };
  const excel: AssistItem = {
    id: 'excel', tone: 'info', title: 'Take it to Excel',
    body: 'The export is a live workbook: every figure is a formula over the Inputs sheet, and your notes travel as cell comments.',
    actions: [{ kind: 'export', label: 'Export the Excel model' }],
  };

  if (headlineNotMeaningful(o)) {
    return {
      status: 'The return is not meaningful on this run',
      here: null,
      next: flagItems[0] ?? null,
      more: [...flagItems.slice(1), cash],
    };
  }
  const headline = `Sponsor IRR ${pct(head.irr, 1)}, ${multiple(head.moic, 2)} money multiple`;
  if (flagItems.length > 0) {
    return { status: `${headline}. ${plural(flagItems.length, 'point')} to check`, here: null, next: { ...flagItems[0], tone: 'next' }, more: [...flagItems.slice(1), drivers, cash, sensitivity, save, excel] };
  }
  return { status: `${headline}. The run raises nothing to check`, here: null, next: sensitivity, more: [drivers, cash, save, excel] };
}
