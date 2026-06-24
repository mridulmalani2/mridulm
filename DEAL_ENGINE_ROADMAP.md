# Deal Engine — Build Roadmap

This file has **three phases**.

- **Phase 0 — Correctness pre-fixes** is a focused set of engine fixes to land *before* the
  import work, because they change the model's numbers. An agent can execute it directly
  (each item is a real fix with tagged files + a test + verification gate).
- **Phase 1 — Real-filing import overhaul** is a self-contained execution spec. An agent
  can start from it directly, read the tagged files, ask the listed clarifying questions
  via `AskUserQuestion`, and build the whole thing end to end. This is the priority feature.
- **Phase 2 — Remaining roadmap** is a tagged backlog (lower-priority convention items + the
  product features from the deep review). An agent should read each item's tagged files,
  then plan and discuss with the user one feature at a time before building.

**Do Phase 0 first.** Phase 1 surfaces real targets (often levered, sometimes loss-making)
where the tax and debt mechanics below actually bind — so the engine must be correct before
the import flow sits on top of it.

**Non-negotiables for both phases:** production-grade code, no placeholders or scaffolding,
no silent assumptions, inputs/assumptions strictly separated from outputs, every populated
field carries visible provenance, and every change is adversarially reviewed + covered by
tests (`npx vitest run`, `npm run build`, and ideally the clean-room cross-check in
`tests/clean-room.test.ts`).

---

# PHASE 0 — Correctness pre-fixes (do before Phase 1)

These change the model's numbers, so fix them on the current clean-room-verified engine
before layering the import flow on top. **Global rules for every item:** add/extend a vitest
test; keep `tests/clean-room.test.ts` (14 regimes), `tests/three-statement.test.ts`, and
`tests/regression/baseline.json` green — regenerate the baseline only for an *intentional*
move and say why in the commit; record any new/changed metric in
[FINANCIAL_DEFINITIONS.md](FINANCIAL_DEFINITIONS.md); and finish with an **adversarial review**
of the changed logic. Order: **0A → 0B → 0C → 0D** (tax first — it binds on every levered deal).

## 0A. Tax realism — do the three together (they share the projections.ts tax path and interact)

The correct ordering when income is positive is: **§163(j) limits the interest deduction →
taxable income → NOL offset (80% cap) → minimum tax**. Implement that sequence explicitly and
add a dedicated ordering test.

- **`tax_shield_on_interest=false` ignored (verify-first — likely a real bug).** The flag
  exists but the tax line appears to deduct interest regardless. **First confirm**: set it
  false and check cash taxes move; if they don't, gate the interest deduction on the flag in
  both tax blocks. Files: [lib/engine/projections.ts](lib/engine/projections.ts) (~L73, 164),
  [lib/engine/debtSchedule.ts](lib/engine/debtSchedule.ts) (~L215),
  [lib/importTemplate.ts](lib/importTemplate.ts) (L183).
- **NOL 80% limitation (missing).** Post-2017 NOLs offset only 80% of taxable income:
  `nolUsage = min(nolRemaining, 0.80 × taxableIncome)`. Parameterize the 0.80 and the
  pre/post-2017 distinction; optionally add a §382 annual-limitation input. Files:
  [lib/engine/projections.ts](lib/engine/projections.ts) (~L79–84, 167–173),
  [lib/dealEngineTypes.ts](lib/dealEngineTypes.ts) (tax assumptions).
- **§163(j) interest-deductibility cap (missing).** Cap deductible interest at **30% of ATI**
  (EBIT-based, post-2022); carry disallowed interest forward to future years (new state).
  Files: [lib/engine/projections.ts](lib/engine/projections.ts) (tax + interest),
  [lib/engine/debtSchedule.ts](lib/engine/debtSchedule.ts), [lib/dealEngineTypes.ts](lib/dealEngineTypes.ts).

## 0B. Debt mechanics

