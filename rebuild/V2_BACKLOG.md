# Deal Engine v2 — open work after PR #126 (owner-ordered, 2026-11-09)

The owner's order: **finish everything that is half-done first, then the 10-K reconciliation
bridges.** Owner rules carried by every item: zero placeholders or invented defaults (an input
is blank until entered); ONE engine drives the UI; the exported Excel is a fully formula-driven
model held to that engine by the LibreOffice recalculation-parity suite
(`tests/engine2-workbook-parity.test.ts`); everything must be financially sound and testable.

Status key: ☐ not started · ◐ in progress · ☑ done (with the commit that closed it).

## 1. Excel model — complete the formula coverage  ◐

Today `formulaCoverageBlockers` (lib/engine2/workbook.ts) BLOCKS export for any deal using the
features below. Each must become live formulas, mapped cell-for-cell to ModelOutput, with at
least one parity deal that genuinely exercises it (path-coverage assertion) and a mutation that
goes red. Order = smallest blast radius first.

| # | Feature | Engine home | Notes |
|---|---|---|---|
| 1.1 | Monitoring fee (annual fee off EBITDA_adj, dropped in the exit year; accelerated termination at exit) | operating.ts, exit.ts | ☑ |
| 1.2 | Interim distributions (§3 step 7: two cash caps) | kernel/waterfall.ts | ☑ |
| 1.3 | Restricted-payment cash trap (§3.7) | kernel/waterfall.ts | ☑ |
| 1.4 | Leverage-based sweep grid (beginning-of-year net leverage) | debt.ts `resolveSweepPct` | ☑ |
| 1.5 | Covenant tests + headroom + springing test (display; no cash effect) | credit.ts | ☑ |
| 1.6 | MIP ratchet tiers (marginal, §22.4) | exit.ts `promoteUncapped` | ☑ |
| 1.7 | PIK toggle elections (§20) | debt.ts `financeLines` | ☑ |
| 1.8 | Warrant (§22.6, full dilution, strike paid in) | exit.ts | ☑ |
| 1.9 | Refinancing events (§18: par-for-par, call premium, new OID/fees, write-off timing) | sequence.ts | ☑ |
| 1.10 | Sweet-equity strip (§22: loan notes, ordinaries, sweet ratchet walk) | sequence.ts / exit.ts | ☐ |
| 1.11 | Fund/LP overlay (§19: fees, pref, catch-up, carry, European/American) | fund.ts | ☐ |

## 2. Excel model — formatting and review upgrade  ☐

- A **Summary** sheet (the one-pager an MD reads first): price & multiples, S&U, returns
  (sponsor, equity, unlevered, valuation when on), credit, the checks total — all formulas.
- Sensitivity tables as live formulas where the math allows (exit multiple × IRR/MOIC/NPV,
  the reference model's section 8), with hidden-helper recursion columns as in the reference.
- Consistent styling pass: units column, year headers on every block, borders under totals,
  negative numbers in parentheses, no floating-point noise on display rows, column widths,
  print areas, freeze panes, sheet tab colours; named ranges for the key inputs.
- Review of the shipped v2.0.0 work: re-read workbook.ts against the spec end-to-end; widen the
  parity deal set (multi-tranche PIK + revolver draws + NTM exit + valuation in one deal).

## 3. Surplus cash to equity (new distribution policy)  ☐

The reference's leverage table ("once the debt is repaid, surplus cash is paid out to equity")
needs a policy the engine lacks: each year, distribute all cash above the minimum after debt
service (still subject to the §3.7 trap). Today the only option is a per-year REQUESTED amount.
Spec amendment → golden (the reference's 0 / 300 / 600 / 1,000 debt rows are ready-made
expected values) → engine → UI → Excel.

## 4. Partial exits / IPO selldown (backlog #7)  ☐ (parked mid-ritual)

Spec §23 drafted, adjudicated golden G11-SELL committed on
`claude/deal-engine-partial-exits-586f25` (13 commits, step 2b). Remaining: absorb main
(v2.0.0 renumbering — §23 is reserved for it), engine (step 3), UI (step 4), Excel coverage,
conformance + walkthrough.

## 5. 10-K reconciliation bridges  ☐ (after 1–4, owner decision)

- **EBITDA bridge:** reported EBITDA built visibly from the filing (operating income + D&A) →
  itemised analyst adjustments per historical year (label, amount, category — one-off /
  restructuring / SBC / pro-forma / other, source note, recurs-in-forecast?) → adjusted EBITDA
  that drives sizing and the margin base.
- **Net-debt bridge:** reported debt and cash → debt-like items (leases, pensions, earn-outs,
  deferred consideration…) and cash-like items → adjusted net debt.
- Both bridges on the Inputs sheet of the exported model, formula-linked.
- Later: AI-assisted cleaning of the statements (an analyst-in-the-loop proposal list, the
  same proposal discipline as `suggest.ts`).

## Also open (housekeeping)

- Stale remote branches to delete once #7 is resumed from the right one:
  `claude/partial-exits-spec`, `archive/partial-exits-spec-draft`,
  `claude/fund-lp-overlay-feature-go3xav`, `claude/entry-leverage-naming`,
  `claude/f-tail-deletion`, `claude/phase-g1-goldens`, `claude/phase-c-drafts`.
- Three dead local worktrees under `.claude/worktrees/`.
