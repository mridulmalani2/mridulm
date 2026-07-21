# Deal Engine v2 — Master Plan

## 1. Context and diagnosis

The toolkit has been through ~12 fix campaigns, an 18-bug report, an 88KB institutional audit,
and repeated adversarial reviews without reaching a state the owner trusts. The evidence
gathered for this plan (live walkthrough with a real Apple EDGAR import; full engine/data-layer
map; git/audit history) points to one root cause:

**There was never a frozen financial specification.** Conventions (which balance earns
interest, which fees sit in which IRR stream, what a "bear case" holds constant) live
implicitly in code. Every review re-litigates them from scratch; every fix is a symptom patch.
The dual-engine era (TS + Python) compounded it: fixes landed in one engine and not the other.

Live-site evidence (2026-07, default flow, Apple):
- Base case breaches its own default covenant in Year 1 (DSCR 1.2x vs 1.25x default) — defaults
  individually plausible, jointly incoherent.
- Fragility: a **−100bps margin shock improves IRR +37bps**. (Root mechanism identified during
  plan review: operating shocks re-price the multiple-driven entry EV, shrinking the equity
  check — the scenario convention was never decided. SPEC §13 closes this.)
- Reality Check announces "1 CRITICAL flag" and renders nothing.
- Arbitrary DEFAULT-badged forward assumptions: growth 12/10/8/7/6%, entry & exit 14x,
  leverage 4.5x — no basis, for any company. Apple gets priced at $2.0T EV without comment.
- Display: margin input shows `0.3478173110887373`; money renders as `$2026472.0`; the MIP
  headline is `$101194.7m`.
- **No P&L/FCF exhibit exists in the UI** — the core LBO output (EBITDA → cash taxes → capex →
  ΔNWC → FCF → debt service → cash) is computed internally and never shown.

What is genuinely good and is kept: the EDGAR/ESEF extraction layer with per-field provenance
and the missing→MISSING invariant; the 3-screen flow (Source → Review → Model); the
three-statement close gate; the clean-room/regression test discipline; trace mode as a concept.

**Decision: rebuild the engine, assumption schema, and model UI from scratch against a written
spec** (`engine2/`), keeping the data layer and flow shell. This plan was itself adversarially
reviewed by four hostile reviewers (finance / architecture / product / SEC-data, 44 findings);
their corrections are embedded throughout and the deliberate ones are marked.

## 2. Target outputs (reverse-engineered from the current UI)

v1 tabs, in order:

| # | Tab | Content | Status vs today |
|---|---|---|---|
| 1 | **Summary** | IC one-pager: sponsor IRR/MOIC hero, mini value bridge, entry→exit multiple line, leverage + Y1 DSCR, 5-row FCF sparkline; each element deep-links to its tab | NEW (the 5-minute-visitor screen) |
| 2 | **Returns** | The three return series (below), sponsor cash-flow ladder by year, full value bridge + EBITDA bridge | Redefined |
| 3 | **Operating model** | Annual table: Revenue → EBITDA → D&A → EBIT → cash taxes → capex → ΔNWC → FCF pre-debt → interest → mandatory amort → sweep → ending cash | NEW (was never rendered) |
| 4 | **Sources & Uses** | With % of total and ×EBITDA columns; includes "cash to balance sheet" funding line | Kept, extended |
| 5 | **Debt schedule** | Per tranche beg/interest(cash+PIK)/mandatory/sweep/end + blended rate; leverage/coverage footer | Kept |
| 6 | **Balance sheet** | Three-statement close; close gate remains a merge blocker | Kept |
| 7 | **Credit** | Net + senior leverage, ICR, FCCR, DSCR, covenant headroom, ECF. **Dropped:** credit-rating heuristic, static recovery waterfall | Trimmed |
| 8 | **Sensitivity** | Entry×Exit, Growth×Exit, Leverage×Exit, Margin×Exit; center cell ≡ base (tested) | Kept |
| 9 | **Scenarios** | Named delta-sets incl. the former single-factor "fragility" shocks; same credit metrics as base; per-scenario mini bridge | Merged (fragility tab dies) |

