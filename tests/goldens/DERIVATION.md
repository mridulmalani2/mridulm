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

- [x] **Adjudication pass 1 (2026-07-25, agent aa390b6): SIGNED.** Cases (i, ii, iii, iv, viii)
  hand-derived from §1.1 + raw facts (no reuse of the reference algorithm): the PROCEEDS
  arithmetic component-wise (i/viii rev 1080/1320, EBITDA 267/328), the badges, the (iii) FPI
  and (iv) missing-component fallbacks. 5/5 EXACT (Δ=0.00), zero mismatches beyond ±$0.005m.
  Confirmed the (iv) F4 discipline (revenue forced to FY 1000, not the individually-stitchable
  1080) and that the 52/53 disclosure note attaches only to the genuine 7-day signature (ii),
  not the 1-day leap artifact (i/viii) — the reference's reading is correct.
- [x] **Adjudication pass 2 (2026-07-25, agent a51ab1b): SIGNED.** Refusal branches (v abutment,
  vi restatement, vii component, ix vintage) + independent re-derivation of (i) and (viii). 6
  EXACT (Δ=0.00). Verified the two self-review fixes hold: (vi) EBITDA = FY 250, NOT the stitched
  267 (pair fallback recomputes FY — same in v=238, vii/ix=250); and refusals attributed to the
  CORRECT gate (v=abutment only, vii=OperInc-absent), no misattribution. Every FY-fallback revenue
  uses FY (vii 1000 not 1080; v 950 not 990), and every as_of anchors correctly (stitch→e,
  fallback→FY period-end).

**Status: g2ltm fixtures (i)–(ix) are GOSPEL** (both independent passes signed, ±$0.005m). The
step-3 extraction/adapter PR's TS stitch is wrong wherever it disagrees; disputes reopen only via
a §1.1 amendment + re-derivation.

**Accuracy audit (2026-07-25, independent agent a6e77b2): 0 BLOCKING, 3 minor + 4 nits.** Verified
clean: empty engine-arithmetic-path diff; engine §17 goldens byte-identical; TS `ltmStitch` ≡ oracle
function-by-function; unit scaling exactly once; single-basis pair with no mixed-basis ratios;
FY-fallback keeps mapXbrl's richer figures; badge parity via the shared `stalenessTier`; B1 engine
half. Dispositions:
- **Minor 1 — stitch notes/refusal silently absorbed (F7/F10): FIXED.** mapXbrl now appends the
  stitch's disclosure notes (e.g. the ≤7d 52/53 approximation) to the LTM provenance detail, and the
  refusal reason to the FY-fallback ebitda detail.
- **Minor 2 — cross-span tag mix un-flagged, multi-tag path un-adjudicated: FIXED.** A stitching
  metric whose winning tag differs across FY/YTD_c/YTD_p now REFUSES → FY (fail-closed); §1.1 tightened
  the rule-1 "flag" to a refusal for the sizing basis; a directed conformance test pins it (the goldens
  stay single-tag).
- **Minor 3a — stale "ALWAYS FY EBITDA" comment (types.ts:223): FIXED** → "§1.1 FY(LTM) sizing basis."
- **Minor 3b — the twin comment at `sourcesUses.ts:82`: DEFERRED.** `sourcesUses.ts` is on the
  engine-arithmetic path; editing it (even a comment) would break the Tier-B empty-diff admission
  ticket. Deferred to the next engine-touching (Tier-A) PR, which legitimately carries an engine diff.
  The comment is not dangerous — a reader following M2's rule reads `facts.sizing_basis`, not the name.
- **Nits 4–7 (r2 half-up vs banker's; leap-day target; stitch-FY vs anchor; ESEF no-stitch): NOTED,
  not fixed.** Each is unreachable with integer-valued XBRL facts / a literal Feb-29 interim end /
  pathological non-annual full-year data, or is the accepted v1 ESEF-FY simplification (M1 refuses the
  common single-vintage case anyway; the UI badge still derives from period-end).

---

## Phase G-5 — refinancing events golden (Tier A, SPEC §18 GRANTED)

**What this adds**: ONE new golden, **G6-REFI** — G2 + a single §18 refinancing event on the TLB at
year R = 3 (reprice −100bp: spread 375→275bps; call premium 1.0% = 101 soft call; new maturity
6 years; new OID 0.5%; new financing fee 1.0%; new amort 1.0% of the new face). Every other field is
IDENTICAL to G2, so every difference is attributable to §18 alone (the DIST-variant discipline). The
reference derivation `scripts/goldens/spec_calc.py` gains a FULL, independent refi path (rate switch,
per-tranche OID/fee schedule swap on the par-for-par base `B`, the `pending_ret_ded` R+1 deferral, the
step-2R cash cost, the §18.6 DFC/NI legs) — it reuses NONE of the engine's swap logic (the engine has
none yet), so it is genuine independent ground truth (sign-off round-2 residual 2).