- **Sweep should use accumulated balance-sheet cash, not only current-year FCF (medium).**
  Add prior excess cash above the min-cash floor to the sweep pool —
  `availableForSweep += max(0, cashBalance − minCash)` — and reconcile the roll-forward so the
  swept cash leaves the balance. Net debt is largely unchanged (idle cash already nets at exit);
  this corrects **overstated later-year cash interest**. Adversarially confirm it does not
  double-count and that the all-equity / clean-room cases still close. Files:
  [lib/engine/debtSchedule.ts](lib/engine/debtSchedule.ts) (~L158–161 sweep pool + roll-forward).
- **OID effective-interest + write-off on prepayment (low).** Amortize OID by effective-interest
  against the actual ending balance, and write off remaining unamortized OID on a sweep-to-zero
  or refinancing event. Files: [lib/engine/oid.ts](lib/engine/oid.ts),
  [lib/engine/debtSchedule.ts](lib/engine/debtSchedule.ts), [lib/engine/balanceSheet.ts](lib/engine/balanceSheet.ts).

## 0C. Add-on economics

- **Integration costs & synergies must flow to cash/EBITDA (flagged).** Today `integration_cost`
  and synergies only appear in the EBITDA-bridge display, and consolidated EBITDA applies the
  *parent's* blended margin to acquired revenue. Inject `integration_cost_by_year` into FCF in
  the acquisition year, and feed each add-on's **own** EBITDA + cost synergies into consolidated
  EBITDA. Files: [lib/engine/addOns.ts](lib/engine/addOns.ts) (~L39, 49, 66–80),
  [lib/engine/projections.ts](lib/engine/projections.ts) (~L48–51),
  [lib/engine/ebitdaBridge.ts](lib/engine/ebitdaBridge.ts), [lib/engine/index.ts](lib/engine/index.ts).

## 0D. Valuation convention

- **LTM vs NTM EBITDA option.** Add an entry/exit EBITDA-basis flag (LTM default). NTM applies
  the multiple to forward EBITDA — projected year `hp+1` for exit, `base × (1 + Y1 growth)` for
  entry. Files: [lib/engine/returns.ts](lib/engine/returns.ts) (~L230–233 exit),
  [lib/engine/ebitdaBridge.ts](lib/engine/ebitdaBridge.ts) (~L11–13),
  [lib/dealEngineTypes.ts](lib/dealEngineTypes.ts) (entry/exit).

**Phase 0 done gate:** `npx vitest run` + `npm run build` green; clean-room (14 regimes)
all-pass; fresh adversarial review of the tax ordering and the sweep change.

---

# PHASE 1 — Real-filing import + assumptions-review overhaul

## 1. Goal

Replace the current "initialize from 6 fields" + "copy-a-prompt-into-a-chatbot, paste JSON
back" flow with a real, auditable start sequence:

1. **Source the target's actual financials** — primarily by pulling from **SEC EDGAR**
   (enter a company name / ticker / EDGAR URL, or pick from an autocomplete), with a
   secondary path to **upload 1–3 recent 10-Ks**.
2. **Present every assumption the model needs** (there are many more than three) on a single
   **review screen** — pre-filled from filings where derivable, AI-suggested where not,
   **every field editable**, **every field showing its source**. Nothing is silently assumed.
3. **Build** only after the user has seen and approved the assumptions.

Outcome: the LLM is in the loop but **explicit and auditable** (it proposes; the user
reviews/edits on screen), and **inputs/assumptions are cleanly separated from outputs**.

## 2. Read these first (do not skip — they define the current flow being replaced)

