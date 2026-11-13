/**
 * lib/assistant/brief.ts — the deal as a set of short, indexed notes, and the choice of which
 * notes a question needs.
 *
 * Why notes and not "send the model everything": a free AI key allows a few thousand tokens a
 * minute. A whole model does not fit, and a small language model handed a wall of figures picks
 * the wrong one. So the engine writes each topic as a few plain sentences with its figures
 * already formatted (the returns, the debt, the open items, a field's guidance), and a question
 * travels with only the handful that match it. The language model's job is then to phrase an
 * answer from sentences that are already correct, not to find or work out a number.
 *
 * The same notes answer a question with no key at all: the best matches are shown as they are.
 * Every figure here is read from the model's state and formatted by lib/format. No arithmetic.
 */
import type { DealAssumptions, DealFacts } from '../engine2/types';
import type { Engine2ModelOutput } from '../engine2/facade';
import type { SuggestionCatalogue } from '../engine2/suggest';
import type { MissingInput } from '../engine2/draft';
import { entryMultipleDisplay, exitMultipleDisplay, headlineNotMeaningful } from '../engine2/display';
import { headlineOf } from '../analysis';
import { money, multiple, num, pct, type Engine2Currency } from '../format';
import type { CleaningFlag, CleaningLedger } from '../cleaning/types';
import type { CleanedHistoricals } from '../cleaning/apply';
import type { StatementPack } from '../statements/types';
import { candidateAccepted } from '../cleaning/ops';
import { CLEAN_NOTES, FIELD_NOTES } from './guidance';
import { fieldTitle, rationaleFor, suggestionKeyFor } from './advisor';
import type { Advice, AssistStep } from './types';

export interface Note {
  id: string;
  title: string;
  /** Words a question on this topic is likely to use. */
  keywords: string[];
  text: string;
  /** Always sent: who the company is and where the analyst stands. */
  pin?: boolean;
}

export interface BriefState {
  step: AssistStep;
  facts: DealFacts;
  assumptions: DealAssumptions | null;
  output: Engine2ModelOutput | null;
  blanks: MissingInput[];
  suggestions: SuggestionCatalogue;
  advice: Advice | null;
  focusPath: string | null;
  clean: { pack: StatementPack; ledger: CleaningLedger; cleaned: CleanedHistoricals | null; flags: CleaningFlag[] } | null;
}

const set = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const list = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' ');

function inputsNote(a: DealAssumptions, ccy: Engine2Currency): Note | null {
  const lines: string[] = [];
  lines.push(`Holding period ${a.entry.hold_years} years.`);
  if (a.entry.driver === 'multiple' && set(a.entry.entry_multiple)) lines.push(`Entry multiple ${multiple(a.entry.entry_multiple, 2)}.`);
  if (a.entry.driver === 'ev' && set(a.entry.enterprise_value)) lines.push(`Purchase price ${money(a.entry.enterprise_value, ccy, 1)}.`);
  if (set(a.exit.multiple)) lines.push(`Exit multiple ${multiple(a.exit.multiple, 2)}.`);
  const g = a.operations.growth.filter(set);
  if (g.length) lines.push(`Revenue growth by year: ${g.map((x) => pct(x, 1)).join(', ')}.`);
  if (set(a.operations.target_margin)) lines.push(`Target EBITDA margin ${pct(a.operations.target_margin, 1)}.`);
  if (set(a.tax.rate)) lines.push(`Tax rate ${pct(a.tax.rate, 1)}.`);
  if (set(a.structure.min_cash)) lines.push(`Minimum cash ${money(a.structure.min_cash, ccy, 1)}.`);
  if (set(a.structure.sweep.base_pct)) lines.push(`Cash sweep ${pct(a.structure.sweep.base_pct, 0)}.`);
  for (const t of a.structure.tranches) {
    const sized = t.type === 'revolver' ? t.commitment : t.size;
    const size = set(sized.x_ebitda) ? `${multiple(sized.x_ebitda, 2)} EBITDA` : null;
    lines.push(`Facility ${t.name}${size ? `, ${size}` : ''}${set(t.maturity_years) ? `, ${t.maturity_years} year maturity` : ''}.`);
  }
  return lines.length > 1 ? { id: 'inputs', title: 'Inputs entered so far', keywords: ['inputs', 'assumptions', 'entered', 'assumed', 'using'], text: lines.join(' ') } : null;
}