**Line → SPEC §18 mapping**: refi applied at the START of year R (before `financeLines`) = §18.3
start-of-year effectiveness; `B = bal[name]` = §18.2 par-for-par; `WO = oid_rem + fee_rem` = §18.5
old unamortized write-off; `premium/new_oid/new_fees` on `B` = §18.4 cash cost (basis `× B`, never
re-allocated); `c -= refi_cash_cost` after commitment fees = §3 step 2R; `uncapped += pending_ret_ded`
+ `pending_ret_ded = new_pending` at year end = §18.5 R+1 UNCAPPED deferral; `dfc += refi_dfc_delta`
and `ni -= refi_book_charge` = §18.6 BS-close legs.

**Branch coverage** (what G6-REFI pins, and what it leaves to directed engine fixtures, §18.11):

| Branch | Where | Committed values |
|---|---|---|
| Reprice effective the whole refi year | G6-REFI Y3 | TLB cash interest 25.74 (G2) → **22.24** = 350.27 × (3.60%+2.75%) |
| New mandatory amort on the NEW face | G6-REFI Y3–5 | **3.50** = 1.0% × B 350.27 (vs G2's 4.40 = 1.0% × 440) |
| New OID/fee amortization on the new schedule | G6-REFI Y3–5 | OID amort **0.29** = 0.5%×B / 6; TLB fee amort 0.5838 (+ revolver 0.165) |
| Refi cash cost at step 2R | G6-REFI Y3 | `refinancing_cash_cost` **8.76** = premium 3.50 + new OID 1.75 + new fee 3.50 |
| Old write-off (book Y3) | G6-REFI Y3 | `unamortized_writeoff` **4.71** (old TLB DFC remaining; OID = 0 in G2 — see §18.11(vi)) |
| Write-off + premium tax deduction DEFERRED to R+1 UNCAPPED | G6-REFI Y4 | uncapped **9.24** = fee 0.75 + commit 0.28 + deferred (4.71 WO + 3.50 premium) 8.22 |
| §163(j) stays non-binding (capped ≡ uncapped, simplification inert) | G6-REFI all years | `s163j_carryforward_end` 0 every year (lower post-refi interest widens the G2 headroom) |
| Exit write-off includes the NEW tranche's residual new OID/fee | G6-REFI exit | `unamortized_fees_written_off` **2.63** (new-OID resid 0.88 + new-fee resid 1.75) |
| Entry frozen by a post-close event | G6-REFI | `sources_uses` byte-identical to G2 |
| §9 capital-structure-blind | G6-REFI | `returns.unlevered` byte-identical to G2 |
| Years before the refi untouched | G6-REFI Y1–2 | operating / tax / waterfall / TLB rows byte-identical to G2 |

**Golden-uncovered by design** (SPEC §18.11 records each with its reason; the G-5 ENGINE PR lands a
directed kernel/module fixture for every one, mutation-tested against the exact wrong reading):
(i) R+1 = N merge into the exit deduction; (ii) refi under a BINDING §163(j) (where the uncapped
premium simplification MOVES tax); (iii) refi cash cost forcing a revolver draw / floor breach;
(iv) refi + a live §3-step-7 distribution / RP trap; (v) the structural-gate rejections; **(vi) refi
of a tranche with NON-ZERO unamortized OID** — G6-REFI refis the OID = 0 G2 TLB, so the OLD-OID
write-off and OLD-OID-amortization-STOP sub-paths run with zero inputs; the directed fixture must
carry old_OID > 0 AND new_OID > 0 with R+1 < N, mutation-tested against (a) old-OID-not-written-off
and (b) old-OID-schedule-not-stopped (round-2 residual 1); (vii) multiple independent refis
(additive accumulation into the single `pending_ret_ded`).

**Movement in the pre-existing goldens: purely ADDITIVE — proved, not asserted.** A leaf-by-leaf
comparison of every committed `expected.json` at HEAD against the regenerated tree reports
**changed = 0, removed = 0, added = 150** across G1/G2/G3/G4/G5/G2-D/G2-DIST/G3-DIST/G2-DIST-D. Every
added leaf is one of the three new unconditionally-emitted `TrancheYear` columns (`refinanced` =
false, `refinancing_cash_cost` = 0, `unamortized_writeoff` = 0), one per term-tranche-year: G1 adds 0
(no term tranche); G2/G4/G5/G2-D/G2-DIST/G2-DIST-D add 15 (1 tranche × 5 yr × 3); G3/G3-DIST add 30
(2 tranches × 5 × 3). On every pre-G-5 golden they are trivially correct: `refinancing` is null, so
no year is a refi year. `tests/goldens.test.ts` re-runs the reference and fails on any drift, and
asserts the additive-columns-all-0/false claim in CI.

**BS closure**: the §14.2 check is < $0.005m at every t on G6-REFI (machine-epsilon `[0,0,-0,0,-0,0]`
in the reference), the direct empirical proof of §18.6's DFC/NI/cash algebra.

**Adjudication (PHASE_B rule — two independent hand-derivation passes; a golden is gospel only after
this section is signed. Each adjudicator hand-derives the assigned values from SPEC §18 and the raw
G2+refi inputs, NOT from `spec_calc.py`'s algorithm, at the ±$0.005m / ±0.1bp bar):**

- [x] **Adjudication pass 1 — G6-REFI year-3 refi mechanics + BS closure (2026-07-26, independent
  agent): SIGNED.** Hand-derived every year-3 refi quantity from §18 (+ §2/§3/§4/§7/§8/§14) plus the
  signed G2 anchor, WITHOUT opening `spec_calc.py`. Reconstructed years 1–2 from scratch to pin
  `B = 350.268977` (TLB Y2 ending balance) and Y3 opening cash 25.676204 — both byte-match G2.
  Confirmed: new all-in 6.35% (−100bp); Y3 TLB interest 22.24 (falls from 25.74); new-face mandatory
  amort 3.50 (vs G2's 4.40 on 440); refi cash cost 8.76 = premium 3.50 + new OID 1.75 + new fee 3.50;
  old write-off 4.71 (old OID = 0, old DFC 6.60 − 2×0.9429); the §3 step-2R order (opening 25.68 + FCF
  87.31 − interest 22.24 − commitment 0.28 − **refi 8.76** − amort 3.50 − sweep 51.15 = closing 27.05,
  the refi shrinking the sweep pool); and §18.6 BS closure by TWO independent routes — assets−debt and
  the §8 equity roll (NI carries the extinguishment loss WO+premium=8.22; new OID/fees capitalized in
  DFC, not equity; Δdebt = 0 par-for-par) both giving equity 743.92/814.43/886.66 for Y3/Y4/Y5.
  **Zero mismatches beyond ±$0.005m** (all residuals pure 2dp display rounding). Verdict: §18 was
  unambiguous enough to derive every quantity with no reference to the script.
- [x] **Adjudication pass 2 — G6-REFI R+1 tax deferral + exit/returns + additivity (2026-07-26,
  independent agent): SIGNED.** Hand-derived the tax/exit/returns chain from §6/§9/§16/§17/§18 at FULL
  precision (`B = 350.2689793`), WITHOUT opening `spec_calc.py`. Confirmed: **§18.5 deferral** — Y3
  uncapped is only the ordinary pool (1.02, NO write-off/premium); the deferred 8.216975 (WO 4.714286
  + premium 3.502690) lands in **Y4's uncapped pool (9.24)**, driving the Y4 cash-tax **dip** (20.76,
  below the Y3→Y5 trend 20.88/24.08); R+1 = 4 < N = 5, so it does NOT merge into the exit deduction
  (§18.11(i)). **§163(j) inert** — capped < 30%×EBITDA_adj every year, `s163j_carryforward_end = 0`
  throughout, so the uncapped-premium simplification is genuinely inert here. **§9 exit** — payoff
  152.21, exit EV 1227.54 (EBITDA path unchanged from G2), exit write-off 2.63 = ONLY the refinanced
  TLB's residual new OID (0.876) + new fee (1.751) (the old TLB fee was already written off at the
  refi — no double count), exit equity pre-MIP 1090.82. **Returns** — sponsor IRR 13.1852%, MOIC
  1.8576; unlevered stream AND sources_uses byte-identical to G2. **Additivity** — the three
  TrancheYear columns emit unconditional defaults on every pre-G5 golden (G2's 5 rows all
  false/0/0, every pre-existing field unchanged), G6-REFI itself shows unconditional emission (Y1/2/4/5
  false/0/0, only Y3 true/8.76/4.71). **Zero mismatches beyond ±$0.005m / ±0.1bp.** Load-bearing
  finding: `B` is the FULL-PRECISION beginning balance, not the displayed 350.27 — the Y3 sweep display
  (51.15 vs 51.16) discriminates it, confirming §15's intermediate-rounding discipline.

**Status: G6-REFI is GOSPEL** (both independent passes signed, ±$0.005m / ±0.1bp, neither opening the
reference script). Engine2 modules (G-5 step 3) are wrong wherever they disagree with this fixture;
disputes reopen only via a §18 amendment + re-derivation. The G-5 ENGINE PR reproduces it at full
precision (C5 gate runs G6REFI); the self-deleting `PENDING_G5_KEYS` guard was removed once the engine
caught up (it probed a live `runCore` emission and failed the moment the columns appeared).

**Independent hostile ACCURACY AUDIT of the G-5 engine (2026-07-27): CLEAN.** A separate agent
re-derived ~25 load-bearing G6-REFI values from SPEC §18 first principles — by hand AND via a throwaway
Python re-implementation importing neither `spec_calc.py` nor the engine — and cross-checked the
committed fixture and the engine at ±$0.005m / ±0.1bp. **Zero disagreed.** Confirmed: (1) all refi
arithmetic (B 350.269, reprice interest 22.24, new-face amort 3.50, cash cost 8.76, write-off 4.71,
Y4 uncapped deferral 9.24, §163(j) non-binding, exit write-off 2.63, IRR 0.131852, BS closes ~1e-13);
(2) engine ≡ golden through the C5 gate, and the §18.6 equity extinguishment leg is load-bearing —
dropping `refiBookCharge` from `netIncome` reddens the BS check by exactly WO+premium = 8.216975;
(3) NO second path / NO solver / NO caller-assumption mutation — the engine mutates only the local
`effectiveSized` clone, `assumptions` is byte-unchanged after `runCore`, scenario re-runs are stable;
(4) the §18.11 directed fixtures are non-vacuous (the old-OID mutant reddens (vi); all seven rejection
gates throw); (5) the refi columns are emitted unconditionally and trace to their SPEC sections, no
rounded value re-enters arithmetic. **No wrong number; one minor COVERAGE note** — two refis in the
SAME year (both summing into the year's accumulators) was not directly pinned; **now closed** by a
directed fixture in `tests/engine2-refinancing.test.ts` (§18.11(vii) same-year case). All experimental
edits reverted; tree clean.

## G7-FUND (§19 v1.4.0, Phase-2 step 2) — adjudication record

**Pass 1 (2026-08-08) — SIGNED.** The full fund-of-one walk was hand-derived from the
G2-DIST fixture's sponsor rows + SPEC §19 r3 alone, BEFORE the reference path ran, then
compared: **zero mismatches to the digit.** Derivation: invested 587.22; fee 2% × invested
= 11.7444/yr; paid-in 645.942. Year-end order accrue → draw → distribute ('european': fees
enter the base). Pref compounds: 46.9776 / 51.67536 / 55.78174 / 59.95663 / 64.89271 →
279.28405 accrued by t=5 net of nothing (no interim year reaches step 2 — every interim
distribution 12.09/15.34/10 is absorbed by step-1 return of capital). t=5 inflow 1052.06
(8 + exit sponsor_share 1044.06): step 1 returns 608.512 (unreturned incl. all fees); step
2 pays pref 279.2840475; step 3 catch-up x = 0.2×279.2840475/0.8 = 69.8210119 (q=1, all
GP); step 4 splits 94.4429406 → GP 18.8885881 / LP 75.5543525. Totals: Σ LP 1000.7804;
Σ GP 88.7096 = 0.2 × (Σprofits 443.548) — the §19.6(d) 'european' bound binding at
EQUALITY; conservation Σ LP + Σ GP = 1089.49 = Σ sponsor inflows EXACT; moic 1000.7804 ÷
645.942 = 1.549335 ≡ dpi[N]; dpi to-date [0, 0.019797, 0.044068, 0.059019, 1.549335];
payback null (interim-only rule); LP net IRR 0.098059 < sponsor 0.133906 (§19.6(b)).
Additivity: every non-fund block of G7FUND byte-identical to G2DIST (in-script assert +
the gate's §19.7 block).

**Pass 2 (blind, independent) — pending.**
