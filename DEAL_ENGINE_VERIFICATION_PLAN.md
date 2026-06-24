# Deal Engine — Verification Plan (heavy, tool-assisted)

Status: **planned, not yet executed.** Scope = how to validate the LBO engine's financial
logic beyond static code review + the existing vitest suite. Ordered by credibility-per-effort.
Secrets (e.g. the Groq API key) are passed only as ephemeral env vars at runtime and are
never written into any tracked file. Rotate the Groq key after use.

---

## Track A — Clean-room numerical cross-check (zero setup, highest leverage)

**Goal:** an independent re-implementation of the core LBO math (Python, no shared code with
the TS engine) that recomputes IRR / MOIC / debt schedule / 3-statement close for a set of
deals, then diffs against the TS engine's `fullRecalc` output. Divergence = a bug in one of them.

**Steps**
1. Pick 6–8 deals spanning the regimes: bullet, cash-sweep, PIK, revolver-first, add-on,
   dividend-recap, high-leverage, all-equity. Reuse `tests/fixtures/canonicalDeals.ts` inputs.
2. Export each deal's resolved inputs to JSON (run `fullRecalc`, dump `ModelState`).
3. In Python (numpy/numpy-financial), independently build: revenue→EBITDA→FCF, debt schedule
   (avg-balance interest, sweep waterfall, PIK accrual), exit equity (net debt), and IRR via
   `np.irr`/Newton. **No reference to the TS formulas** — work from first principles + the
   documented conventions in `FINANCIAL_DEFINITIONS.md`.
4. Diff TS vs Python on: entry/exit equity, IRR, MOIC, net debt by year, leverage, DSCR,
   balance-sheet close. Flag any delta > 1e-6 (rounding) and investigate which side is right.
5. Convert each confirmed discrepancy into a failing vitest case, then fix.

**Catches:** sign/timing errors, IRR convention drift, sweep/PIK edge cases, balance-sheet
leaks — the bugs that survive a TS-only review because the test oracle is the same code.

**Acceptance:** TS == clean-room on all deals (within rounding), or every delta explained and
the correct side pinned by a new test.

---

## Track B — Live-app behavioral verification (browser / preview)

**Goal:** confirm the *running* app at `/research/toolkit` matches the engine and behaves, not
just that the modules compile.

**Steps (via Claude-in-Chrome or the in-chat preview, against `npm run dev`)**
1. Initialize a deal; read on-screen Returns / Debt / Credit / Sensitivity panels.
2. Cross-check each visible figure against `fullRecalc` for the same inputs (UI == engine).
3. Confirm `EXPORT .XLSX` sensitivity grid == on-screen heatmap (WS2 is unit-tested; this is
   the visual end-to-end confirmation).
4. Stress the input panel: extreme leverage, 0% growth, negative margins, 1-year hold — watch
   for NaN/Infinity/crashes or silent nonsense.
5. Screenshot the key states for the review record.

**Catches:** UI↔engine wiring gaps, formatter bugs, NaN propagation, broken states no unit
test exercises.

---

## Track C — AI-feature integrity fuzzing (Groq key, headless local dev)

**Goal:** verify the AI features (`/cetpar` goal-seek, `/redline`, plain-English assumption
edits in `lib/engine/ai/gateway.ts` + `solver.ts`) produce **valid, internally-consistent**
model changes — never silently corrupt the model.

**Steps**
1. Run a local harness with the Groq key as an env var (`GROQ_API_KEY`, ephemeral; never
   committed).
2. Drive a battery of prompts: `/cetpar I want 25% IRR`, "make revenue growth more
   conservative", "increase leverage to 6x", contradictory/again impossible goals.
3. After each AI edit, assert invariants: model still converges, balance sheet still closes,
   no field set out of its valid domain, goal-seek actually hits (or correctly reports it
   can't) the target, units/signs preserved.
4. Log any case where an AI edit breaks an invariant → guard in the gateway.

**Catches:** the single biggest credibility risk in an "AI that recalculates" tool — an edit
that produces confident-but-wrong numbers.

---

## Track D — Real-filing validation (SEC EDGAR, free, no connector)

**Goal:** validate against a *real* company, not synthetic inputs — and prove the model can
ingest reality (directly attacks the "would an analyst use this" worry).

**Data access:** SEC EDGAR is free and public — `https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json`
and `companyconcept` return every XBRL-tagged line item; only a descriptive `User-Agent`
header is required. No API key, no MCP, no connector. (Chrome can browse EDGAR, but the JSON
API is the right path for numbers.)

**Steps**
1. Pull LTM revenue / EBITDA / D&A / capex / debt for 2–3 real targets from `companyfacts`.
2. Build each as an LBO in the engine with defensible entry assumptions.
3. Sanity-check outputs against reality (e.g. published deal multiples, rating-agency leverage)
   and against a banker's gut (does a 6x-levered buyout of this profile return ~2.5x / ~20%?).
4. Document where the model's simplifications break on real data (working capital, one-offs,
   stock-comp, segment EBITDA) → feeds the realism roadmap.

**Catches:** oversimplifications that only surface on messy real financials; also produces a
ready-made "import a real company" feature spec.

---

## Sequencing

A (now, no setup) → C (Groq key, headless) → B (browser) → D (EDGAR). A and D need nothing
from you; B needs the Chrome extension connected; C needs the key live in a local run.
