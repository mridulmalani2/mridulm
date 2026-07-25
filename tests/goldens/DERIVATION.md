# Golden derivation record (Phase B1)

**Method** (PHASE_B amendment, 2026-07-05): the reference derivation is
`scripts/goldens/spec_calc.py` — a SPEC-literal Python implementation (different language
from the engine, zero repo imports). Each `G*/expected.json` + `schedule.csv` is its
committed output; `tests/goldens.test.ts` re-runs the script and fails on any drift, and
re-asserts the SPEC §17 assertions in CI (22 at v1.0, 29 at v1.1.1).

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

**What this adds**: three new goldens for SPEC v1.1.0's interim distributions + restricted-
payment cash trap — **G2-DIST** (trap ON at net leverage 2.75), **G3-DIST** (trap OFF,
promote in the money) and **G2-DIST-D** (the §13 scenario variant). Each holds its base
golden constant in every field and adds exactly two: `structure.distributions` and
`covenants.rp_trap`. That is deliberate: every difference from the base is then attributable
to §3 step 7 / §3.7 alone, and the entry-S&U and unlevered-stream identities become exact
assertions rather than approximations.

**Branch coverage** (the reason for two workbooks rather than one):

| Branch | Where | Committed values |
|---|---|---|
| Trap capacity ZERO ⇒ fully blocked | G2-DIST Y1 | rp_max 0.00, paid 0.00, blocked=T, cash above floor 11.30 (so cash alone would have paid) |
| Trap clips BELOW request and cash cap ⇒ partially blocked | G2-DIST Y2 | rp_max 12.09 = paid; request 25.00, cash cap 15.68; blocked=T; pro-forma net leverage lands exactly on 2.75 |
| Cash cap binds, trap does NOT ⇒ not blocked | G2-DIST Y3 | paid 15.34, closing cash = floor 10.00, rp_max 75.65; blocked=F |
| Request binds | G2-DIST Y4/Y5 · G3-DIST Y2/Y4/Y5 | paid ≡ request |
| Year-N payment rides the period-N flow (§14.16) | G2-DIST Y5 · G3-DIST Y5 | G2-DIST 1052.06 = 1044.06 + 8.00; G3-DIST 603.69 = 583.69 + 20.00 |
| Trap OFF with LIVE requests (rp_max = +∞) | G3-DIST all years | rp_max N/A, blocked=F everywhere |
| §10 hurdle base INCLUDES cumulative distributions | G3-DIST exit | MIP 16.53; the pre-v1.1.0 base would pay 1.82 (9.1× discriminator) |
| §1 mid-year × distributions | G2-DIST | sponsor IRR 13.3906% period-end vs 13.4572% mid-year |
| §9 unlevered EXCLUDES distributions | all three | `returns.unlevered` byte-identical to the base golden |
| Entry frozen by a post-close flow | all three | `sources_uses` byte-identical to the base golden |
| §13 policy FROZEN across scenarios, BINDING is not | G2-DIST-D | same requests `[25,25,25,10,8]` and same level 2.75 as G2-DIST; Y2 flips from paid 12.09 to **paid 0.00, rp_max 0, blocked=T**; cumulative 45.43 → 35.25; sponsor IRR 13.3906% → 8.9638% |

**Golden-uncovered by design** (SPEC §17 [v1.1.1] records each with its reason; the G-1
engine PR must land a kernel/module fixture for every one, and the adjudication below
checks that list is complete): §3.7 at `EBITDA_adj ≤ 0`; accrued PIK inside a BINDING trap;
the exact §3.7 tie (`rp_max` == cash-capped amount ⇒ NOT blocked); §10's exit-equity cap
binding on the promote; payback REACHED inside the hold. **The completeness check earned
its keep: pass 4 added four more** — step 7 inside a revolver-draw/floor-breach year; the
inner `min(request, cash cap)` of the blocked FLAG; `rollover_equity > 0` (the pari-passu
split of a paid distribution); and §14.18's credit-metric exclusion (the reference
derivation emits no `credit` block).

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

