# Divergence Ledger

Every known old-engine defect (L-x) and every intentional convention change (C-x) between
`lib/engine` (v1) and `lib/engine2` (v2). **Phase F's differential report is generated
against this table**: a v1-vs-v2 diff is acceptable iff it maps to a row here; anything else
is an investigation item. Rows are appended (never edited) from Phase 0 onward — by the Phase
A spec review, by every FREEZE-EXCEPTION patch to the old engine, and by every spec amendment
that moves a number.

## L — Known old-engine defects (seeded from the 2026-07 live walkthrough + audits)

| ID | Defect | Repro | v2 resolution |
|---|---|---|---|
| L-1 | Fragility: −100bps margin shock IMPROVES IRR (+37bps) — operating shocks re-price the multiple-driven entry EV, shrinking the equity check | Live site, Apple default flow, Fragility tab | SPEC §13: entry structure frozen under operating scenarios; invariant §14.8 |
| L-2 | Default deal breaches its own default DSCR covenant in Y1 (1.2x vs 1.25x) on all scenario cards | Live site, Apple default flow, Scenarios tab | Coherence gate + coherent-suggestions test §14.13; Phase 0 item 3 patches the old default (this row explains the Phase-0 diff too) |
| L-3 | Reality Check renders "1 CRITICAL, 0 WARNING FLAGS" with no flag content | Live site, Reality Check tab | Tab cut in v1 (Phase 0 hides it); returns in Phase G-4 with real data |
| L-4 | Raw float in EBITDA-margin input on model screen (`0.3478173110887373`); unformatted money (`$2026472.0`); MIP promote `$101194.7m` | Live site, model screen | Formatting boundary module (E1); Phase 0 item 1 patches display on old site |
| L-5 | No P&L/FCF exhibit despite the projection computing every line | Live site — no such tab | Operating-model tab (E2) |
| L-6 | Old sweep mechanic conflates ECF percentage with a per-tranche cap ("sweep% × outstanding"); accumulated-cash handling bolted on | `lib/engine/debtSchedule.ts` sweep pass | SPEC §3 pool mechanics — **numbers WILL differ on every sweep deal; this row covers it** |
| L-7 | (Phase 0, intentional patch to OLD engine) default DSCR covenant 1.25 → 1.10 | Phase 0 item 3 | Covered by L-2 |
| L-8 | Interest on avg(beginning, post-mandatory-amort) balance — nonstandard hybrid | `debtSchedule.ts` (documented in FINANCIAL_DEFINITIONS.md) | C-1 |
| L-9 | 9999/99 sentinels leak into displayed ratios and "headroom +97x" | `creditAnalysis.ts` | SPEC §11 N/A semantics |
| L-10 | DPI/payback degenerate but headlined (payback "4.4yr" = hold; DPI 0%) | Live site, Returns tab | v1 de-headlines both (SPEC §9) |
| L-11 | `ltm_*` labels on FY-anchored facts (stale up to ~11 months, unlabelled) | `lib/edgar/types.ts` | D3 rename + staleness badge (C-6) |
| L-12 | NWC fact = CurrentAssets − CurrentLiabilities (includes cash/current debt; Apple −4.25% of revenue driven by financing items) | `mapXbrl.ts` L269–280 | C-7 operating NWC |
| L-13 | Silent USD fallback for currencies outside {USD,EUR,GBP,JPY,INR} | `mapXbrl.ts` KNOWN_CURRENCIES | D6 blocking badge |
| L-14 | IFRS 20-F filers extract nothing (us-gaap-only read) yet flow is offered | `mapXbrl.ts` / `client.ts` | D6 mapCompanyFactsIfrs |
| L-15 | Arbitrary DEFAULT-badged forward assumptions (12/10/8/7/6 growth, 14x entry=exit, 4.5x leverage, base+6pp target margin) with no basis | `buildModel.ts` / sector defaults | Class-B basis system (suggestions from history/convention/template) |
| L-16 | Net debt floored at zero (`Math.max(0, debt − cash)`, `debtSchedule.ts:320`) — surplus cash above gross debt VANISHES from exit proceeds; all-equity G1 shows MOIC 0.97x / IRR −0.7% on a business that accumulated 82.5 of cash | F1 differential, G1 regime (2026-07-24); repro: any deal whose terminal cash exceeds gross debt | SPEC §9: exit equity nets ACTUAL net debt (cash fully credited); §8 BS carries closing cash; golden G1 adjudicates (engine2 IRR 6.4% reproduces the spec-derived golden) |

