# PHASE G — Staged feature re-entry (one at a time, spec-first)

Every deferred feature re-enters through the same template. **Never two features in flight.**

## The template (per feature)
1. **Spec amendment PR**: new SPEC section (convention + formula + rejected alternative),
   changelog entry, fee/flow-membership table updates if returns are touched.
2. **Golden extension**: extend an existing golden workbook or add G5+ (same three artifacts
   + adjudication rule as Phase B).
3. **Engine PR**: module or extension, per-module fixtures from the golden intermediates,
   invariant additions with domains.
4. **UI PR**: input surface (correct disclosure tier + badge basis), output surface.
5. **Adversarial conformance review** (code-vs-spec), then ship.

## Ordered backlog (re-derived from the audit + product review; owner may reorder)

| # | Feature | Notes for its spec |
|---|---|---|
| 1 | ✅ **DONE 2026-07-25** — **Interim distributions + cash trap** | Unlocks DPI/RVPI/TVPI + payback properly (ILPA defs from DR-2); the feared same-year cycle DISSOLVED: §3.7's pro-forma test is linear in the payment, so rp_max has a closed form and the no-solver rule holds (SPEC v1.1.0 §5). Shipped as SPEC v1.1.0/v1.1.1 + goldens G2-DIST / G3-DIST / G2-DIST-D + engine + UI |
| 2 | **Quarter-stitched LTM** | FY + YTD − prior-YTD, Q4 = FY − 9M, 52/53-week fixtures; FPI stays FY with staleness badge |
| 3 | **Fund/LP overlay** | Net-to-LP after fees/carry (European/American), reuses old fundReturns spec knowledge; feeds a fourth return row clearly labelled fund-level |
| 4 | **Reality check, done right** | Only now: comps from a real source (FMP/Damodaran per old roadmap 2C), sector bands with citations, no hardcoded thresholds; extends the D5 trading anchor |
| 5 | **Refinancing events** | Repricing, premium, extend; OID/DFC write-off interplay already spec'd in §7/§9 |
| 6 | **PIK toggle (per-year election)** | Extends the v1 fixed PIK note; AHYDO disclosure from DR-3.4 |
| 7 | **Partial exits / IPO selldown** | Interacts with MIP cap (SPEC §10 already forward-compatible) |
| 8 | **MIP ratchets + sweet equity** | Sweet equity as a REAL strip structure (institutional loan notes + ordinaries) — the v1 promote stays separate; never blend the two instruments |
| 9 | **Add-on acquisitions** | The old engine's deepest wound (debt discarded, scenario bases diverged): spec must state add-on debt enters the SAME waterfall, scenario/sensitivity bases include add-ons by construction (single code path guarantees it) |
| 10 | **Market-data suggestions** | FRED SOFR curve + spreads by rating → SUGGESTED (market) badge tier goes live; forward base-rate paths into §4 |
| 11 | **Covenant step-downs UI / springing** | Engine fields exist from v1 spec; expose + scenario integration |
| 12 | **Trace mode v2** | Rebuilt against ModelOutput with SPEC-section links in trace cards (the spec makes traces meaningful: each node cites its formula) |

## v2 items deferred by SPEC but not yet scheduled (pull into the backlog when prioritized)

Recorded so every spec deferral has a tracked re-entry path (verifier finding, 2026-07-05):
- **Step-up purchase accounting** (asset / §338(h)(10) / §336(e): §197 15-yr goodwill
  amortization, permanent 100% bonus depreciation post-OBBBA, DTL unwind) — SPEC §8.
- **Call-protection module** (private-credit 102/101 hard call, CoC 101 put, HY make-whole)
  — SPEC §3/§9 disclosed omissions; pairs with backlog #5 (refinancing).
- **XIRR on actual close/exit dates with first-year stub** — SPEC §1's stated upgrade path
  (retires the mid-year toggle; DR-2's preferred practice).
- **Quarterly engine periods** — SPEC §1 deferral (distinct from backlog #2's LTM
  quarter-stitching, which is data-side).
- **Actual/360 day-count gross-up per tranche** — SPEC §4 v2 refinement (~1.0–1.4% interest
  understatement disclosed meanwhile).
- **Transaction-cost 70/30 success-fee split** (Rev. Proc. 2011-29) — SPEC §6 v2 refinement.
- **Mezzanine warrants / equity kicker** (2–8% of equity — DR-4) — belongs with backlog #8
  (sweet equity/strips).

## Standing rules
- A feature that would add a second calculation path for an existing number is rejected by
  construction — it must flow through `runModel`.
- Each feature's UI enters at the right disclosure tier (almost always Advanced).
- After every feature: the three-issuer live walkthrough (E gate script) re-runs.