| File | Why |
|---|---|
| [lib/importTemplate.ts](lib/importTemplate.ts) | The current import kit (JSON template + paste-into-chatbot prompt). It enumerates the **full input surface** — the canonical list of every field the model needs. Phase 1 replaces this delivery mechanism but reuses the field list. |
| [store/dealEngine.ts](store/dealEngine.ts) | `initializeModel` (~L235), `generateAssumptions` (~L727), `loadModel` (~L819), `_lastEditedEntryField` handling (~L381–414, 651). The model lifecycle to rework. |
| [pages/DealEngine.tsx](pages/DealEngine.tsx) | The start UI: the "Initialize Model" form (calls `initializeModel`, ~L164), the import-kit buttons (`getAiPrompt`/`getInputTemplate`, ~L145–152), and `SECTOR_COMPS` hardcoded multiples (~L38). |
| [lib/engine/modelState.ts](lib/engine/modelState.ts) | `createDefaultModelState` and **`deriveEntryFields` (L6)** — the circular EV ↔ multiple ↔ leverage derivation driven by `_lastEditedEntryField`. This is the root of the "inputs that recompute circularly" problem. |
| [lib/dealEngineTypes.ts](lib/dealEngineTypes.ts) | `ModelState` shape: which fields are raw inputs, which are derived (entry EV, multiple, leverage, total_debt_raised, entry_equity), which are outputs. Phase 1 formalizes this split. |
| [components/deal-engine/inputs/InputPanel.tsx](components/deal-engine/inputs/InputPanel.tsx) | The left panel (598 lines) that currently mixes raw inputs, assumptions, and derived fields. Phase 1 makes it show **assumptions only**. |
| [components/deal-engine/layout/Header.tsx](components/deal-engine/layout/Header.tsx) | Top bar (Initialize / Import Kit / Save / Load / Export). |
| [components/deal-engine/chat/ChatPanel.tsx](components/deal-engine/chat/ChatPanel.tsx) · [lib/engine/ai/gateway.ts](lib/engine/ai/gateway.ts) · [lib/engine/ai/solver.ts](lib/engine/ai/solver.ts) | The existing AI layer + multi-provider gateway to reuse for "AI-suggest assumptions". |
| [components/deal-engine/ApiKeyModal.tsx](components/deal-engine/ApiKeyModal.tsx) | How the user's LLM API key is captured/stored (currently localStorage — note the confidentiality caveat). |
| [lib/traceMap.ts](lib/traceMap.ts) · [lib/traceTypes.ts](lib/traceTypes.ts) · [components/deal-engine/TraceGraph/](components/deal-engine/TraceGraph/) | Existing lineage/audit infra — **reuse it for per-field source links** rather than inventing a parallel system. |
| [DEAL_ENGINE_VERIFICATION_PLAN.md](DEAL_ENGINE_VERIFICATION_PLAN.md) | Track D documents the free, no-key EDGAR access path. |
| `vercel.json`, `netlify.toml` | Deploy targets (Vercel is primary, mridulmalani.com). Relevant to the proxy decision below. |

## 3. Hard architectural constraint (decide this before coding)

The app is a **static client-side SPA** — there is no backend today. **SEC EDGAR cannot be
called directly from the browser:**
- SEC **requires a `User-Agent` header** with contact info on every request; browsers
  **forbid** setting `User-Agent` from `fetch`, so direct calls get **403**.
- `data.sec.gov` / `sec.gov` do **not** return permissive CORS headers for browser XHR.
- SEC enforces **≤ 10 requests/second**; abuse → temporary IP ban.

**Therefore Phase 1 must introduce a thin serverless proxy** (the only new server-side
surface) that: sets the SEC-compliant `User-Agent`, forwards to EDGAR, caches responses
(company_tickers map for a day; companyfacts per CIK for hours), and throttles. Everything
else stays client-side.

→ **`AskUserQuestion` #1:** host the proxy as a **Vercel Function** (`/api/edgar/[...path].ts`,
recommended since Vercel is the primary deploy) or a **Netlify Function**, or both. Provide
the contact email to embed in the `User-Agent`.

## 4. The new start flow (three screens)