- [x] **Adjudication pass 4a — G2-DIST (2026-07-24, independent agent): SIGNED.** **392
  lines** hand-derived from SPEC §1–§11/§14/§15/§17 at full precision with a from-scratch
  implementation written from the spec text (`spec_calc.py` never opened, imported or run);
  **zero mismatches beyond tolerance**. The deriver was anchored first: run with an empty
  schedule and no trap it reproduced the signed G2 golden on 45 sampled leaves plus exit
  equity, IRR and MOIC. Load-bearing confirmations: `rp_max` [0.00, 12.0897, 75.6454,
  142.5246, 218.0190]; Y2 pro-forma net leverage **(350.2689793 − 13.5864793)/122.43 =
  2.750000000000000, error 0.0e+00**; Y3 closing cash exactly 10.000000; final sponsor flow
  1044.0616 + 8.00 = 1052.0616 (§14.16); BS closes to ≤1.2e−13 every year *only* with §8
  [v1.1.1]'s `− paid` leg; DPI/payback/mid-year all reproduced. **Eight adversarial probes,
  each shown to DISCRIMINATE** the spec's reading from the plausible wrong one: measuring
  `gross_debt_end` at the beginning balance instead → paid [0, 0, 18.36, 10, 8]; reading
  `blocked` as "clipped for any reason" → [T,T,T,F,F] ≠ committed; shifting the whole
  period-N flow under mid-year → 15.0199% ≠ 13.4572%; counting exit toward payback → year 5
  ≠ N/A. Two precision proofs: the committed IRR 0.133906 is reachable only from
  full-precision flows (the stored 2dp flows give 0.13390**7**), and G2-DIST's Y2 sweep pool
  and sweep applied are **identical to G2's** — direct empirical proof that step 7 runs
  after steps 5/6 and cannot retro-fund the sweep. 21 leaves sit exactly on the ±0.005
  display boundary; all 21 are inherited G2 lines whose exact decimal ends in …5 at the
  third place — step 7 introduced none.
- [x] **Adjudication pass 4b — G3-DIST (2026-07-24, independent agent): SIGNED.** **397
  lines** hand-derived the same way, plus 8 `schedule.csv` lines and a **64-line
  back-reproduction of the signed G3** with distributions zeroed (0 mismatches) to anchor
  the deriver; **zero mismatches beyond tolerance** (largest money delta 0.0050, all exact
  half-cent display ties; largest IRR delta 0.03bp). Confirmed: `rp_max` null and
  `blocked` false in all five years; Y1/Y3 cash-capped to closing cash **exactly 8.000000**;
  Y2/Y4/Y5 request-capped; PIK ending 135 × 1.12⁵ = 237.916127 **byte-identical to G3** (a
  pro-rata sweep including the PIK would give 172.67); MIP **16.531017** vs **1.816980**
  under the pre-v1.1.0 hurdle base — the 9.10× discriminator §17 claims; BS `|check|` < 1e-12
  at every t. **The §10 no-double-count question was answered with arithmetic, not
  assertion**: G3's total value returned is 703.83 while G3-DIST's is 600.23 + 98.09 =
  698.32 — **$5.51m LOWER**, which equals the incremental senior interest from not sweeping
  the distributed cash ($82.32 vs $76.80 = $5.52, flowing 1:1 because §163(j) binds every
  year so none of it is deductible). Each dollar is counted once — retained or paid, never
  both — and the amended base is conservative, not inflated. Further bugs the fixture is
  shown to catch: step 7 before step 5 (paid [6.68, 11.53, 8.97, 12.67, 16.25], MIP 0.00);
  a cash cap ignoring the floor (Y1 closing 4.68); a missing `− paid` equity leg (breaks
  `check` by 98.09); floor added instead of `max` (Y1 interest 23.90 vs 21.87); the v1.0.3
  rounded-EBITDA regression (`exit_ev` 921.70 proves full precision — rounded gives 921.74).