Cut from v1, staged in Phase G: Reality Check (returns only with real comps data), fund/LP
overlay, partial exits, interim distributions + cash trap, PIK per-year election (a fixed-rate
PIK note **stays** in v1 — it's core mechanics), refinancing events, MIP ratchets, add-ons.
Kept as-is (orthogonal): AI chat, memo, Excel export (rebuilt in Phase E3), trace mode (E-gated).

**The three v1 return series (locked vocabulary — SPEC §9 tabulates fee membership):**
1. **Sponsor net equity IRR / MOIC** (headline): out = EV + transaction costs + financing fees
   + OID − debt(par) − rollover, at t=0; in = exit equity net of exit fees and MIP. (v1 has no
   interim sponsor flows; DPI/payback are therefore degenerate and are NOT headlined in v1.)
2. **Unlevered IRR**: out = EV + transaction/advisory costs only (no financing fees/OID); FCF
   with tax on EBIT (NOL/§382 apply; no §163(j) — no interest), no monitoring fees; in = exit
   EV − exit advisory costs.
3. **Pre-promote IRR** (never called "gross"): stream 1 before MIP.

## 3. The input model

Every field belongs to exactly one class; class changes are impossible by construction
(separate TypeScript types: `DealFacts`, `DealAssumptions`, `ModelOutput`).

### Class A — FACTS (from filings; provenance-linked; MISSING when absent)
Existing: FY revenue, EBITDA (OpInc+D&A), D&A%, capex%, gross debt (lease-aware), cash,
net debt, effective tax rate, NOL (floor — see PHASE_D), sector, currency, period.
New in Phase D (all with the reliability machinery the data review demanded — per-period tag
resolution, latest-filed dedupe, end-date keying):
- **3–5yr history** of revenue/EBITDA/margin/capex/NWC + CAGRs over true date spans;
- **Operating NWC** (defined to exclude cash/debt — replaces the CA−CL figure) + **actual
  DSO/DIO/DPO** from AR/Inventory/AP/COGS where cleanly tagged (gated; DPO never from a
  bundled AP+accrued tag; purchases-based when history allows);
- **Implied cost of existing debt** from interest expense (plausibility-banded, badged
  approximate);
- **Implied trading EV/EBITDA** next to the entry-multiple field (shares × price ÷ FY EBITDA)
  — the minimal market anchor so absurd multiples don't pass silently [OWNER DECISION #3].
- Naming honesty: extracted flows are **FY-basis** and labelled `fy_*` with a staleness
  indicator ("FY2025, ended 2025-09-27, 9 months ago"). True quarter-stitched LTM is a
  Phase G item. The old `ltm_*` naming was a silent mislabel.

### Class B — ASSUMPTIONS (each with a declared, visible basis)
Badge states: **SUGGESTED (history)** — derived from Class-A history (e.g. growth anchored to
3yr CAGR with decay; capex = 3yr avg); **SUGGESTED (convention)** — cited market convention
from the Phase A research pass (hold = 5yr, basis = FY/LTM, exit multiple = entry multiple,
ECF sweep 50–75% with step-downs, cov-lite default); **TEMPLATE** — one-click named capital
structures ("Standard: TLB S+400 + revolver, 50% sweep", 2–3 of them, from research Q7/Q4);
**AI**; **YOU**; **REQUIRED** — empty until set. Only the entry multiple (or EV) is
hard-REQUIRED; it sits next to the implied-trading-multiple reference line. MIP and monitoring
fee default to OFF (absence of a promote is a legitimate state, not a default).

First contact is: import → one click (template + suggestions) → model, with every prefilled
field badged and editable. **Progressive disclosure:** a core-8 tier is always visible (entry
multiple, structure template/leverage turns, blended rate proxy, growth, target margin,
capex %, exit multiple, hold); everything else in collapsed Advanced groups. Per-year arrays
render as (start, decay/terminal) with an "edit by year" expander. The engine schema is ~40
fields; the default render shows 8.

v1 schema: entry (driver multiple|EV, basis FY|NTM, hold); tranches[] (type incl. fixed-rate
pik_note, size ×EBITDA or amount, fixed|floating with `max(base, floor) + spread`, amort,
sweep participation + priority, revolver commitment + fee); min cash; growth path; target
margin + trajectory; D&A%; maint capex%; growth capex; NWC method (days|%); tax (rate, §163(j)
toggle + ATI basis + carryforward, NOL + 80% cap + §382 limit, minimum rate); fees (transaction,
financing, OID, monitoring OFF-by-default); exit (multiple, basis, fees); MIP (pool %, hurdle
MOIC — the promote instrument only; sweet-equity strips are v2); covenants (leverage max,
DSCR/FCCR min, step-downs optional).

### Class C — DERIVED (read-only, traceable)
EV or multiple (non-driver), total debt, sponsor equity, implied leverage on **FY(LTM) EBITDA
always** (regardless of valuation basis — lender convention), implied FCF conversion.

### Coherence gate
A **post-run check over `ModelOutput` from the same `runModel` call** (never a second
calculation path): covenant self-breach, entry multiple vs trading multiple (±40% soft flag),
basis consistency, implausible days (DSO/DPO > 180, DIO > 365). It gates the *rendering* with
warnings, not the computation. A model built purely from suggestions must produce zero
warnings (tested).

## 4. Architecture

- **`lib/engine2/`** — pure TypeScript, framework-free, no React/store/formatting imports.
  `kernel/` (irr, rates, amort, waterfall primitives — pure math), `sourcesUses.ts`,
  `operating.ts`, `debt.ts`, `tax.ts`, `sequence.ts` (strict year-by-year evaluation — see
  below), `exit.ts`, `returns.ts`, `credit.ts`, `bridge.ts`, `scenarios.ts`, `check.ts`
  (coherence), `facade.ts` (`runModel(facts, assumptions): ModelOutput`).
- **No fixed-point solver in v1 — deliberately.** With interest on *beginning-of-period*
  balances (SPEC §4), the model is strictly sequential: interest is known from opening
  balances → tax → FCF → sweep → next year's opening balances. No intra-year circularity
  exists, hand goldens are exactly reproducible, and the solver-tolerance-vs-goldens conflict
  disappears. The solver returns only if a v2 feature creates a true cycle (e.g. same-year
  covenant-triggered trap), as its own spec'd module.
- **Dual-engine regime (temporary, guardrailed)** — because parallel engines are this
  project's documented killer: old `lib/engine` is frozen at Phase A (CI fails PRs touching it
  without a FREEZE-EXCEPTION label; every exception lands in DIFF_LEDGER.md); an
  import-boundary lint forbids engine2 importing engine/dealEngineTypes and forbids any UI
  module importing both; ENGINE_ARCHITECTURE.md is amended *at Phase A* (not F) with the
  regime and its sunset; prod bugs during the window are fixed in engine2 + ledgered — the old
  engine gets render-breaking hotfixes only.
