/**
 * lib/ai2/memo.ts — the v2 memo generator (PHASE_E §E4). The memo is DETERMINISTIC —
 * pure ModelOutput → markdown in the R&P panel order recorded in conventions.json
 * `presentation.summaryPanelOrder` (price & multiples → S&U → returns → capitalization
 * → credit → FCF), so it never states a number the exhibits don't. There is no LLM in the
 * memo path: an earlier design carried a `MEMO_POLISH_SYSTEM` prompt for an optional LLM
 * polish pass, but it was never wired, and putting an LLM in a numbers-bearing IC
 * deliverable is a liability the 100%-accuracy regime declines (owner decision, 2026-07-25).
 * If a polished memo is ever wanted, it re-enters with an ENFORCED number-preservation guard
 * (every formatted figure survives verbatim or the deterministic skeleton is used instead) —
 * a guarantee, not a prompt request; the skeleton stays the source of truth either way.
 *
 * `memoSkeleton` output is a USER-FACING DELIVERABLE: Workbench's `downloadMemo` turns it
 * straight into `<Entity>_memo.md`. Nothing in it may be phrased as an instruction — an
 * imperative here would land in the document an analyst hands to an IC. Basis caveats and
 * disclosures belong in the `## Caveats` section, the designated slot (it already carries
 * the coherence flags and the §15 range line). [Hostile review F3, 2026-07-24 — this rule
 * exists because it was broken.]
 */

import { type Engine2ModelOutput } from '../engine2/facade';
import { entryMultipleDisplay, exitMultipleDisplay } from '../engine2/display';
import { money, multiple, num, pct } from '../format';
import type { Engine2Currency } from '../format';

export function memoSkeleton(o: Engine2ModelOutput, ccy: Engine2Currency): string {
  const su = o.sources_uses;
  const exitMult = exitMultipleDisplay(o);
  // §11: state the entry multiple's ACTUAL basis (NTM under an NTM entry — "FY EBITDA" was a
  // false label there), and add the FY/LTM-canonical figure when NTM ("shows both, LTM canonical").
  const em = entryMultipleDisplay(o);
  const entryMultipleClause = em.fy_canonical === null
    ? `${multiple(em.valuation)} ${em.sizing_label} EBITDA (${money(o.facts.fy_ebitda, ccy)})`
    : `${multiple(em.valuation)} NTM EBITDA — ${multiple(em.fy_canonical)} on ${em.sizing_label} EBITDA (${money(o.facts.fy_ebitda, ccy)}), the canonical sizing basis`;
  const totalDebt = o.derived.total_debt_at_par;
  const capTotal = totalDebt + su.rollover_equity + su.sponsor_equity;
  const capRow = (name: string, amt: number) =>
    `| ${name} | ${money(amt, ccy)} | ${o.facts.fy_ebitda > 0 ? multiple(amt / o.facts.fy_ebitda, 2) : 'N/A'} | ${capTotal > 0 ? pct(amt / capTotal) : 'N/A'} |`;
  const lastCredit = o.credit[o.credit.length - 1];

  return `# ${o.facts.entity_name} — LBO summary (engine2)

## Purchase price & multiples
Entry EV ${money(o.derived.enterprise_value, ccy)} at ${entryMultipleClause}; exit at ${multiple(exitMult)} in year ${o.assumptions.entry.hold_years}.

## Sources & uses
| Uses | | Sources | |
|---|---|---|---|
| Enterprise value | ${money(su.enterprise_value, ccy)} | Debt at par | ${money(totalDebt, ccy)} |
| Transaction costs | ${money(su.transaction_costs, ccy)} | Rollover equity | ${money(su.rollover_equity, ccy)} |
| Financing fees + OID | ${money(su.financing_fees + su.oid_funded, ccy)} | Sponsor equity (plug) | ${money(su.sponsor_equity, ccy)} |
| Cash to balance sheet | ${money(su.cash_to_balance_sheet, ccy)} | | |
| **Total** | ${money(su.total_uses, ccy)} | **Total** | ${money(su.total_sources, ccy)} |

## Returns
Sponsor net ${pct(o.returns.sponsor_net.irr)} IRR / ${multiple(o.returns.sponsor_net.moic)} MOIC; pre-promote ${pct(o.returns.pre_promote.irr)}; unlevered ${pct(o.returns.unlevered.irr)}.
Bridge: EBITDA growth ${money(o.bridge.ebitda_growth_at_entry_multiple, ccy)}, multiple ${money(o.bridge.multiple_change_bar, ccy)}, interaction ${money(o.bridge.interaction, ccy)}, paydown ${money(o.bridge.net_debt_paydown, ccy)}.

## Capitalization
| Tranche | Amount | x EBITDA | % of cap |
|---|---|---|---|
${su.debt_at_par.map((d) => capRow(d.name, d.amount)).join('\n')}
${capRow('Sponsor + rollover equity', su.sponsor_equity + su.rollover_equity)}

## Credit statistics
Entry GROSS leverage ${multiple(o.derived.entry_gross_leverage_fy)}; final-year NET leverage ${lastCredit?.net_leverage == null ? 'N/A' : multiple(lastCredit.net_leverage)}; Y1 DSCR ${o.credit[0]?.dscr == null ? 'N/A' : num(o.credit[0].dscr, 2)}; cumulative paydown ${lastCredit?.cumulative_paydown_pct_of_entry_debt == null ? 'N/A' : pct(lastCredit.cumulative_paydown_pct_of_entry_debt)} of entry debt.

## Free cash flow
${o.operating.map((y, i) => `Y${i + 1} ${money(y.fcf_pre_debt, ccy)}`).join(' · ')}
FCF conversion: ${o.credit.map((c) => (c.fcf_conversion == null ? 'N/A' : pct(c.fcf_conversion))).join(' · ')}

## Caveats
${o.coherence.length ? o.coherence.map((f) => `- ${f.severity === 'block' ? 'BLOCK' : 'WARN'}: ${f.message}`).join('\n') : '- No coherence flags on this run.'}
- Entry leverage is GROSS (debt at par ÷ ${em.sizing_label} EBITDA — the quoted sizing basis, SPEC §11); the per-year credit statistics are NET of cash. The two are different bases, so entry and final-year leverage are not a single deleveraging series.
- A model is a range, not a point — see the Sensitivity and Scenarios exhibits (SPEC §15).
`;
}