function outputNotes(o: Engine2ModelOutput, ccy: Engine2Currency): Note[] {
  const out: Note[] = [];
  const head = headlineOf(o);
  const em = entryMultipleDisplay(o);
  const su = o.sources_uses;
  const N = o.assumptions.entry.hold_years;
  const last = o.credit[o.credit.length - 1];

  out.push({
    id: 'returns', title: 'Returns', keywords: ['return', 'returns', 'irr', 'moic', 'money multiple', 'multiple of money', 'performance', 'summarise', 'summary', 'summarize'],
    text: headlineNotMeaningful(o)
      ? `The return is not meaningful on this run: a blocking condition means the deal cannot be financed as structured. The unlevered IRR, which ignores the capital structure, is ${pct(o.returns.unlevered.irr, 1)}.`
      : `Sponsor net IRR is ${pct(head.irr, 1)} and the money multiple is ${multiple(head.moic, 2)} over ${N} years, on an equity cheque of ${money(head.equity, ccy, 0)}. Before the management promote the IRR is ${pct(o.returns.pre_promote.irr, 1)}. The unlevered IRR, with no debt, is ${pct(o.returns.unlevered.irr, 1)}.`,
  });
  out.push({
    id: 'bridge', title: 'Where the return comes from', keywords: ['drive', 'drives', 'driver', 'drivers', 'bridge', 'value creation', 'comes from', 'source of return', 'paydown', 'deleveraging', 'growth', 'expansion', 'why'],
    text: `Equity value before the promote goes from ${money(o.bridge.entry_equity_pre_promote_total, ccy, 0)} at entry to ${money(o.bridge.exit_equity_pre_promote_total, ccy, 0)} at exit. EBITDA growth at the entry multiple adds ${money(o.bridge.ebitda_growth_at_entry_multiple, ccy, 0)}. The change in multiple adds ${money(o.bridge.multiple_change_bar, ccy, 0)}. The two together (growth earned at the new multiple) add ${money(o.bridge.interaction, ccy, 0)}. Paying down net debt adds ${money(o.bridge.net_debt_paydown, ccy, 0)}.`,
  });
  out.push({
    id: 'price', title: 'Price', keywords: ['price', 'entry', 'exit', 'multiple', 'enterprise value', 'ev', 'valuation', 'paid', 'summarise', 'summary', 'summarize'],
    text: `Entry enterprise value is ${money(o.derived.enterprise_value, ccy, 0)}, which is ${multiple(em.valuation, 2)} ${em.basis_label === 'NTM' ? 'forecast year 1' : em.sizing_label} EBITDA. The exit is at ${multiple(exitMultipleDisplay(o), 2)} in year ${N}, an exit enterprise value of ${money(o.exit.exit_ev, ccy, 0)}.`,
  });
  out.push({
    id: 'funding', title: 'Sources and uses', keywords: ['sources', 'uses', 'funding', 'financed', 'equity cheque', 'equity check', 'fees', 'costs', 'capital structure'],
    text: `Uses: enterprise value ${money(su.enterprise_value, ccy, 0)}, transaction costs ${money(su.transaction_costs, ccy, 1)}, financing fees ${money(su.financing_fees, ccy, 1)}, cash to the balance sheet ${money(su.cash_to_balance_sheet, ccy, 1)}; total ${money(su.total_uses, ccy, 0)}. Sources: ${su.debt_at_par.map((d) => `${d.name} ${money(d.amount, ccy, 0)}`).join(', ') || 'no debt'}, rollover equity ${money(su.rollover_equity, ccy, 1)}, sponsor equity ${money(su.sponsor_equity, ccy, 0)}.`,
  });
  out.push({
    id: 'credit', title: 'Debt and credit', keywords: ['debt', 'leverage', 'levered', 'credit', 'covenant', 'covenants', 'headroom', 'dscr', 'cover', 'coverage', 'exposed', 'exposure', 'risk', 'risky', 'structure', 'tight', 'tightest'],
    text: list([
      `Total debt at close is ${money(o.derived.total_debt_at_par, ccy, 0)}${o.derived.entry_gross_leverage_fy !== null ? `, ${multiple(o.derived.entry_gross_leverage_fy, 2)} EBITDA gross` : ''}.`,
      `Net leverage by year: ${o.credit.map((c, i) => `year ${i + 1} ${c.net_leverage === null ? 'n/a' : multiple(c.net_leverage, 2)}`).join(', ')}.`,
      o.credit.some((c) => c.dscr !== null) && `Debt service cover by year: ${o.credit.map((c, i) => `year ${i + 1} ${c.dscr === null ? 'n/a' : num(c.dscr, 2)}`).join(', ')}.`,
      head.min_leverage_headroom !== null ? `The tightest headroom to the leverage covenant is ${num(head.min_leverage_headroom, 2)}x.` : 'No leverage covenant is entered.',
      last?.cumulative_paydown_pct_of_entry_debt != null && `By exit ${pct(last.cumulative_paydown_pct_of_entry_debt, 0)} of the entry debt has been repaid.`,
    ]),
  });
  out.push({
    id: 'cash', title: 'Cash', keywords: ['cash', 'liquidity', 'fcf', 'free cash flow', 'cash flow', 'tight', 'tightest', 'lowest', 'sweep', 'exposed'],
    text: `Free cash flow before debt service by year: ${o.operating.map((y, i) => `year ${i + 1} ${money(y.fcf_pre_debt, ccy, 0)}`).join(', ')}. Closing cash by year: ${o.waterfall.map((w, i) => `year ${i + 1} ${money(w.closing_cash, ccy, 0)}`).join(', ')}. The lowest cash balance in the hold is ${money(head.min_cash, ccy, 0)}.`,
  });
  out.push({
    id: 'forecast', title: 'Operating forecast', keywords: ['revenue', 'sales', 'ebitda', 'margin', 'forecast', 'operating', 'growth', 'projection', 'projections'],
    text: `EBITDA by year: ${o.operating.map((y, i) => `year ${i + 1} ${money(y.ebitda, ccy, 1)}`).join(', ')}.${o.operating.every((y) => y.revenue !== null) ? ` Revenue by year: ${o.operating.map((y, i) => `year ${i + 1} ${money(y.revenue, ccy, 1)}`).join(', ')}.` : ''}`,
  });
  out.push({
    id: 'flags', title: 'Things to check on this run', keywords: ['check', 'flag', 'flags', 'warning', 'warnings', 'wrong', 'problem', 'problems', 'issue', 'issues', 'exposed', 'risk', 'concern', 'concerns', 'weak'],
    text: o.coherence.length ? o.coherence.map((f) => `${f.severity === 'block' ? 'Blocking' : 'To check'}: ${f.message}`).join(' ') : 'The run raises nothing to check.',
  });
  return out;
}