- Kept: `lib/edgar/*` (+ Phase D extensions), the Vercel proxy, provenance types, the
  3-screen flow shell.
- Rebuilt in Phase E: store lifecycle, InputPanel (Class B + derived block), output tabs,
  formatting boundary (single module: %-vs-decimal at the edge, thousands separators, IRR to
  0.1pp, money to 1dp of millions), Excel export (E3 — it is a rewrite of a 106KB file, priced
  as such), AI modules against the new schema (E4).

## 5. Verification strategy (the missing instrument)

1. **Golden deals** — four regimes, all expressible in the v1 schema: (G1) all-equity;
   (G2) TLB + revolver + 75% sweep; (G3) senior + fixed-rate PIK note; (G4) loss-making with
   NOL + §163(j) binding. Each committed as an .xlsx for human audit **plus** an extracted
   JSON of expected values (with labeled intermediate columns — per-tranche interest, tax
   line, sweep pool — so modules can be tested before the whole pipeline exists) **plus** an
   agreement check between the two. Adjudication rule: on engine-vs-sheet mismatch, the line
   is re-derived a third time from SPEC formulas by someone other than the sheet author; a
   golden is gospel only after that second pass. Tolerances are explicit per quantity
   (±$0.005m at unit = $m; IRR ±0.1bp; float64 throughout, no intermediate rounding) — not
   "to the cent" prose.
2. **Invariant suite** — each property scoped to its stated valid domain (SPEC §14) so a
   failure is always a bug: S&U balances; BS closes; single running-cash variable never
   double-spent; cash ≥ floor unless revolver exhausted (flagged); balances ≥ 0; bridge
   reconciles to pre-MIP total equity with explicit fee/MIP walk-down lines; sensitivity
   center ≡ base; scenario base ≡ base; **operating-downside scenarios ⇒ IRR ≤ base**;
   monotonicities only on their frictionless domains.
3. **Coherent-suggestions test** (zero warnings from an all-suggested model).
4. **Differential vs old engine** — via an input adapter, on the clean-room regimes
   *expressible in the v1 schema*, comparing only definition-stable quantities, categorized
   against DIFF_LEDGER.md. Anything not matching a ledger row is the only investigation work.
5. **Adversarial review per phase** — against the spec, not against opinion.

## 6. Phase map

```
PHASE 0  Live-site hotfix (days)          — formatting, hide broken tabs, coherent covenant default
PHASE A  SPEC v1.0 (timeboxed 5 days)     — research pass, spec completion, dual-engine regime, ledger
PHASE B  Goldens + kernel                 ┐
PHASE C  Core engine (module-per-PR)      ├─ D runs in PARALLEL with B–C (needs only Phase A types)
PHASE D  Data layer                       ┘
PHASE E  UI rebuild (E1 store/inputs, E2 tabs, E3 Excel, E4 AI)
PHASE F  Flag cutover → differential vs ledger → delete lib/engine
PHASE G  Staged extensions (one at a time, spec-first)
```

Gates are defined in each phase file. Phase A is **timeboxed** and sign-off authority is the
owner after one review round — review-paralysis is this project's disease; the spec is
versioned (changelog + golden update), not litigated forever.

## 7. Owner decisions — RESOLVED 2026-07-05

The owner granted standing decision authority on 2026-07-05 ("make the best decision; the
goal is simply a model that can be used to evaluate LBOs in real-life PE workflows, no
placeholders or assumptions strictly; build autonomously"). Decisions locked:

1. **Phase 0 scope** — formatting + tab-hiding + covenant-default fix only; no FCF exhibit
   on the old engine (its numbers aren't trustworthy enough to promote).
2. **Saved models** — "unsupported" banner at cutover; the old ModelState shape is retired.
3. **Trading-multiple anchor** — IN for v1 (shares outstanding + one free quote endpoint via
   the existing proxy; implied trading EV/EBITDA next to the entry-multiple field).
4. **Trace mode** — v2 (Phase G-12); the spec + goldens carry auditability meanwhile.
5. **ESEF path** — kept live through the rebuild (shares RawHistoricals; low cost).
6. **Hold-period suggestion** — 5 years (underwriting convention), with the realized-hold
   (~7yr, Bain 2026) context line in the UI.
