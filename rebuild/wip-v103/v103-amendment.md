# SPEC v1.0.3 amendment draft (to apply after B2 merges, before C-module PRs)

## Changelog row

| v1.0.3 | 2026-07-06 | Phase B2/C build pass: (1) **Goldens corrected** — spec_calc.py read the
r2-recorded display EBITDA_adj for the §9 exit block (intermediate rounding, violating §15);
re-derived at full precision. Only exit blocks + return streams move (≤ $0.04m, ≤ 1.1bp);
G1's closed-form check values and every per-year schedule are unchanged. (2) **§3 step 6
post-breach semantics pinned**: when the revolver exhausts, the year closes below the floor
with the breach flag; closing cash may be negative; conservation (§14.3) is never clamped;
every subsequent year carries a block-severity `cash_floor_breach` coherence flag and the
run's outputs render with the insolvency warning ("never negative cash" described the
draw-to-floor design goal, not a clamp). (3) **v1 structural constraint**: term-tranche
maturity must exceed hold_years (no balloon/refinancing until Phase G); violation is an
input-gate rejection. (4) **§7 early-retirement write-off timing pinned**: book write-off in
the retirement year; the TAX deduction enters the FOLLOWING year's uncapped pool (§5 strict
sequentiality — retirement is only known post-waterfall); if retirement is in year N it
merges into the exit-year deduction. (5) **§12 bridge arithmetic pinned** (bars could not
reconcile exactly as drafted): the four bars decompose the FRICTIONLESS pre-promote delta
(EV − net debt, both ends): growth = M₀ΔB; multiple bar = ΔM × B₀ (the rigorous school —
the on-exit-EBITDA form folds the cross term in by construction, §12's own rejected
alternative); interaction = ΔM × ΔB; paydown = ND₀ − ND₁ (ND₀ = par − funded min cash,
ND₁ = payoff − closing cash). Walk-down from the bar sum: − entry costs (txn + financing
fees + OID) − exit costs (exit fees + monitoring termination) − MIP − rollover Δ (exit share − contributed) =
sponsor net Δ; §14.9 tests both identities exactly. types.ts `ValueBridge.walkdown` gains
`exit_costs`; `multiple_change_on_exit_ebitda` renamed `multiple_change_bar` (ΔM × B₀) —
naming had contradicted the explicit-interaction convention. Monitoring ANNUAL leakage is
embedded in the paydown bar via cash (not double-counted in the walk-down); the walk-down's
`monitoring_leakage` item is the termination component within exit costs plus a memo of the
annual drag, rendered from `gp_fee_income`. (6) **§9 entry NTM basis pinned by symmetry**:
entry valuation under `basis: 'ntm'` = fy_ebitda × (1 + growth[0]) (mirrors §9's exit
proxy; golden-uncovered, disclosed). | B2/C build (PR #69 note; C6/C8 gate construction) |

## SPEC section edits
- §3 step 6: replace "never negative cash" sentence with the pinned semantics (2).
- §3/§16: add the maturity > hold constraint (3).
- §7: add the early-retirement deduction-timing sentence (4).
- §9: add the entry-NTM sentence (6).
- §12: rewrite the bar formulas + walk-down list per (5).
- §14.9: restate as the two exact identities per (5).

## types.ts edits
- ValueBridge.walkdown: add `exit_costs: number`; keep `monitoring_leakage` (memo semantics
  per (5)); rename `multiple_change_on_exit_ebitda` → `multiple_change_bar`.

## Files in the amendment PR
- lib/engine2/SPEC.md (changelog + section edits)
- lib/engine2/types.ts (ValueBridge)
- scripts/goldens/spec_calc.py (full-precision exit basis — scratchpad/spec_calc_patched.py)
- tests/goldens/** (regenerated — scratchpad/goldens-new/)
- tests/goldens/DERIVATION.md (correction record + re-adjudication sign-off for the exit
  lines, by independent agent when capacity returns)