function cleanNotes(c: NonNullable<BriefState['clean']>, facts: DealFacts): Note[] {
  const out: Note[] = [];
  const ccy = facts.currency;
  const b = c.cleaned?.bridges;
  if (b) {
    const sizing = b.ebitda.find((x) => x.period === b.sizing) ?? b.ebitda[b.ebitda.length - 1];
    const rows = sizing?.rows ?? [];
    out.push({
      id: 'clean-impact', title: 'Reported and adjusted figures', keywords: ['adjusted', 'reported', 'adjustment', 'adjustments', 'changed', 'clean', 'normalised', 'normalized', 'add-back', 'add back', 'bridge', 'ebitda', 'net debt'],
      text: list([
        sizing && `EBITDA as reported is ${money(sizing.reported, ccy, 1)} and as adjusted ${money(sizing.adjusted, ccy, 1)}.`,
        rows.length ? `Adjustments in the bridge: ${rows.map((r) => `${r.label} ${r.amount === null ? 'amount not entered' : num(r.amount, 1)}`).join(', ')}.` : 'No adjustment has been added to the EBITDA bridge.',
        b.net_debt && `Net debt as reported is ${money(b.net_debt.reported, ccy, 1)}${b.net_debt.adjusted !== null ? ` and as adjusted ${money(b.net_debt.adjusted, ccy, 1)}` : '; the adjusted figure waits for the lease choice'}.`,
      ]),
    });
  }
  const pending = c.pack.candidates.filter((x) => !candidateAccepted(c.ledger, x));
  out.push({
    id: 'clean-pending', title: 'What the filing reports that could be adjusted', keywords: ['adjust', 'adjustment', 'adjustments', 'add back', 'add-back', 'one-off', 'clean', 'should', 'filing', 'candidates', 'proposals', 'impairment', 'share-based'],
    text: pending.length
      ? pending.map((x) => `${x.label} (${x.bridge === 'ebitda' ? 'EBITDA' : 'net debt'}): ${x.rationale}${x.caveat ? ` ${x.caveat}` : ''}`).join(' ')
      : 'The filing reports nothing further that is usually adjusted.',
  });
  out.push({
    id: 'clean-open', title: 'Open items on the Clean step', keywords: ['open', 'blocking', 'blocks', 'left', 'remaining', 'continue', 'finish', 'done'],
    text: c.flags.length ? c.flags.map((f) => f.message).join(' ') : 'Nothing is open on the Clean step.',
  });
  for (const [id, n] of Object.entries(CLEAN_NOTES)) out.push({ id: `cleannote:${id}`, title: n.title, keywords: n.keywords, text: n.text });
  return out;
}

