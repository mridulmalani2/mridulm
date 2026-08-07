# Post-merge three-issuer walkthrough — refi stack + sourcing flow (2026-08-07)

Run after merging PR #113 (G-5 refinancing + review fixes) → #115 (§15 distributions row)
→ #114 (sourcing flow + multi-year manual entry), with main at `20ec96d`. Real filings via
the PRODUCTION proxy (`www.mridulmalani.com/api/edgar`) through the PRODUCTION mappers →
adapter → suggest → `runModel` (the substantive E-gate check — the browser UI is a view over
exactly this data; harness was a one-off, per the G-2 precedent). Merged-main gates first:
`tsc` 0 errors · vitest **532/532** · build green · production smoke 6/6
(`scripts/smoke-production.mjs`).

| Issuer | Path | basis | as_of | revenue ($/€m) | EBITDA | margin | history | BS max |check| | IRR / MOIC |
|---|---|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, STITCHED | **LTM** | 2026-06-27 | 466,823 | 167,959 | 36.0% | 8 yrs | 2.3e-10 | 14.7% / 1.99x |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, FPI | **FY** | 2025-12-31 | 36,800 | 10,928 | 29.7% | 8 yrs | 1.5e-11 | 12.8% / 1.83x |
| **Vinci** (ESEF, filings.xbrl.org) | ifrs-full, layered resolver | **FY** | 2025-12-31 | 75,372 | 13,570 | 18.0% | 0 yrs (single report) | 1.5e-11 | 7.2% / 1.42x |

**Hand-verification:**
- **Apple's stitch advanced correctly since the G-2 record.** G-2 (as-of 2026-07-25) pinned
  LTM ending 2026-03-28 at 451,442; a Q3-FY2026 10-Q has since been filed and the stitch now
  anchors 2026-06-27 at 466,823 — newer quarter in, oldest out, growth-consistent, staleness
  tier **fresh**. Margin 36.0% is Apple-typical.
- **SAP FY figures are BYTE-IDENTICAL to the signed G-2 walkthrough** (36,800 / 10,928 /
  29.7%) — the FPI path is stable across the three merged PRs. Honest degradation intact:
  `Capex %` is a gap → MISSING badge → Build gate (the filing genuinely lacks a derivable
  capex; never defaulted).
- **Vinci (ESEF) runs the full pipeline live.** Revenue €75.4bn / 18.0% margin are
  Vinci-plausible (concessions+construction blend). `Net debt at entry` is a gap →
  Build-gated for user confirmation — correct honest-null behaviour (the #112 class). Single
  ESEF report ⇒ no multi-year history (documented degradation, not a regression).
- **`facts.source` now stamps the true producer** on every route (`edgar`/`edgar`/`esef`) —
  the PR #114 origin plumbing verified on live data.
- Refinancing is default-OFF on every import (`structure.refinancing` absent from all three
  suggested models) — §18's byte-identity promise for pre-v1.3.0 deals holds on real deals.

**Verdict:** all three issuers import, suggest, and build with closing balance sheets
(≤2.3e-10) and finite returns; no wrong number reached a displayed figure; gaps stay gaps.