```
┌── Screen 1: SOURCE ──────────────┐   ┌── Screen 2: ASSUMPTIONS REVIEW ──┐   ┌── Screen 3: MODEL ──┐
│ Path 2 (preferred):              │   │ Extracted from filings (read-only │   │ Left panel =        │
│  • company autocomplete (name/   │ → │  + editable override, each with a │ → │  ASSUMPTIONS only    │
│    ticker) → CIK                 │   │  source link)                     │   │ Right =             │
│  • or paste an EDGAR URL         │   │ Assumptions you must set (AI-      │   │  OUTPUTS only       │
│  • or upload 1–3 10-Ks (Path 1)  │   │  suggest | edit each | provenance │   │ (clean separation)  │
│                                  │   │  badge) → [Build]                 │   │                     │
└──────────────────────────────────┘   └───────────────────────────────────┘   └─────────────────────┘
```

**Screen 1 — Source.** Default to the EDGAR path. Company autocomplete is powered by
`company_tickers.json` (resolves name/ticker → CIK). Accept a pasted EDGAR URL (parse the
CIK/accession out of it). Offer "upload 10-K(s)" as the secondary path. On selection, call
the proxy for the most recent annual financials.

**Screen 2 — Assumptions review.** Two clearly labelled groups:
- **Extracted from filings** (factual): LTM revenue, EBITDA & margin, D&A %, capex %, NWC %,
  net debt at entry, effective/statutory tax rate, sector. Each is **read-only by default with
  an "override" affordance**, and each shows a **source link** (XBRL tag + form + period +
  link to the filing).
- **Assumptions you must set** (forward/structure — NOT in filings): revenue growth path,
  target margin & trajectory, entry multiple (or EV), leverage & full debt-tranche structure,
  fees, MIP, hold period, exit multiple/method, credit covenants, churn, growth capex, interim
  distributions, add-ons. Each can be **AI-suggested** (one click fills the whole group from
  the existing AI gateway, sector-aware, citing its basis) and **individually edited**. Each
  carries a **provenance badge**: `EDGAR` / `AI` / `user` / `default`.
- A **single [Build] button** at the bottom; build is only reachable from this screen.

**Screen 3 — Model.** After Build: the **left panel shows only the assumptions** the user
just set (sourced from Screen 2); **all outputs render on the right**. This is what fixes the
inputs-mixed-with-circular-derived-fields problem (§6).

## 5. Data model & provenance

Introduce an explicit split (formalize in [lib/dealEngineTypes.ts](lib/dealEngineTypes.ts)):
- **`RawHistoricals`** — the factual inputs from filings (LTM revenue, EBITDA, D&A, capex, NWC,
  net debt, tax) each with `{ value, source }`.
- **`Assumptions`** — the forward/structure inputs (everything in the import template that is a
  decision, not a fact).
- **Derived** (EV, entry multiple, leverage, total_debt_raised, entry_equity) — **computed,
  never user-typed on the same footing as inputs.** Replace the bidirectional
  `_lastEditedEntryField` dance with **one explicit driver**: on Screen 2 the user chooses to
  set *either* the entry multiple *or* the EV (a radio/toggle); the other is derived and shown
  read-only. Remove the ambiguity from `deriveEntryFields`.
- **Outputs** — projections/returns/debt/credit/etc. (unchanged).
- **`ProvenanceMap`** — `fieldPath → { source: 'edgar'|'ai'|'user'|'default', detail, url? }`.
  Reuse [lib/traceMap.ts](lib/traceMap.ts)/[lib/traceTypes.ts](lib/traceTypes.ts) rather than a
  parallel structure; surface it as source badges/links on Screens 2 & 3.

## 6. EDGAR integration details

**Company resolution (autocomplete / dropdown):**
- `GET https://www.sec.gov/files/company_tickers.json` → `{cik_str, ticker, title}` map
  (~10k issuers). Cache it; build a client-side fuzzy search over `title`/`ticker`.
- Parse a pasted EDGAR URL for `CIK##########` and/or accession number.

**Filings list (for "3 most recent 10-Ks" + source links):**
- `GET https://data.sec.gov/submissions/CIK{cik10}.json` → recent filings with `form`,
  `accessionNumber`, `primaryDocument`, `filingDate`. Build the source URLs to the actual
  10-K documents from these.

**Financial facts (the numbers):**
- `GET https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json` → all XBRL facts, or
  `companyconcept/CIK{cik10}/us-gaap/{Tag}.json` per concept. `cik10` = 10-digit zero-padded.
