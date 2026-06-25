# Engine Architecture & Source of Truth

**Status:** Governance reference. Read before changing any financial calculation.

---

## 1. Source of truth

The **TypeScript engine** in `lib/engine/` is the **single source of truth** for
all financial calculations. It runs entirely client-side (in the browser): it is
what the UI executes, what users see, and what the Excel export is built from.

There is no separate backend **calculator**. The app ships as a static SPA
(`netlify.toml` / `vercel.json` are SPA rewrites); every calculation —
projections, debt schedule, returns, credit analysis, scenarios, the
three-statement close, and the Excel workbook — happens in `lib/engine/*`.

The **one** server-side surface (Phase 1) is a thin SEC EDGAR proxy
(`api/edgar/[...path].ts`, Vercel Edge) that the import flow calls to fetch public
filings — it sets SEC's required `User-Agent`, allowlists EDGAR endpoints (SSRF-safe),
and edge-caches responses. It computes nothing and holds no secrets; the engine remains
the single source of truth.

> **History.** This project previously carried a second, mirrored engine in
> Python (`backend/`, under FastAPI) plus a parallel Python Excel exporter,
> maintained as an independent cross-check under a "mirroring rule". That engine
> was never deployed, and the frontend stopped calling it once computation moved
> client-side (`lib/api.ts` is the now-empty stub left behind). It was removed to
> eliminate the cost of building and testing every feature twice. **If a
> server-side calculator is ever needed, run this same `lib/engine` under Node —
> do not fork a second implementation in another language.**

---

## 2. Engine layout

`fullRecalc` in `lib/engine/index.ts` is the orchestrator and the single entry
point: it runs the shared convergence solver (`lib/engine/converge.ts`) and
assembles the whole pipeline. Both the UI (`store/dealEngine.ts`) and the tests
call it — nothing re-assembles the pipeline by hand.

| Module | Responsibility |
|---|---|
| `index.ts` | `fullRecalc` orchestrator — assembles the pipeline |
| `converge.ts` | the **single** convergence solver (`runConvergenceLoop` / `runConvergedModel`), shared by `fullRecalc`, scenarios and fragility |
| `modelState.ts` | `ModelState` shape, entry-field derivation, default model |
| `sourcesUses.ts` | sources & uses reconciliation at close |
| `projections.ts` | revenue/margin build, P&L, NWC, FCF bridge |
| `debtSchedule.ts` | tranche schedules, interest, sweep, revolver, cash trap |
| `oid.ts` | OID amortisation schedule |
| `creditAnalysis.ts` | covenant headroom (leverage/DSCR/FCCR), springing, recovery |
| `returns.ts` | IRR/MOIC, MIP, partial exits, value bridge |
| `fundReturns.ts` | LP-level net IRR/MOIC, management fee, carry |
| `addOns.ts` | bolt-on acquisitions (revenue/debt/synergy/equity) |
| `balanceSheet.ts` | three-statement close |
| `scenarios.ts` | scenario & sensitivity generation (full model re-run per cell) |
| `realityCheck.ts`, `fragility.ts` | exit reality check, fragility scoring |
| `excelExport.ts` | the institutional Excel workbook (via `exceljs`) — a pure projection of `state`; its sensitivity sheets read the engine's `sensitivity_tables`, not a private approximation |
| `ai/*`, `aiGateway.ts` | AI gateway, providers, memo/solver |

---

## 3. Convergence loop

Projections and the debt schedule are mutually dependent (cash interest feeds FCF;
FCF feeds the sweep that changes balances and therefore interest). The single
solver in `lib/engine/converge.ts` (`runConvergenceLoop`) iterates
`projections → debt schedule → update projections` until cash interest stabilises
(PIK/sweep feedback). Tolerance scales with deal size
(`max(0.01, base_revenue × 0.0001)`); iteration 0 may exit early.
`debt_convergence_failed` flags a non-converged result. `fullRecalc`, the scenario
runner (`scenarios.ts`) and the fragility runner (`fragility.ts`) all call this one
solver — they never hand-roll their own loop — so they cannot diverge. The
`engine-parity` test pins base-scenario and fragility returns to `fullRecalc`.

---

