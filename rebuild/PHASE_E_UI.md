# PHASE E — UI rebuild (four sub-phases; priced honestly)

**Goal:** rebuild the model experience on `ModelOutput`. The store, the biggest file in the
repo (excelExport, 106KB), and the AI modules are all keyed to the old `ModelState` — this is
the largest phase and is split accordingly. Prerequisites: Phases C + D.

## E1 — Store, inputs, formatting boundary
- New store lifecycle: `importFacts` → `suggest` (D7) → `editAssumptions` (badges) → `build`
  (= one `runModel` call) → `ModelOutput` in state. Old `ModelState` never enters new screens.
- InputPanel v2: Class B only, **core-8 tier always visible** (entry multiple + trading
  anchor, template picker/leverage, blended rate, growth, target margin, capex %, exit
  multiple, hold), Advanced groups collapsed; per-year arrays render as (start, terminal/decay)
  with "edit by year" expander; derived block read-only and visually distinct; badges
  everywhere (FACT / SUGGESTED history / SUGGESTED convention / TEMPLATE / AI / YOU / REQUIRED).
- **Formatting boundary module** (`lib/format/`): the ONLY place %-vs-decimal and
  number formatting happen. Engine floats never reach the DOM raw. (Kills the
  `0.3478173110887373` bug class for good.) Snapshot tests.
- **Saved models [OWNER DECISION #2]:** recommendation = "old saves unsupported" banner
  (load path shows: "This deal was saved by the previous engine — re-import from source").
- Screens 1–2 keep their shells; Screen 2 gains the history table (D1) + staleness label (D3)
  + one-click "Suggest everything" as primary CTA; Build gates on REQUIRED + MISSING exactly
  as today.

## E2 — Output tabs
Order: **Summary** (IC one-pager: hero sponsor IRR/MOIC, mini bridge, entry→exit multiple,
leverage + Y1 DSCR, FCF sparkline; each element deep-links) · Returns (3 streams + ladder +
bridges) · **Operating model** (the FCF waterfall table — new) · S&U · Debt schedule ·
Balance sheet · Credit (N/A semantics — no 9999/99 ever rendered) · Sensitivity · Scenarios
(incl. single-factor stress rows; per-scenario credit metrics + mini bridge).
Coherence warnings (from `check.ts`, same run) render as a banner strip; they gate rendering
prominence, never computation.
**Removal list (deliberate scope cuts, remove the UI surfaces cleanly):** Fragility tab,
Reality Check tab, fund-economics section, add-on inputs, partial-exit inputs, ratchet
fields, PIK per-year election toggles, refinancing editors, interim-distribution rows.
Trace mode: per [OWNER DECISION #4] recommendation, NOT in E — remove the toggle; revisit in G.

## E3 — Excel export rewrite (explicitly scoped — this is a rewrite, not a re-point)
New exporter reading `ModelOutput` only; sheets mirror the tab set; sensitivity sheets read
the engine's grids (parity preserved). Rebuild `excel-export-parity` test against engine2.
The old 106KB exporter dies with the old engine at Phase F.

## E4 — AI modules against the new schema
Gateway/providers unchanged. Rework: AI-suggest (fills Class B with AI badges + stated basis,
bounded by the same clamps as suggestions), `/redline` (reads assumptions + coherence flags),
memo generator (reads ModelOutput; the Summary tab is its skeleton), `/cetpar` goal-seek
(levers restricted to true inputs — the old "derived-field lever" no-op bug class is
structurally impossible now, keep it that way). If E4 slips, gate E with AI features stubbed
OFF visibly rather than half-wired.

## Gate (phase)
Live staging walkthrough of three real issuers — a US large-cap (Apple), a US mid-cap, and an
IFRS 20-F FPI — through import → suggest → build → every tab: zero raw floats, zero
sentinels, zero self-inflicted coherence warnings on all-suggested models, REQUIRED gating
works, removal list verified absent, Excel export opens and matches on-screen numbers for the
walkthrough deals. `npx vitest run` + `npm run build` green.