/** Every note the assistant holds on the deal as it stands. */
export function buildNotes(s: BriefState): Note[] {
  const f = s.facts;
  const ccy = f.currency;
  const notes: Note[] = [];
  const basis = f.sizing_basis === 'LTM' ? 'the last twelve months' : f.fiscal_year !== null ? `fiscal year ${f.fiscal_year}` : 'the historical year';

  notes.push({
    id: 'deal', title: 'The company', pin: true, keywords: ['company', 'target', 'business'],
    text: list([
      `${f.entity_name.replace(/\.$/, '')}. Figures are in ${ccy} millions.`,
      set(f.fy_revenue) && `Revenue for ${basis} is ${money(f.fy_revenue, ccy, 1)}.`,
      set(f.fy_ebitda) && `EBITDA is ${money(f.fy_ebitda, ccy, 1)}${set(f.fy_ebitda_margin) ? `, a margin of ${pct(f.fy_ebitda_margin, 1)}` : ''}.`,
      set(f.net_debt) && `Net debt is ${money(f.net_debt, ccy, 1)}.`,
    ]),
  });
  if (s.advice) {
    notes.push({
      id: 'now', title: 'Where the analyst is', pin: true, keywords: ['next', 'now', 'left', 'do', 'remaining', 'todo'],
      text: list([
        `The analyst is on the ${s.step === 'clean' ? 'Clean' : s.step === 'assumptions' ? 'Assumptions' : s.step === 'results' ? 'Results' : 'Source'} step. ${s.advice.status}.`,
        s.advice.next && `The next move is: ${s.advice.next.title}. ${s.advice.next.body}`,
        s.focusPath && `The analyst is in the input "${fieldTitle(s.focusPath, s.assumptions)}".`,
      ]),
    });
  }

  const hist = f.history.filter((h) => h.revenue !== null || h.ebitda !== null);
  if (hist.length) {
    notes.push({
      id: 'history', title: 'Filed history', keywords: ['history', 'historical', 'past', 'track record', 'trend', 'grown', 'growth', 'years'],
      text: hist.map((h) => `${h.period_end.slice(0, 4)}: revenue ${h.revenue === null ? 'not reported' : money(h.revenue, ccy, 1)}, EBITDA ${h.ebitda === null ? 'not reported' : money(h.ebitda, ccy, 1)}.`).join(' '),
    });
  }

  if (s.assumptions) {
    const inputs = inputsNote(s.assumptions, ccy);
    if (inputs) notes.push(inputs);
    const rows = [...new Set(s.blanks.map((b) => b.path.replace(/^(operations\.(?:growth|growth_capex))\.\d+$/, '$1')))];
    if (rows.length) {
      notes.push({
        id: 'blanks', title: 'Inputs still blank', keywords: ['blank', 'left', 'remaining', 'missing', 'before i can build', 'build', 'to enter', 'still'],
        text: `${rows.length} lines of the sheet are still blank:\n${[...new Set(rows.map((p) => fieldTitle(p, s.assumptions)))].map((t) => `- ${t}`).join('\n')}`,
      });
    }
    // one note per sourced value on offer, so a question about one input carries only that one
    const seen = new Set<string>();
    const offers: string[] = [];
    for (const p of rows) {
      const key = suggestionKeyFor(p, s.suggestions);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const r = rationaleFor(key, s.suggestions[key], s.assumptions, ccy);
      const text = `A sourced value is on offer for ${r.subject}${r.value ? `: ${r.value}` : ''}. ${r.basis}. ${r.how}${r.source ? ` Source: ${r.source}` : ''}`;
      offers.push(`${r.subject}${r.value ? `: ${r.value}` : ''}`);
      notes.push({ id: `offer:${key}`, title: `Proposal: ${r.subject}`, keywords: r.subject.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2), text });
    }
    if (offers.length) {
      notes.push({ id: 'offers', title: 'Sourced values on offer', keywords: ['sourced', 'proposal', 'proposals', 'suggest', 'suggestion', 'suggestions', 'recommend', 'offer', 'which blanks'], text: `These blank inputs have a sourced value ready to accept:\n${offers.map((o) => `- ${o}`).join('\n')}\nThe others are yours to enter.` });
    }
  }

  if (s.output) notes.push(...outputNotes(s.output, ccy));
  if (s.clean) notes.push(...cleanNotes(s.clean, f));
  for (const n of FIELD_NOTES) {
    notes.push({ id: `field:${n.title}`, title: n.title, keywords: n.keywords, text: `${n.what} ${n.how}${n.watch ? ` ${n.watch}` : ''}` });
  }
  return notes;
}

