# Golden derivation record (Phase B1)

**Method** (PHASE_B amendment, 2026-07-05): the reference derivation is
`scripts/goldens/spec_calc.py` — a SPEC-literal Python implementation (different language
from the engine, zero repo imports). Each `G*/expected.json` + `schedule.csv` is its
committed output; `tests/goldens.test.ts` re-runs the script and fails on any drift, and
re-asserts the 22 SPEC §17 assertions in CI.

**Line → SPEC mapping**: every block of spec_calc.py carries its SPEC section marker
(§2 S&U/plug · §3 waterfall & running-cash · §4 beginning-balance interest, max(base,floor)+spread,
PIK on beginning balance · §6 two-pool tax state machine incl. loss branch, §382, floor ·
§7 margin trajectory / NWC days / split OID vs fee amortization pro-rata by commitment ·
§8 opening BS + goodwill plug + PP&E roll, per-year close asserted < $0.005m ·
§9 exit equity = EV − payoff + cash − fees; three return streams per the fee-membership table ·
§10 promote = min(pool × max(0, proceeds − hurdle × invested), exit equity)).

**Assertion results (2026-07-05)**: 22/22 pass — G1 closed-form check values exact
(sponsor 209.0 / FCF 16.5 / exit equity 284.5 / MOIC 1.3612 / IRR 6.3622%); G2 §163(j)
positive headroom all years, revolver undrawn, sweep pool positive; G2-D IRR 8.88% vs base
13.19% with S&U byte-identical (entry frozen); G3 §163(j) binds all 5 years, carryforward
10.06→28.79 monotone, PIK payoff 237.92, promote in the money (17.36); G4 Y1 banks 1.81
post-close NOL, 15% floor binds Y2–Y3, §382 caps acquired usage at 3.0 from Y3, acquired
pool ends 28.88; G5 revolver draws 3.62 in Y1 (closing cash = floor 4.0), repaid by Y3,
no breach.

**Adjudication (PHASE_B rule — second independent pass)**: recorded below by the
adjudicating agents; a golden is gospel only after this section is signed.

- [x] **Adjudication pass 1 (2026-07-05, run wf_01aabc2d, agent a6f29b1): SIGNED.** 60 lines
  hand-re-derived from SPEC (G3 Y1 complete incl. S&U/goodwill/tax/waterfall/BS-close;
  G5 Y1 waterfall incl. the draw-to-floor) — zero mismatches beyond ±$0.005m.
- [x] **Adjudication pass 2 (2026-07-05, run wf_01aabc2d, agent a176fad): SIGNED.** 107 lines
  (G4 tax state machine Y1–Y3 incl. loss banking, 80%/§382 double cap, 15% floor; G2 Y1
  complete; G1 all five closed-form values) — zero mismatches beyond ±$0.005m.

Ambiguities the adjudicators resolved (all confirmed by fixtures, now stated in SPEC
v1.0.2): golden defaults ati_pct 30% / min_rate 0 / rollover 0; commitment fee on
beginning-of-year undrawn; NWC[0] = pct × facts revenue. Note: expected.json stores 2dp
display values — differences of exactly 0.005 vs full-precision hand derivation are
display rounding at the tolerance boundary, not engine values.

**Status: G1–G5 + G2-D are GOSPEL. Engine2 modules (Phase C) are wrong wherever they
disagree with these fixtures; disputes reopen only via spec amendment + re-derivation.**

---

## v1.0.3 correction record (2026-07-21)

**What moved and why**: spec_calc.py's §9 exit block read `out["operating"][-1]["ebitda_adj"]`
— the r2-ROUNDED recorded display value — as the exit-EV basis. That is an intermediate
rounding, violating SPEC §15 ("no intermediate rounding"); the fixtures disagreed with a
full-precision hand derivation of the exit block by up to half a display cent. The script
now carries the exit-year `EBITDA_adj` at full precision (`ebitda_adj_full`) into §9.