Both passes independently flagged the same pre-existing, out-of-scope defect:
`derived.entry_net_leverage_fy` is GROSS (par ÷ EBITDA) in all six pre-G-1 goldens while
§11 defines net leverage as (gross − cash) ÷ EBITDA_adj. It is byte-identical across every
golden and untouched by this extension, so it was ticketed separately rather than folded in.
**RESOLVED in SPEC v1.1.2** (owner-directed, own PR): the VALUE is correct and unchanged —
gross is what the market quotes and what §17 sizes tranches on — so the fix was the NAME.
The field is now `entry_gross_leverage_fy`; §11 states the convention with its rejected
alternative; the fixture regeneration renamed exactly one key per golden with **changed=0**
(9 removed / 9 added, every value identical). The adjudicators' find turned out to reach
further than the type: the Excel export and the AI memo prompt both LABELLED the entry
figure "net" directly above a genuinely-net final-year figure, so both read as one series
across two bases and overstated deleveraging.

**Independent hostile sign-off (spec-amendment rule — separate from the adjudications
above; the adjudicators judge the NUMBERS, this pass judges whether the amendment is
safe to build on):**

- **Round 1 (2026-07-24): REFUSED**, with the reviewer stating explicitly "I am not
  disputing a single committed value." It independently reproduced the additivity claim
  with its own comparator (changed=0 / removed=0 / added=270, plus a second check that
  pruning the 8 new key names reproduces the old JSON with identical key ORDER and float
  repr), confirmed the fixtures regenerate byte-for-byte, and verified `irr_mid_year ≡ irr`
  at RAW float level (every interim entry is `0x0.0p+0`; `irr(cfs).hex()` equal on all 12
  sponsor-side streams). Five BLOCKING findings, all about coverage and gates rather than
  arithmetic, all applied in this pass:
  1. The golden-uncovered list omitted **§12/§14.9's walk-down term** — no golden carries a
     `bridge` block at all. Added as §17 item (x), together with the observation that §10's
     hurdle base (TOTAL paid) and §12's walk-down (SPONSOR share) coincide only at
     rollover = 0, which is every golden — so no fixture can distinguish them.
  2. **§13's scenario × distributions** was neither covered nor listed. Closed with a
     GOLDEN rather than a list entry, as the reviewer preferred: **G2-DIST-D**.
  3. The `PENDING_G1_KEYS` guard probed a deal with NO schedule, so an engine that emitted
     the columns only when the feature is on would have slipped past it and left the C5
     gate skipping those columns on G1–G5 permanently. The guard now probes a LIVE schedule
     too, and §16 states the columns are emitted unconditionally.
  4. Four output surfaces (`returns.dpi`, `payback_year`, `irr_mid_year`, the
     `distributions` block) had NO pending-key mechanism at all — the C6 gate hard-codes
     cashflows/irr/moic and would have ignored them forever. A matching self-deleting guard
     now sits in `tests/engine2-exit-returns.test.ts`.
  5. The unlevered-membership assertion tested only stream LENGTH — vacuous, since adding
     `paid[t]` to every interim UFCF passes it. Replaced with the byte-identity §17 and
     this document actually claim.
  Minor findings 6–10 applied in the same pass: DPI's VALUE is now asserted against
  `cum / sponsor_equity` (monotonicity alone passes any wrong denominator); payback is
  asserted against the series rather than a dead branch; §8 now REJECTS the two
  alternatives that also close the balance sheet (expense treatment — identical BS, so
  §14.2 cannot distinguish it; contra-asset presentation — which the fixtures DO
  discriminate) instead of over-claiming that §14.2 forces the rule, and the changelog no
  longer calls it a "clarification"; §16 states the ModelOutput contract; §1 resolves what
  `irr` means under `mid_year_irr: true`; the pre-amendment §14.16 mirror in the C6 gate
  carries an explicit note.