## C — Intentional convention changes (seeded from SPEC skeleton; Phase A completes)

| ID | Change | Old | New (SPEC ref) |
|---|---|---|---|
| C-1 | Interest convention | avg(beg, post-mandatory) | beginning-balance (§4) — interest slightly ↑ on amortizing tranches, sequential model |
| C-2 | Solver | fixed-point loop + tolerance + convergence flag | none in v1 (§5) — exact reproducibility |
| C-3 | Floating floor | max(base + spread, floor) | max(base, floor) + spread (§4) |
| C-4 | Sweep | per-tranche % cap | ECF pool × sweep% → priority tiers (§3) |
| C-5 | Sponsor outflow | rollover not netted | rollover netted; pari-passu at exit (§9) |
| C-6 | Fact labels | ltm_* | fy_* + staleness (D3) |
| C-7 | NWC | CA − CL | operating NWC (D2) |
| C-8 | Exit debt payoff | book-based | par + accrued PIK; OID/DFC write-off non-cash, tax-only (§9) |
| C-9 | Min cash at close | unfunded (implicit) | funded via "cash to B/S" use line (§2) |
| C-10 | Tax ordering | 163(j) → NOL(80%) → min tax | + 163(j) carryforward account, + §382 limit before 80% cap, min tax on pre-NOL base (§6) |
| C-11 | Mid-year convention | interim AND ambiguous exit shift | interim only, exit at t=N; inert in v1 (§1) |
| C-12 | "Gross IRR" | inconsistent fee membership (BUG-07) | series renamed pre-promote, membership table (§9) |
| C-13 | MIP | promote formula fed by sweet-equity-style inputs | promote-only, capped; sweet equity removed until G-8 (§10) |
| C-14 | Leverage basis under NTM entry | same EBITDA as valuation | always FY/LTM for sizing & covenants (§11) |
| C-15 | Monitoring fee | deducted, income leg vanishes | OFF by default; when ON: deducted + GP-income memo line (§9) |
| C-16 | Value bridge | reconciles "approximately", distributions once double-counted | exact to pre-MIP equity Δ + explicit walk-down (§12) |
| C-17 | §163(j) ATI basis default | `section_163j_ati_basis` default `'ebit'` (described post-2022 TCJA law) | default **EBITDA** — OBBBA (P.L. 119-21, Jul 2025) permanently restored EBITDA-based ATI for TY beginning after 12/31/2024; EBIT stays as a pre-2025 toggle (SPEC §6, DR-3) — deductible interest ↑ on levered deals |
| C-18 | Acquired-NOL usability | extracted NOL flowed straight into the tax schedule as usable | acquired-NOL survival is an explicit assumption, **default OFF** (target NOLs generally don't survive asset/338(h)(10)/336(e) structures — DR-3); fact still displayed; enabling activates the §382 limit (suggested = equity × LTTER ~3.58%) — cash taxes ↑ where the old engine assumed usable NOLs |
| C-19 | Tax deductibility of commitment fees & financing-fee amortization | commitment fees never tax-deducted; fee amortization lumped into (uncapped) interest deduction | commitment fees + financing-fee amortization = UNCAPPED ordinary deductions, OID amortization = §163(j)-capped interest (Treas. Reg. §1.163(j)-1(b)(22)) — SPEC §6 v1.0; cash taxes ↓ slightly on revolver deals, §163(j)-bound deals deduct fee amort the old engine would have capped |
| C-20 | NOL state machine | single NOL pool; §382 limit applied to the whole balance incl. post-close losses | two pools (acquired: §382 + layer cap, first; post-close banked: 80% cap, §382-free) with explicit loss branch — SPEC §6.3 v1.0; deals that bank losses post-close use them without §382 throttling (cash taxes ↓ vs old engine in recovery years) |
| C-21 | Financing-fee base | `financing_fee_pct × total_debt_raised` (drawn principal only — undrawn revolver commitments pay no upfront fee) | % × TOTAL COMMITMENTS incl. the undrawn revolver (SPEC §2, confirmed DR-2 Item 1) — equity check ↑ by fee% × undrawn commitments on revolver deals (F1 differential, 2026-07-24) |