**Measured movement** (old → new fixtures, leaf-by-leaf diff): only exit blocks
(`exit_ev`, `exit_equity_pre_mip_total`, `sponsor_share`) and the three return streams'
final flows/IRRs/MOICs move. Max non-IRR delta **$0.04m** (G3 `exit_ev` 921.74 → 921.70);
max IRR delta **0.23bp** (G5 pre-promote/sponsor 15.9626% → 15.9649%). **G1 is
byte-unchanged** (its closed-form §17 check values were derived at full precision from
the start), and **every per-year schedule row (operating / tax / tranches / revolver /
waterfall / balance-sheet / credit) in every golden is byte-unchanged** — the correction
reaches only §9 and downstream.

Also in this pass (both **golden-inert**, verified by regeneration byte-compare):
- **§6.3 [v1.0.3]**: post-close 80% cap re-based to the residual income after a pre-2018
  acquired layer (IRC §172(a)(2)(B)(ii)) in both the levered and unlevered tax paths.
  All goldens run `arose_pre_2018: false`; fixtures identical before/after.
- The §17 asserts were re-run post-regeneration: 22/22 still pass (`tests/goldens.test.ts`).

**Independent verification of this correction**: the patched script was re-run from a
clean checkout in an isolated scratch area and reproduced all 12 regenerated fixture
files **byte-for-byte**; the leaf-diff bounds above were measured by an independent
comparison script, not asserted from the patch.

**Re-adjudication (spec-amendment rule — exit lines only)**:

- [x] **Adjudication pass 3 (2026-07-21, independent agent): SIGNED.** 192 exit-block and
  return-stream lines hand-derived from SPEC §7/§9/§10/§17 at full precision (schedule
  rows reused from the 2026-07-05 adjudication — byte-unchanged by this correction; a
  full-precision rebuild of the chain reproduced the reused payoff/closing-cash rows
  within display rounding) — zero mismatches beyond ±$0.005m / ±0.1bp. Exit EVs re-derived
  from the §7 revenue chain × trajectory (e.g. G2 9.0 × 136.39289664 = 1227.536070,
  G3 8.5 × 108.43586208 = 921.704828, G4 7.0 × 38.54777472 = 269.834423,
  G5 7.0 × 22.00214016 = 154.014981); G3 MIP 0.15 × (703.833238 − 1.5 × 392.075) =
  17.358111 → 17.36 in the money; G1 §14.14 closed form exact ((284.5/209)^(1/5) − 1 =
  6.3622%, MOIC 1.3612); every recorded IRR verified by NPV(recorded_irr, fixture stream)
  ∈ [−0.007, +0.007] and by an independent full-precision IRR agreeing to <0.01bp.
  Boundary note: half-cent gaps at exactly 0.005 (e.g. G3 payoff full 263.767724 vs
  displayed 263.77) are the known 2dp display artifacts, per the v1.0.2 note. Movement
  bounds independently confirmed: (i) only `exit.*` + `returns.*` leaves moved — 56
  leaves across G2/G2D/G3/G4/G5, every per-year schedule row and all six schedule.csv
  files byte-identical; (ii) max non-IRR delta $0.04m (G3 exit_ev 921.74 → 921.70,
  exit_equity_pre_mip_total 703.87 → 703.83; max MOIC delta 0.0003); (iii) max IRR delta
  0.23bp (G5 pre-promote/sponsor 15.9626% → 15.9649%); (iv) G1 expected.json
  byte-unchanged.

---

## v1.1.1 Phase G-1 golden extension (2026-07-24)

**What this adds**: two new goldens for SPEC v1.1.0's interim distributions + restricted-
payment cash trap — **G2-DIST** (trap ON at net leverage 2.75) and **G3-DIST** (trap OFF,
promote in the money). Each holds its base golden constant in every field and adds exactly
two: `structure.distributions` and `covenants.rp_trap`. That is deliberate: every
difference from the base is then attributable to §3 step 7 / §3.7 alone, and the entry-S&U
and unlevered-stream identities become exact assertions rather than approximations.