- **Round 2 (2026-07-24): GRANTED.** The reviewer re-verified every closure itself rather
  than reading the summary, and proved the two guards by **MUTATION** on an isolated copy of
  the tree (repo untouched): the conditional-emission engine that provably defeated the
  round-1 guard is caught by the round-2 guard, and so are `rp_max: null` and
  `payback_year: null` — the natural feature-off values, and the exact pair a `toBeFalsy()`
  would have waved through. It re-ran the additivity comparison twice (dc90841 → 7f906f8:
  changed=0/removed=0/added=0; 9eb0135 → 7f906f8: changed=0/removed=0/added=270), confirmed
  the script is deterministic across five regenerations, and re-enumerated all 37
  behavioural branches from scratch. It also noted a bonus G2-DIST-D delivers unplanned: it
  blocks 50.00 of requests across Y1–Y2 yet pays only 17.25 in Y3 (cash-capped, request 25)
  and exactly 10.00 in Y4 against a 14.64 cash cap — a far sharper no-accrual discriminator
  than G2-DIST alone. Three text-only conditions attached and applied: the §10 duplicated
  clause, §17 item (xi) for the coherence WARN, and §16's output-contract omissions. **The
  WARN condition matters beyond the list**: `engine2-facade-scenarios.test.ts` asserts
  `coherence == []` for every golden, and the DIST goldens are designed to trip
  `distribution_blocked` — so that convention is amended deliberately in §17 rather than
  discovered as a failing test on day one of the engine PR.

