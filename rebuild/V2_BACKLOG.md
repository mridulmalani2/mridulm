# Deal Engine v2 — open work after PR #126 (owner-ordered, 2026-11-09)

The owner's order: **finish everything that is half-done first, then the 10-K reconciliation
bridges.** Owner rules carried by every item: zero placeholders or invented defaults (an input
is blank until entered); ONE engine drives the UI; the exported Excel is a fully formula-driven
model held to that engine by the LibreOffice recalculation-parity suite
(`tests/engine2-workbook-parity.test.ts`); everything must be financially sound and testable.

Status key: ☐ not started · ◐ in progress · ☑ done (with the commit that closed it).

**Items 1–4 are DONE (2026-11-09). Only item 5, the reconciliation bridges, remains — by the
owner's order it comes last.**

## 1. Excel model — complete the formula coverage  ☑

`formulaCoverageBlockers` is now EMPTY for every engine feature: nothing blocks export.

| # | Feature | Engine home | Status |
|---|---|---|---|
| 1.1 | Monitoring fee (annual fee off EBITDA_adj, dropped in the exit year; accelerated termination at exit) | operating.ts, exit.ts | ☑ 1be5be1 |
| 1.2 | Interim distributions (§3 step 7: two cash caps) | kernel/waterfall.ts | ☑ 1be5be1 |
| 1.3 | Restricted-payment cash trap (§3.7) | kernel/waterfall.ts | ☑ 1be5be1 |
| 1.4 | Leverage-based sweep grid (beginning-of-year net leverage) | debt.ts `resolveSweepPct` | ☑ 1be5be1 |
| 1.5 | Covenant tests + headroom + springing test (display; no cash effect) | credit.ts | ☑ 1be5be1 |
| 1.6 | MIP ratchet tiers (marginal, §22.4) | exit.ts `promoteUncapped` | ☑ 1be5be1 |
| 1.7 | PIK toggle elections (§20) | debt.ts `financeLines` | ☑ 1be5be1 |
| 1.8 | Warrant (§22.6, full dilution, strike paid in) | exit.ts | ☑ 1be5be1 |
| 1.9 | Refinancing events (§18: par-for-par, call premium, new OID/fees, write-off timing) | sequence.ts | ☑ a0ce8aa |
| 1.10 | Sweet-equity strip (§22: loan notes, ordinaries, sweet ratchet walk) | sequence.ts / exit.ts | ☑ 9ce1a3d |
| 1.11 | Fund/LP overlay (§19: fees, pref, catch-up, carry, European/American) | fund.ts | ☑ 67d2bfd |

## 2. Excel model — formatting and review upgrade  ☑ ad32cce

- ☑ **Summary** sheet first — price & multiples, S&U, exit, returns (sponsor, equity, unlevered,
  DPI/payback, LP, valuation when on), credit by year, the checks total — all formulas, all
  parity-mapped.
- ☑ Live sensitivity: five exit multiples (editable on Inputs), each restating the full exit
  chain + the flow-to-equity recursion as formulas, held to a full engine re-run per point.
  Entry multiple / leverage / growth / margin change the year loop itself — they stay on the
  app's §13 grid (engine re-runs); they are not faked in the workbook as pasted values.
- ☑ Styling: units column, rules above totals, negatives in parentheses, tab colours, print
  areas, frozen panes, named ranges on the most-flexed inputs; Methodology sheet from the same
  disclosure list as the app (`lib/engine2/disclosures.ts`).
- ☑ Review of v2.0.0: every IRR seeded with the money-multiple estimate (the default guess did
  not converge on deep losses — found by the new loss deals); the COMBO parity deal (multi-
  tranche + toggled PIK + a drawing revolver + NTM exit + grid sweep + trap + valuation).

## 3. Surplus cash to equity (new distribution policy)  ☑ 34eace2

SPEC §3.8 (v2.1.0): one policy per deal — none / fixed schedule / surplus cash with an
analyst-set payout % and start (every year, or only once all debt is repaid); pre-filled 100% /
every year VISIBLY when chosen (owner direction: a default that is clearly changeable).
Researched against credit-agreement practice (retained excess cash builds the RP basket,
leverage-conditioned = the §3.7 trap). Goldens: the reference leverage table (debt 0/300/600/
900/1,000, external) matches under both starts; G13-SURPLUS / G13-SURPLUS-GATED from
spec_calc.py (partial sweep, trap-blocked and clipped years, the gate opening mid-hold).

## 4. Partial exits / IPO selldown (backlog #7)  ☑ c1888ce, a7a995e

Branch `claude/deal-engine-partial-exits-586f25` merged; SPEC §23 DECIDED and implemented
(v2.2.0) at the same bar as the other v2.x features (owner direction): G11-SELL matched leaf by
leaf, every §23.13 directed fixture, 12 engine + 6 Excel mutants red, UI input + Returns block +
Methodology row, live Excel formulas. Open prose item only: ledger L4 (§23 is ~330 lines).

## Also done in this pass

- ☑ 423e2d5 — the panel exposes every engine feature (it lacked the sweep step-down grid,
  per-year covenant levels, the springing test and sweet-equity ratchet tiers).

## 5. 10-K reconciliation bridges  ☐ (NEXT — the owner's last item)

- **EBITDA bridge:** reported EBITDA built visibly from the filing (operating income + D&A) →
  itemised analyst adjustments per historical year (label, amount, category — one-off /
  restructuring / SBC / pro-forma / other, source note, recurs-in-forecast?) → adjusted EBITDA
  that drives sizing and the margin base.
- **Net-debt bridge:** reported debt and cash → debt-like items (leases, pensions, earn-outs,
  deferred consideration…) and cash-like items → adjusted net debt.
- Both bridges on the Inputs sheet of the exported model, formula-linked.
- Later: AI-assisted cleaning of the statements (an analyst-in-the-loop proposal list, the
  same proposal discipline as `suggest.ts`).

## Decided since the last pass

- ☑ 1b7195d **Limited liability (SPEC §9.1, v2.3.0).** Researched (equity as a call on the
  firm struck at its debt; modelling practice floors proceeds with MAX(0, …)) and adopted:
  exit equity and selldown proceeds are floored at zero, the lenders' unrecovered debt is
  reported (`exit.debt_shortfall_at_exit`, a bridge term, a WARN). The signed convention is
  rejected — it modelled the sponsor paying in at exit.
- ☑ 4c28e8a §23 ledger closed (L4); the runbook STATE section is current.

## Housekeeping  ☑ 2026-11-09

- Remote: 50 stale branches deleted; only `main` and the PR #126 branch remain. The two that
  held unique (superseded) work are preserved as tags `archived/phase-c-drafts` and
  `archived/fund-lp-overlay-feature-go3xav`.
- Local: two dead worktrees removed (both clean, their commits on main); 68 merged local
  branches deleted.
- Left for the owner: the cloud routine "Deal Engine autonomous build — 5h resume"
  (trig_01BHRUyxTy5GJSF711ZhhTao) is still enabled and resumes from this runbook every 5 hours;
  and the main checkout still has `claude/excel-model-completion` (now fully inside PR #126)
  checked out — switch it to `main` after the merge.
