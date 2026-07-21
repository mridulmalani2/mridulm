# PHASE 0 — Live-site hotfix (ship within days, BEFORE the rebuild starts)

**Why this phase exists:** the site is a live public portfolio piece; recruiters see the
current embarrassments every day that Phases A–D run. These are display-layer and config
changes with near-zero risk, applied to the OLD code. They do not touch financial arithmetic
(one exception, item 3, is a default value, not a formula).

## Work items

1. **Formatting hotfix** (display layer only).
   - All money rendered with thousands separators, 1 decimal of millions (`$2,026,472.0m` →
     `$2,026.5bn` style is optional; separators are mandatory).
   - All percentage inputs display as percentages — fix the raw-decimal leak
     (`0.3478173110887373` in the EBITDA-margin field on the model screen; the review screen
     already shows `34.78`). Root cause: `%`-vs-decimal conversion missing on the model
     screen's InputField path — do the conversion in ONE place.
   - IRR to 0.1pp; MOIC/multiples to 0.01x; MIP promote to whole $m.
   - Add formatter snapshot tests (`tests/formatting.test.ts`).
   - Files: `lib/formatters.ts`, `components/deal-engine/inputs/InputField.tsx`,
     `components/deal-engine/inputs/InputPanel.tsx`, `components/deal-engine/outputs/*.tsx`.
2. **Hide the two broken tabs behind a flag** (they are cut from v2 anyway; don't leave broken
   versions live during the rebuild):
   - Fragility (live bug: −100bps margin shock shows +37bps IRR).
   - Reality Check (renders "1 CRITICAL, 0 WARNING FLAGS" with no flag detail).
   - Implementation: a `SHOW_LEGACY_TABS` const in `pages/DealEngine.tsx`; tabs and their
     computations skipped when false. Do not delete code.
3. **Fix the self-breaching default:** default DSCR covenant 1.25x vs the default deal's Y1
   DSCR of ~1.2x means every default model shows "Covenant breach Yr 1" on all four scenario
   cards. Change the default `dscr_covenant` to 1.10x (or default covenants to OFF —
   cov-lite — if trivially supported). File: wherever `createDefaultModelState` /
   sector defaults set covenants (`lib/engine/modelState.ts`, `constants.tsx`).
4. **[OWNER DECISION #1 — only if taken]** Read-only FCF exhibit tab from existing projection
   output (`AnnualProjectionYear` already computes every line). Recommendation in the master
   plan is to skip this and keep the FCF exhibit for v2.

## Explicitly out of scope
Any engine formula, any assumption-schema change, anything in `lib/engine/*.ts` beyond the
default-value edit in item 3. This phase must not create diff noise for the Phase F ledger —
log item 3 in `rebuild/DIFF_LEDGER.md` (entry L-7 pre-seeded).

## Gate
- `npx vitest run` + `npm run build` green; regression baseline untouched except a documented
  re-pin if item 3 moves scenario-card covenant flags (it changes no returns numbers).
- Live walkthrough: import Apple → build → all visible tabs show formatted numbers; no raw
  floats anywhere; no broken tabs reachable; scenario cards show no self-inflicted breach.