**Independent hostile ACCURACY AUDIT of the G-1 engine (2026-07-25): CLEAN.** A separate
agent recomputed ~110 load-bearing values from SPEC — by hand AND via a second Python
implementation structured unlike `spec_calc.py` — and cross-checked every IRR with
`numpy.roots` (polynomial method, different from the engine's bisection). **Zero disagreed
beyond ±$0.005m / ±0.1bp.** It confirmed the reference derivation is genuinely independent
(byte-reproduces all 9 fixtures), §3.7's normative EBITDA_adj ≤ 0 branch is correct through
the real kernel, the multi-root IRR policy is sound, no rounded value re-enters arithmetic,
and float drift (~1e-11 relative) sits 4–6 orders under the gate. It found **no wrong
number**, and four MINOR proof-system/coverage holes — places where SPEC §17 claimed a
fixture existed but none did, so a *future* regression could pass undetected. All four are
now closed with directed fixtures, each mutation-verified against the exact mutant the audit
described:
- **(B) §17 item (x)'s §10 half was unguarded** — a `total→share` mutation of the §10 hurdle
  base passed 402/402. Now pinned by a rollover > 0 ∧ MIP ∧ distributions case
  (`engine2-facade-scenarios.test.ts`); the mutant fails it.
- **(C) §17 item (vii) had no fixture** — dropping the request term from the blocked flag
  passed 402/402. Now pinned by a directed kernel case (`engine2-kernel.test.ts`) with
  `rp_max` strictly between request and cash cap.
- **(A) the bridge `reconciliation_residual` re-encodes identity (a)** (the distribution term
  cancels out of identity (b)'s residual). Identity (b) is now asserted DIRECTLY on
  `walkdown.sponsor_net_delta` with distributions present; SPEC §12 states this honestly.
- **(D) §14.18 at EBITDA_adj ≤ 0 WITH a payment** was only ~1% likely per CI run. Now pinned
  by a directed net-cash kernel case (both sides of the money form negative).

**Status: G2-DIST, G3-DIST and G2-DIST-D are GOSPEL.** Engine2 modules are wrong wherever they
disagree with these fixtures; disputes reopen only via spec amendment + re-derivation.
`tests/engine2-sequence.test.ts` carries a self-deleting `PENDING_G1_KEYS` list so the C5
gate stays green while the engine lags the fixtures; the guard test fails the moment
`runCore` emits any step-7 column, forcing the list's removal.

---

## Phase G-2 — quarter-stitched LTM sizing basis (Tier B, SPEC §1.1 GRANTED)

**Method** (2026-07-25): the reference is `scripts/goldens/ltm_stitch.py` — a SPEC §1.1-literal
Python implementation of the LTM stitch, different language from the extraction code, ZERO repo
imports. It consumes synthetic companyfacts-shaped fixtures (the exact `CompanyFacts → concept →
unit → [{start,end,val,filed,form}]` shape `lib/edgar/history.ts` reads) and writes
`tests/goldens/g2ltm/<case>/expected.json`. `tests/goldens-g2ltm.test.ts` re-runs it and fails on
drift, and re-asserts the §1.1 stitch/refusal decisions in CI. This adjudicates the DATA-SIDE
stitch only — the engine is untouched (Tier B). The step-3 extraction PR adds the conformance test
`stitch(fixture) === expected.json` once the TS stitch exists.

**Line → SPEC §1.1 mapping**: `classify` = the widened day-count windows (full 350–380 / 9M
250–285 / 6M 165–200 / quarter 80–100); `dedupe` = history.ts rule 2 (latest `filed` wins, >1%
note vs earliest, vintage_count for M1 presence); `canonical_spans` = ONE anchor `e`, shared FY /
YTD_current / YTD_prior keys for revenue AND every EBITDA component (never per-metric spans);
gates = F1 abutment (`FY.end+1d == cur.start`), F7 52/53 (|Δspan| ≤ 7d), F3/M1 vintage
(prior-YTD `vintage_count ≥ 2` AND no >1% note on any span); `stitch` = `LTM = FY + YTD_c − YTD_p`
with EBITDA per component (OperInc + D&A), F4 single-basis pair (either refuses ⇒ BOTH → FY),
`badge` = fresh ≤4.5m / aging ≤14.5m / stale.

**Reference results (2026-07-25)**: (i) clean mid-year PROCEEDS rev 1080.0 / EBITDA 267.0 fresh;
(ii) 52/53-week PROCEEDS rev 1080.0 with the ≤7d disclosure note; (iii) FPI → FY 1000.0/250.0
aging, no stitch; (iv) missing D&A component → BOTH FY (EBITDA recomputed to FY 250.0, not the
stitched 267); (v) FYE-change abutment failure → FY 950.0/238.0 stale; (vi) restated prior-YTD
760→700 (7.9%) → BOTH FY (EBITDA FY 250.0, not the stitched value — the pair-fallback bug the
self-review caught); (vii) OperInc absent at prior-YTD → BOTH FY; (viii) NTM base case PROCEEDS
rev 1320.0 / EBITDA 328.0; (ix) ESEF single-vintage prior-YTD → FY, fail-closed (un-evaluable).

**Author self-review (2026-07-25)**: the first oracle draft had two defects, both caught before
adjudication by checking outputs against the hand design: (1) the pair fallback kept the *stitched*
EBITDA instead of recomputing FY (vi showed 267, must be 250); (2) EBITDA components selected spans
independently, so a component absence refused for the wrong reason and risked a cross-period mix
(Sep-2025 OI + Sep-2024 D&A). Both fixed by the canonical-shared-spans rewrite.

**Adjudication (PHASE_B rule — two independent passes; a golden is gospel only after signed).**
Each adjudicator hand-derives the assigned cases from SPEC §1.1 and the raw fixture inputs, NOT
from `ltm_stitch.py`'s algorithm, at the ±$0.005m / ±0.1bp bar.

- [ ] **Adjudication pass 1 (IN FLIGHT):** PROCEEDS arithmetic (i, ii, viii) hand-derived
  component-wise + badges; refusals (iii, iv). Recorded on completion.
- [ ] **Adjudication pass 2 (IN FLIGHT):** refusal branches (v abutment, vi restatement, vii
  component, ix vintage) + independent re-derivation of (i) and (viii) as a cross-check.

**Status: g2ltm fixtures are the STEP-2 TARGET (regeneration-gated, directed-asserted); they
become GOSPEL when both adjudication passes above are signed.**