**Branch coverage** (the reason for two workbooks rather than one):

| Branch | Where | Committed values |
|---|---|---|
| Trap capacity ZERO ⇒ fully blocked | G2-DIST Y1 | rp_max 0.00, paid 0.00, blocked=T, cash above floor 11.30 (so cash alone would have paid) |
| Trap clips BELOW request and cash cap ⇒ partially blocked | G2-DIST Y2 | rp_max 12.09 = paid; request 25.00, cash cap 15.68; blocked=T; pro-forma net leverage lands exactly on 2.75 |
| Cash cap binds, trap does NOT ⇒ not blocked | G2-DIST Y3 | paid 15.34, closing cash = floor 10.00, rp_max 75.65; blocked=F |
| Request binds | G2-DIST Y4/Y5 · G3-DIST Y2/Y4/Y5 | paid ≡ request |
| Year-N payment rides the period-N flow (§14.16) | G2-DIST Y5 · G3-DIST Y5 | final sponsor flow 1052.06 = sponsor_share 1044.06 + 8.00 |
| Trap OFF with LIVE requests (rp_max = +∞) | G3-DIST all years | rp_max N/A, blocked=F everywhere |
| §10 hurdle base INCLUDES cumulative distributions | G3-DIST exit | MIP 16.53; the pre-v1.1.0 base would pay 1.82 (9.1× discriminator) |
| §1 mid-year × distributions | G2-DIST | sponsor IRR 13.3906% period-end vs 13.4572% mid-year |
| §9 unlevered EXCLUDES distributions | both | `returns.unlevered` byte-identical to the base golden |
| Entry frozen by a post-close flow | both | `sources_uses` byte-identical to the base golden |

**Golden-uncovered by design** (SPEC §17 [v1.1.1] records each with its reason; the G-1
engine PR must land a kernel/module fixture for every one, and the adjudication below
checks that list is complete): §3.7 at `EBITDA_adj ≤ 0`; accrued PIK inside a BINDING trap;
the exact §3.7 tie (`rp_max` == cash-capped amount ⇒ NOT blocked); §10's exit-equity cap
binding on the promote; payback REACHED inside the hold.

**Movement in the pre-existing goldens: NONE — proved, not asserted.** A leaf-by-leaf
comparison of every `expected.json` at HEAD against the regenerated tree reports
**changed=0, removed=0, added=270** across G1/G2/G3/G4/G5/G2-D, and all six `schedule.csv`
diffs are **pure appends** (5 added lines each, zero deletions). The 270 added leaves are
the new columns only: `waterfall[].{distribution_requested, rp_max, distribution_paid,
distribution_blocked}`, `returns.{dpi, payback_year}`,
`returns.{sponsor_net,pre_promote}.irr_mid_year`, and the `distributions` block. On every
pre-G-1 golden they are trivially derivable: `distributions: null ≡ zeros` ⇒ paid = 0 by
`max(0, min(0, …))`, blocked = false by the §3.7 tie rule (`rp_max < min(0, …)` is false for
rp_max ≥ 0), rp_max = N/A with the trap off, DPI all zero, payback N/A — and
`irr_mid_year ≡ irr` **exactly** (bit-identical), because with no interim sponsor flow every
shifted term is `0/(1+r)^(t−0.5) = 0` and the NPV polynomial is unchanged. That identity is
itself asserted in `tests/goldens.test.ts`, so the additivity claim is re-checked in CI, not
just at review time.

**Adjudication (PHASE_B rule — second independent pass; goldens are gospel only after this
section is signed):**

- [ ] **Adjudication pass 4 (Phase G-1 extension): PENDING.**

**Status: G2-DIST and G3-DIST are NOT yet gospel — no engine code may implement §3 step 7
until pass 4 is signed.** `tests/engine2-sequence.test.ts` carries a self-deleting
`PENDING_G1_KEYS` list so the C5 gate stays green while the engine lags the fixtures; the
guard test fails the moment `runCore` emits any step-7 column, forcing the list's removal.
