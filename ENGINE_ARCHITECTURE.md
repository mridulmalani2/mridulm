# Engine Architecture & Source of Truth

**Status:** Governance reference (refactor plan P5-1). Read before changing any
financial calculation.

---

## 1. Source of truth

The **TypeScript client engine** in `lib/engine/` is the **source of truth** for
all financial calculations. It is what the UI runs and what users see.

The **Python backend engine** in `backend/engine/` (+ Pydantic models in
`backend/models/`) is a **secondary analytical tool**. It exists for server-side
analysis and as an independent cross-check, not as the canonical calculator.

When the two disagree, the TypeScript result is authoritative for anything
user-facing.

---

## 2. The mirroring rule (non-negotiable)

> Any change to a calculation in the TypeScript engine **must** be mirrored in the
> Python engine within the **same PR**, with tests added/updated on **both** sides.

This is how the dual engine avoids the divergence that produced the original
18-bug cycle. A change that lands in only one engine is a regression in waiting.

### Practical checklist for an engine change
1. Implement in `lib/engine/*.ts` (source of truth).
2. Mirror in `backend/engine/*.py` (+ `backend/models/*.py` for new fields).
3. Add/extend tests in **both** `tests/*.test.ts` (vitest) and `tests/*.py` (pytest).
4. Run all three gates locally: `npx vitest run`, `python3 -m pytest tests/`,
   `npm run build`.
5. Keep the three-statement close gate (`tests/three-statement.test.ts`) green —
   any new flow that moves cash must have a balance-sheet offset.

---

## 3. Known, intentional divergences

The two engines are **not** byte-identical by design. Parity tests assert
*structural invariants*, not equal IRR/MOIC. Documented divergences:

| Area | TypeScript | Python | Why |
|---|---|---|---|
| Unlevered FCF | `EBITDA − tax − capex − ΔNWC` | NOPAT-based (`NOPAT + D&A − capex − ΔNWC − monitoring`) | Different FCF formulations; reconciled only by the shared kernel (P5-3) |
| Monitoring fee | flows through `ebitda_adj` → P&L → equity | kept out of `ebitda_adj`; charged to equity separately | pre-existing convention |
| Cash roll-forward | EBITDA-based FCF (tax effect only) | NI-based; non-cash items (fin-fee, OID, PIK) added back explicitly | follows each engine's FCF base |
| Add-on acquisitions | fully modelled (`lib/engine/addOns.ts`) | **not modelled** (model exists, no engine) | tech debt — Python has no add-on engine |
| Credit analysis | `lib/engine/creditAnalysis.ts` (covenant headroom, springing) | `backend/engine/reality_check.py` (no DSCR headroom; springing TS-only) | structurally different modules |
| `full_recalc` orchestrator | `lib/engine/index.ts` | none — tests assemble the pipeline manually | tech debt |

When you add a feature that touches an area marked **TS-only**, add the field to
the Python model for parity and note the divergence here.

---

## 4. Convergence loop

Both engines run an iterative `projections → debt schedule → update projections`
loop until cash interest stabilises (PIK/sweep feedback). Tolerance scales with
deal size (`max(0.01, base_revenue × 0.0001)`); iteration 0 may exit early.
`debt_convergence_failed` flags a non-converged result.

---

## 5. The durable fix — shared calculation kernel (P5-3, future)

The mirroring rule is a process control, not a structural guarantee. The durable
solution is a **single shared calculation kernel** with no framework dependencies:

- `lib/finance/interest.ts` — effective rate, average balance, PIK compounding
- `lib/finance/irr.ts` — `solveIrr`, `solveIrrTimed`, mid-year convention
- `lib/finance/sweep.ts` — sweep waterfall, priority tiers
- `lib/finance/returns.ts` — MOIC, DPI, RVPI, bridge attribution

Both engines would call the same arithmetic (the Python side via a shared test
harness or WASM), eliminating divergence by construction. This is a large,
multi-PR effort and is **not** yet started; until then, the mirroring rule above
is mandatory.

---

## 6. Test gates

| Gate | Command | What it protects |
|---|---|---|
| TS engine | `npx vitest run` | invariants, Phase 1–4 features, regression baseline |
| Python engine | `python3 -m pytest tests/` | mirrored invariants & features |
| Build | `npm run build` (tsc + vite) | type safety, production build |
| Three-statement close | part of vitest | balance sheet ties out every year |
| Regression baseline | `tests/regression.test.ts` | canonical deal outputs don't move silently (P5-4) |

CI (`.github/workflows/ci.yml`) runs all three on every push and pull request.