- **Map US-GAAP tags → model inputs** (handle tag aliases + fall back gracefully):
  - Revenue (LTM): `RevenueFromContractWithCustomerExcludingAssessedTax` → else `Revenues`
    → else `SalesRevenueNet`. Use latest FY, or sum trailing 4 quarters for true LTM.
  - EBITDA = `OperatingIncomeLoss` + `DepreciationDepletionAndAmortization` (D&A tag aliases:
    `DepreciationAmortizationAndAccretionNet`, `DepreciationAndAmortization`). Margin = ÷ revenue.
  - Capex: `PaymentsToAcquirePropertyPlantAndEquipment` (÷ revenue).
  - NWC: `AssetsCurrent − LiabilitiesCurrent`, or `AccountsReceivableNetCurrent + InventoryNet
    − AccountsPayableCurrent` (÷ revenue).
  - Net debt at entry: (`LongTermDebtNoncurrent` + `LongTermDebtCurrent` + `ShortTermBorrowings`)
    − `CashAndCashEquivalentsAtCarryingValue`.
  - Effective tax rate: `IncomeTaxExpenseBenefit ÷ IncomeLossFromContinuingOperationsBeforeIncomeTaxes…`
    (fall back to a statutory default by jurisdiction).
  - NOL: `OperatingLossCarryforwards` if disclosed.
- **Every extracted value records provenance**: `{ tag, value, unit, fy, fp, accession, form,
  filed, url }`.

**Edge cases to handle explicitly (not silently):** foreign private issuers file **20-F**
(different/again sparse tags); financial-sector filers have non-standard statements; private
targets are **not on EDGAR at all**. When facts are missing, surface the gap on Screen 2 and
let the user enter the value (provenance = `user`) — never silently default a factual field.

→ **`AskUserQuestion` #2:** Path 1 (10-K upload + parse) — build now, or ship Path 2 (EDGAR API)
first and stub Path 1 behind a "coming soon"? (Recommended: Path 2 first; it's cleaner and
covers US issuers. Path 1 needs PDF/HTML/XBRL-document parsing — larger.)
→ **`AskUserQuestion` #3:** Currency — EDGAR reports USD; default imported deals to USD with a
visible override, or auto-handle multi-currency? 
→ **`AskUserQuestion` #4:** AI-suggest assumptions — reuse the existing multi-provider gateway
([lib/engine/ai/gateway.ts](lib/engine/ai/gateway.ts)) + the user's key, and which provider/model default?

## 7. Files: create vs modify

**Create:**
- `api/edgar/[...path].ts` (or Netlify equivalent) — the SEC proxy (User-Agent, cache, throttle).
- `lib/edgar/client.ts` — typed client for company search, submissions, companyfacts (calls the proxy).
- `lib/edgar/mapXbrl.ts` — XBRL-tag → `RawHistoricals` mapping with provenance + alias/fallback logic.
- `components/deal-engine/start/SourceScreen.tsx` — Screen 1 (autocomplete / URL / upload).
- `components/deal-engine/start/AssumptionsReview.tsx` — Screen 2 (grouped, editable, provenance, Build).
- `components/deal-engine/inputs/ProvenanceBadge.tsx` — the source badge/link component.
- Tests: `tests/edgar-map.test.ts` (tag mapping on fixture companyfacts JSON), plus store-flow tests.

**Modify:**
- [store/dealEngine.ts](store/dealEngine.ts) — replace `initializeModel` with an
  `importFromEdgar` / `loadFromHistoricals` + `applyAssumptions` + `build` sequence; add the
  `ProvenanceMap`; retire the paste-JSON `getAiPrompt` path (or keep as a power-user fallback).
- [lib/engine/modelState.ts](lib/engine/modelState.ts) — make `deriveEntryFields` single-driver
  (multiple **or** EV, explicit), remove `_lastEditedEntryField` ambiguity.
