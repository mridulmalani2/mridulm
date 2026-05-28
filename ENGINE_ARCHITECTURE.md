# Engine Architecture & Source of Truth

**Status:** Governance reference. Read before changing any financial calculation.

---

## 1. Source of truth

The **TypeScript engine** in `lib/engine/` is the **single source of truth** for
all financial calculations. It runs entirely client-side (in the browser): it is
what the UI executes, what users see, and what the Excel export is built from.

There is no separate backend calculator. The app ships as a static SPA
(`netlify.toml` / `vercel.json` are SPA rewrites); every calculation —
projections, debt schedule, returns, credit analysis, scenarios, the
three-statement close, and the Excel workbook — happens in `lib/engine/*`.

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
point: it runs the convergence loop and assembles the whole pipeline. Both the UI
(`store/dealEngine.ts`) and the tests call it — nothing re-assembles the pipeline
by hand.

| Module | Responsibility |
|---|---|
| `index.ts` | `fullRecalc` orchestrator + convergence loop |
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
| `scenarios.ts` | scenario & sensitivity generation |
| `realityCheck.ts`, `fragility.ts` | exit reality check, fragility scoring |
| `excelExport.ts` | the institutional Excel workbook (via `exceljs`) |
| `ai/*`, `aiGateway.ts` | AI gateway, providers, memo/solver |

---

## 3. Convergence loop

Projections and the debt schedule are mutually dependent (cash interest feeds FCF;
FCF feeds the sweep that changes balances and therefore interest). `fullRecalc`
iterates `projections → debt schedule → update projections` until cash interest
stabilises (PIK/sweep feedback). Tolerance scales with deal size
(`max(0.01, base_revenue × 0.0001)`); iteration 0 may exit early.
`debt_convergence_failed` flags a non-converged result.

---

## 4. Optional future cleanup — shared finance kernel

A clean (but no-longer-urgent) refactor is to factor the pure arithmetic into a
framework-free `lib/finance/*` kernel:

- `lib/finance/interest.ts` — effective rate, average balance, PIK compounding
- `lib/finance/irr.ts` — `solveIrr`, `solveIrrTimed`, mid-year convention
- `lib/finance/sweep.ts` — sweep waterfall, priority tiers
- `lib/finance/returns.ts` — MOIC, DPI, RVPI, bridge attribution

With a single engine this is organisational tidiness and testability, not a
divergence fix. Not yet started.

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