// ── which notes a question needs ─────────────────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'what', 'which', 'how', 'why', 'does', 'did', 'can', 'should', 'would', 'this', 'that', 'with', 'from', 'into', 'have', 'has', 'much', 'many', 'most', 'about', 'there', 'their', 'you', 'your', 'deal', 'model', 'use', 'tell', 'give', 'show', 'explain', 'please', 'any', 'its', 'not', 'but', 'when', 'where', 'who']);
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9&()-]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** How well a note matches a question: its keywords count double, a word of its title once. */
export function score(question: string, note: Note): number {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9&()-]+/g, ' ')} `;
  const qw = new Set(words(question));
  let s = 0;
  for (const k of note.keywords) if (k.includes(' ') ? q.includes(` ${k} `) : qw.has(k)) s += 2;
  for (const w of words(note.title)) if (qw.has(w)) s += 1;
  return s;
}

/** What a question falls back on when its words match nothing, by step. */
const DEFAULTS: Record<AssistStep, string[]> = {
  source: [],
  clean: ['clean-impact', 'clean-open', 'clean-pending'],
  assumptions: ['blanks', 'offers', 'inputs'],
  results: ['returns', 'bridge', 'flags'],
};

/** The notes to send with a question: the pinned ones, then the best matches, within a budget. */
export function selectNotes(question: string, notes: Note[], step: AssistStep, budgetChars = 5200): Note[] {
  const pins = notes.filter((n) => n.pin);
  const ranked = notes.filter((n) => !n.pin).map((n) => ({ n, s: score(question, n) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.n);
  const pool = ranked.length ? ranked : DEFAULTS[step].map((id) => notes.find((n) => n.id === id)).filter((n): n is Note => !!n);
  const out = [...pins];
  let used = 0;
  for (const n of out) used += n.text.length + n.title.length;
  for (const n of pool) {
    if (out.length - pins.length >= 6) break;
    const size = n.text.length + n.title.length;
    if (used + size > budgetChars) continue;
    out.push(n);
    used += size;
  }
  return out;
}

/** The answer when no AI key is saved (or the provider cannot be reached): the notes themselves. */
export function answerFromNotes(question: string, notes: Note[], step: AssistStep): string {
  const found = selectNotes(question, notes, step, 2400).filter((n) => !n.pin);
  // a second note only when it matches nearly as well as the first: one good answer beats two loose ones
  const top = found[0] ? score(question, found[0]) : 0;
  const picked = found.filter((n, i) => i === 0 || (i === 1 && top > 0 && score(question, n) >= top * 0.75));
  if (!picked.length) return 'The model holds nothing under those words. Name the figure or the input you mean, such as the entry multiple, leverage, cash or an adjustment.';
  return picked.map((n) => `**${n.title}**\n${n.text}`).join('\n\n');
}

/** Questions worth asking on each step. Each is answered from the notes; none needs a key. */
export function starters(step: AssistStep, hasOutput: boolean): string[] {
  if (step === 'clean') return ['What does the filing report that I could adjust?', 'What changed against the reported figures?', 'How should leases count in net debt?', 'What is still open on this step?'];
  if (step === 'assumptions' && !hasOutput) return ['What is left before I can build?', 'Which blanks have a sourced value?', 'How do I set the exit multiple?', 'Where does minimum cash come from?'];
  return ['What drives the return in this deal?', 'Where is the structure most exposed?', 'How tight does cash get?', 'Summarise the deal.'];
}
