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
| 1 | **Interim distributions + cash trap** | Unlocks DPI/RVPI/TVPI + payback properly (ILPA defs from DR-2); the trap may create the first true same-year cycle → the solver returns HERE as its own spec'd module, or trap tests lag one year (decide in spec) |
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

## Standing rules
- A feature that would add a second calculation path for an existing number is rejected by
  construction — it must flow through `runModel`.
- Each feature's UI enters at the right disclosure tier (almost always Advanced).
- After every feature: the three-issuer live walkthrough (E gate script) re-runs.