- [components/deal-engine/inputs/InputPanel.tsx](components/deal-engine/inputs/InputPanel.tsx) —
  render **assumptions only**; move derived fields to a read-only "derived" presentation.
- [pages/DealEngine.tsx](pages/DealEngine.tsx) — wire the 3-screen flow; remove/relocate the old
  Initialize form and import-kit buttons.
- [lib/importTemplate.ts](lib/importTemplate.ts) — repurpose as the canonical assumption schema +
  defaults consumed by Screen 2 (keep the field list; drop the chatbot-prompt delivery).

## 8. Acceptance criteria

- A user can type a real US company (e.g. a known issuer), see its **actual** LTM revenue/EBITDA/
  margins pulled from EDGAR **with working source links to the filing**, get a full set of
  AI-suggested assumptions they can edit, click Build, and get a model — **with no silently
  assumed factual input**.
- The model screen shows **assumptions on the left, outputs on the right**, with **no circular/
  derived field editable as if it were an input**.
- The proxy is SEC-compliant (User-Agent, ≤10 req/s, cached) and never exposes a secret.
- Tests: XBRL mapping covered on a committed fixture; the start flow covered; `npx vitest run`
  and `npm run build` green; the clean-room (`tests/clean-room.test.ts`) still passes.
- **Adversarial review pass** on the mapping logic (wrong tag → wrong headline number is a
  trust-killer) and on the proxy (SSRF/abuse, caching correctness).

## 9. Suggested build order

1. Proxy + `lib/edgar/client.ts` + a committed `companyfacts` fixture; prove a real fetch works.
2. `mapXbrl.ts` + `tests/edgar-map.test.ts` (the highest-risk correctness surface).
3. `RawHistoricals`/`Assumptions`/`ProvenanceMap` types + store sequence (`importFromEdgar` →
   `applyAssumptions` → `build`); single-driver `deriveEntryFields`.
4. Screen 1 (Source), Screen 2 (Assumptions review with provenance + AI-suggest), Screen 3 wiring.
5. InputPanel = assumptions-only; outputs-only on the right.
6. Path 1 (10-K upload) if in scope; otherwise stub.
7. Adversarial review + tests + build; update `ENGINE_ARCHITECTURE.md` with the new input flow.

---

# PHASE 2 — Remaining roadmap (tagged backlog; plan/discuss each before building)

Read the tagged files for an item, then **plan and discuss the approach with the user before
implementing**. Ordered by credibility-per-effort. (Severities/IDs reference the deep review.)

## 2A. Lower-priority convention items (the bigger correctness items are in Phase 0)

> The high-value tax/debt/add-on/NTM items were elevated to **Phase 0**. What remains here is
> genuinely low-severity polish — convention nuances, not wrong-number bugs.

| Item | What | Read |
|---|---|---|
| **Financing-fee amort over term, not hold** *(low)* | Amortize over each tranche's maturity (mirror OID), write off remainder on repay/refi. | [lib/engine/projections.ts](lib/engine/projections.ts), [lib/engine/balanceSheet.ts](lib/engine/balanceSheet.ts) |
| **Mid-year convention in P&L/FCF** *(low)* | The flag affects IRR timing but not the P&L/FCF build; either wire it through or document the limitation. | [lib/engine/projections.ts](lib/engine/projections.ts), [lib/engine/returns.ts](lib/engine/returns.ts) |
| **MOIC denominator vs displayed entry equity** *(UX)* | For add-on deals MOIC uses total invested (entry + follow-on) but the displayed `entry_equity` is entry-only, so they don't reconcile on screen. Expose `total_invested`. | [lib/engine/returns.ts](lib/engine/returns.ts), [components/deal-engine/outputs/ReturnsSummary.tsx](components/deal-engine/outputs/ReturnsSummary.tsx) |
| **D&A/capex ↔ PP&E roll-forward** *(low)* | D&A is revenue-pegged, decoupled from PP&E; net PP&E can drift. Seed entry PP&E, drive D&A off the asset roll-forward. | [lib/engine/projections.ts](lib/engine/projections.ts), [lib/engine/balanceSheet.ts](lib/engine/balanceSheet.ts) |
| **DSCR/FCCR sentinel headroom** *(low)* | "No debt service" years report a fake +97x headroom (the 99-cap leaks). Render N/A instead. | [lib/engine/creditAnalysis.ts](lib/engine/creditAnalysis.ts) |

