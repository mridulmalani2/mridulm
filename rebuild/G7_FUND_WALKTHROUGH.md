# Pre-PR three-issuer walkthrough — §19 fund/LP overlay (2026-08-08)

Run on branch `claude/fund-lp-overlay` (post-conformance closure), per Tier-A step 5 and the
standing "after every feature" rule — conformance blocker B3's minimal compliant run. Real
filings via the PRODUCTION proxy (`www.mridulmalani.com/api/edgar`) through THIS BRANCH's
client → mappers → adapter → suggest → `runModel`, driving the REAL stores
(`dealEngineStore.importFromEdgar/importFromEsef` → `engine2Store` import → confirm → build)
— the browser UI is a view over exactly this data (harness one-off, per the G-2/G-5
precedent; SSR of the actual `Returns` component covers the render surface). Branch gates
first: `tsc` 0 · vitest **575/575** · build green.

| Issuer | Path | basis | revenue ($/€m) | EBITDA | margin | gaps confirmed (value) | BS max\|check\| | IRR / MOIC | §19 silence | SSR no-row |
|---|---|---|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, stitched, prod proxy | **LTM** | 466,823 | 167,959 | 36.0% | (none) | 2.3e-10 | 14.7% / 1.99x | PASS | PASS |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, FPI, prod proxy | **FY** | 36,800 | 10,928 | 29.7% | maint_capex_pct_revenue (0.03) | 1.5e-11 | 12.8% / 1.83x | PASS | PASS |
| **Vinci** (ESEF, LEI 213800WFQ334R8UXUG83) | ifrs-full, layered resolver | **FY** | 75,372 | 13,570 | 18.0% | net_debt (0) | 1.5e-11 | 7.2% / 1.42x | PASS | PASS |

**Hand-verification:**
- **Regression-free vs the signed G5 record (2026-08-07):** all three issuers' extraction
  rows AND sponsor returns are IDENTICAL to the post-#113/#115/#114 walkthrough (Apple LTM
  466,823 / 14.7% / 1.99x; SAP 36,800 / 12.8% / 1.83x; Vinci 75,372 / 7.2% / 1.42x) — the
  fund-overlay branch moves NO imported number, which is §19.6(c)'s byte-identity promise
  observed on live data.
- **§19 suggestion silence on every real deal:** `assumptions.fund` null, no `fund` basis
  badge, `output.fund` null on all three suggested models (the σ-mutant class, verified
  against production filings, not just the fixture).
- **The stream is ABSENT when OFF, live:** SSR of the branch's actual `Returns` component
  over each real ModelOutput contains no "Net to LP" row, no memo line, no "fund-of-one".
- **Honest degradation intact:** SAP's capex gap and Vinci's net-debt gap fired the Build
  gate and required explicit confirmation (values recorded in the table) — gaps stay gaps;
  Apple (companyfacts-rich) needed none.
- **Overlay-ON leg (Apple @ the §19.9 conventions — european, 2%-invested, 8% pref, 20%
  carry, full catch-up, offset 1.0):** the fourth stream computes and renders live —
  paid-in 1,367,756.7 ≡ invested + Σ fee draws (identity at 1e-9); **LP net IRR 11.0% <
  sponsor 14.7%** (§19.6(b)); conservation Σ LP 2,252,002.7 + Σ GP 221,061.5 ≡ sponsor-side
  inflows 2,473,064.2 (§19.6(a), <1e-6 on $2.5T of flows); TVPI 1.646x; payback null
  (interim-only sentinel). SSR renders the §19.5 verbatim row label, the returns-surface
  memo line, and the "TVPI (= DPI — fully realized)" annotation.
- **Browser-live complement (recorded in commit adbdd6e):** the manual-entry deal walked the
  actual UI — Advanced fund group (YOU-badged fields, election footnote) → Build → Returns
  tab rendered the fourth row (LP 6.8% < sponsor 8.5%, paid-in ≡ 1.1× check) with a clean
  console.

**Verdict:** all three issuers import, suggest, and build exactly as before the feature
(closing balance sheets ≤ 2.3e-10, finite returns, gaps honest); the overlay stays OFF and
INVISIBLE everywhere unless a user turns it on, and where turned on it computes and renders
per §19 with both live invariants holding. E-gate re-run: **GREEN**.
