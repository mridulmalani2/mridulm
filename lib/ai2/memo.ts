/**
 * lib/ai2/memo.ts — the v2 memo generator (PHASE_E §E4). The SKELETON is deterministic
 * — pure ModelOutput → markdown in the R&P panel order recorded in conventions.json
 * `presentation.summaryPanelOrder` (price & multiples → S&U → returns → capitalization
 * → credit → FCF), so the memo never states a number the exhibits don't.
 *
 * The skeleton is the ONLY memo path that ships today. `MEMO_POLISH_SYSTEM` below is the
 * intended optional LLM polish pass and has **no call site** — the downloaded memo is
 * always the deterministic skeleton, never model-written prose. Stated because the module
 * previously described the polish pass as though it ran (hostile review F3, 2026-07-24).
 *
 * `memoSkeleton` output is a USER-FACING DELIVERABLE, not a prompt: Workbench's
 * `downloadMemo` turns it straight into `<Entity>_memo.md`. Nothing in it may be phrased as
 * an instruction — an imperative here lands in the document an analyst hands to an IC, and
 * `MEMO_POLISH_SYSTEM` would treat it as content to preserve, not guidance to obey. Basis
 * caveats and disclosures belong in the `## Caveats` section, which is the designated slot
 * (it already carries the coherence flags and the §15 range line). [Hostile review F3,
 * 2026-07-24 — this rule exists because it was broken.]
 */

import { entryMultipleDisplay, type Engine2ModelOutput } from '../engine2/facade';
import { money, multiple, num, pct } from '../format';
import type { Engine2Currency } from '../format';

export function memoSkeleton(o: Engine2ModelOutput, ccy: Engine2Currency): string {
  const su = o.sources_uses;
  const exitMult = o.exit.exit_ev / o.exit.exit_ebitda_basis_value;
  // §11: state the entry multiple's ACTUAL basis (NTM under an NTM entry — "FY EBITDA" was a
  // false label there), and add the FY/LTM-canonical figure when NTM ("shows both, LTM canonical").
  const em = entryMultipleDisplay(o);
  const entryMultipleClause = em.fy_canonical === null
    ? `${multiple(em.valuation)} FY EBITDA (${money(o.facts.fy_ebitda, ccy)})`
    : `${multiple(em.valuation)} NTM EBITDA — ${multiple(em.fy_canonical)} on FY/LTM EBITDA (${money(o.facts.fy_ebitda, ccy)}), the canonical sizing basis`;
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
- Entry leverage is GROSS (debt at par ÷ FY EBITDA — the quoted sizing basis, SPEC §11); the per-year credit statistics are NET of cash. The two are different bases, so entry and final-year leverage are not a single deleveraging series.
- A model is a range, not a point — see the Sensitivity and Scenarios exhibits (SPEC §15).
`;
}

/**
 * Polish prompt: prose only; introducing figures not present in the skeleton is forbidden.
 * NOT WIRED — zero call sites. Kept as the recorded design for the optional polish pass;
 * if it is ever wired up, every basis caveat in `## Caveats` must survive the rewrite.
 */
export const MEMO_POLISH_SYSTEM = `You are a PE investment-memo editor. Rewrite the user's markdown memo into crisp IC prose, PRESERVING every number, table and section exactly — you may reword sentences and add connective narrative, but you must NOT introduce, alter or remove any figure. Return markdown only.`;