## 2B. Killer features (demo → daily-use; the deep-review thesis)

| Feature | Why it closes the gap | Read |
|---|---|---|
| **Audit trail + version diff** | Every assumption change (manual or AI) timestamped old/new/why; diff two named cases. The IC/LP table-stakes Excel can't do cleanly. `modelVersion` is currently a bare counter. | [store/dealEngine.ts](store/dealEngine.ts) (`modelVersion`, edit actions), [lib/traceMap.ts](lib/traceMap.ts), [components/deal-engine/TraceGraph/](components/deal-engine/TraceGraph/) |
| **AI assumption-challenge with citations** | `/redline` should cite the comp/precedent **and** the cell behind each "aggressive" flag — a junior analyst that pressure-tests the model. | [lib/engine/ai/gateway.ts](lib/engine/ai/gateway.ts) (redline), [components/deal-engine/chat/ChatPanel.tsx](components/deal-engine/chat/ChatPanel.tsx) |
| **One-click IC-ready output pack** | Memo + sensitivity grids + value bridge + fragility → a clean branded PDF/deck (not just raw Excel). | [lib/engine/ai/memoGenerator.ts](lib/engine/ai/memoGenerator.ts), [lib/engine/excelExport.ts](lib/engine/excelExport.ts), [components/deal-engine/MemoModal.tsx](components/deal-engine/MemoModal.tsx) |
| **Harden `/cetpar` goal-seek** | Fix levers that silently no-op (leverage is a derived output; non-monotonic levers like hold). It's the standout differentiator vs Excel Goal Seek. | [lib/engine/ai/solver.ts](lib/engine/ai/solver.ts), [lib/engine/ai/gateway.ts](lib/engine/ai/gateway.ts) |

## 2C. Live data layers (free/low-cost; raise breadth & defensibility)

| Source | Use | Notes |
|---|---|---|
| **FRED** (Treasury, SOFR, ICE BofA OAS by rating) | Live base-rate + credit-spread assumptions; map implied rating → spread for tranche pricing. | Free key. Wire into [lib/engine/debtSchedule.ts](lib/engine/debtSchedule.ts)/[lib/engine/creditAnalysis.ts](lib/engine/creditAnalysis.ts) assumptions. Same proxy pattern as EDGAR. |
| **Damodaran datasets** (NYU Stern) | Industry betas, ERP, default-spread-by-rating for WACC and synthetic spreads. | Free annual CSVs. |
| **FMP / Financial Datasets** | Trading comps (EV/EBITDA) to benchmark entry/exit multiples; replace hardcoded `SECTOR_COMPS`. | Freemium; rate-limited. Precedent-transaction multiples have no good free source (the real paid gap — surface it in-UI as "the institutional data spine"). [pages/DealEngine.tsx](pages/DealEngine.tsx) `SECTOR_COMPS` (~L38). |

---

## Status of work already completed (do not redo)

The engine has been unified and hardened in two open PRs — read these before Phase 1 so you
build on the current architecture:
- **PR #55** — single convergence solver (`lib/engine/converge.ts`), Excel = engine sensitivity
  grid, net-leverage. See [ENGINE_ARCHITECTURE.md](ENGINE_ARCHITECTURE.md), [FINANCIAL_DEFINITIONS.md](FINANCIAL_DEFINITIONS.md).
- **PR #56** — 8 P0 financial-correctness fixes (MIP carry-above-hurdle, unlevered-IRR tax,
  rollover share, recovery year, junior seniority, leverage basis, fund waterfall + GP catch-up,
  all-equity balance-sheet close) + the permanent clean-room test ([tests/clean-room.test.ts](tests/clean-room.test.ts)).