## 4. Optional future cleanup — shared finance kernel

The convergence loop is now a single shared solver (`converge.ts`), and the Excel
export reads the engine's own sensitivity tables rather than a private
approximation — the two structural divergence sources are closed. A further
(optional) refactor is to factor the remaining pure arithmetic into a
framework-free `lib/finance/*` kernel:

- `lib/finance/interest.ts` — effective rate, average balance, PIK compounding
- `lib/finance/irr.ts` — `solveIrr`, `solveIrrTimed`, mid-year convention
- `lib/finance/sweep.ts` — sweep waterfall, priority tiers
- `lib/finance/returns.ts` — MOIC, DPI, RVPI, bridge attribution

This is organisational tidiness and testability, not a divergence fix. Not yet
started.

---

## 5. Test gates

| Gate | Command | What it protects |
|---|---|---|
| Engine + invariants | `npx vitest run` | invariants, Phase 1–4 features, regression baseline |
| Build | `npm run build` (tsc + vite) | type safety, production build |
| Three-statement close | part of vitest (`tests/three-statement.test.ts`) | balance sheet ties out every year |
| Regression baseline | `tests/regression.test.ts` | canonical deal outputs don't move silently (P5-4) |

CI (`.github/workflows/ci.yml`) runs vitest + build on every push and pull request.

---

## 6. Rules for changing a calculation

1. Implement in the relevant `lib/engine/*.ts` module.
2. Add or extend tests in `tests/*.test.ts` (vitest).
3. Keep the three-statement close gate green — any new flow that moves cash must
   have a balance-sheet offset.
4. If a change moves a canonical output **on purpose**, update
   `tests/regression/baseline.json` in the same PR and say why in the message.
5. Record any new or changed metric in `FINANCIAL_DEFINITIONS.md`.

---

## 7. Real-filing import + assumptions review (Phase 1)

The start flow is a three-screen, auditable sequence — the model is only reachable
after the user has seen and approved every input. `startScreen`
(`'source' | 'assumptions' | 'model'`) in `store/dealEngine.ts` gates it.

```
Source ──importFromEdgar──▶ Assumptions review ──buildModelFromDraft──▶ Model
(pick a company)             (edit + provenance, Build)                  (assumptions left, outputs right)
```

| Concern | Where |
|---|---|
| SEC proxy (only server surface) | `api/edgar/[...path].ts` — User-Agent, SSRF allowlist, edge cache, throttle |
| Typed EDGAR client + pure helpers | `lib/edgar/client.ts` (`searchCompanies`, `parseEdgarUrl`, `getCompanyFacts`, `getSubmissions`) |
| XBRL → factual inputs | `lib/edgar/mapXbrl.ts` — tag-alias chains, single-FY alignment, per-field provenance, gaps |
| Provenance / factual types | `lib/edgar/types.ts` (`RawHistoricals`, `SourcedValue`, `Provenance`, `ProvenanceMap`) |
| Draft composition | `lib/edgar/buildModel.ts` — facts (EDGAR provenance) + sector-default assumptions ('default') |
| Screens + badges | `components/deal-engine/start/{SourceScreen,AssumptionsReview}.tsx`, `inputs/ProvenanceBadge.tsx` |

**Inputs/assumptions/outputs are kept separate.** Factual inputs come from filings (each
carries `edgar` provenance and a filing link); forward/structure inputs are assumptions
(`default` → `ai` → `user` as they are suggested/edited); outputs are computed. Nothing
factual is silently defaulted — a filing gap is surfaced on Screen 2 (provenance becomes
`user` once filled). The entry **EV ↔ multiple** relationship has a **single driver**
(`entry.entry_valuation_driver`): one is the input, the other a read-only derived output —
there is no bidirectional recompute.

`lib/importTemplate.ts` remains the canonical field list (and the paste-into-a-chatbot kit
is kept as a power-user fallback reachable from the manual-entry path).

**Dev note:** the proxy runs on Vercel (or `vercel dev`); under plain `vite dev` the
`/api/edgar/*` routes 404, so the EDGAR path needs a Vercel runtime. The mapping and flow
are covered by `tests/edgar-*.test.ts` against a committed `companyfacts` fixture
(network-free).
