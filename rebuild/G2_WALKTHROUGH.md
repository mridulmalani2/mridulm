# G-2 three-issuer walkthrough — quarter-stitched LTM (2026-07-25)

Real EDGAR companyfacts run through the PRODUCTION mappers (`mapCompanyFacts` / `mapCompanyFactsIfrs`),
as-of 2026-07-25. Verifies the stitch on real filings — the substantive check (the browser UI is a view
over exactly this data). Harness was a one-off (reads live SEC JSON); results recorded here.

| Issuer | Path | basis | as_of | LTM/FY revenue ($m) | EBITDA ($m) | margin | badge |
|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, STITCHED | **LTM** | 2026-03-28 | 451,442.0 | 159,976.0 | 35.4% | fresh |
| **Crocs** (CIK 1334036, 10-K) | us-gaap, STITCHED | **LTM** | 2026-03-31 | 4,024.8 | 208.4 | 5.2% | fresh |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, FPI | **FY** | 2025-12-31 | 36,800.0 | 10,928.0 | 29.7% | aging |

**Hand-verification (the "no wrong number" gate):**
- **Apple LTM revenue 451,442 is EXACT.** Stitch = FY2025 (416,161) + H1-FY2026 [2025-09-28→2026-03-28]
  (254,940) − H1-FY2025 [2024-09-29→2025-03-29] (219,659) = 451,442. Independently, the four quarters
  Apr'25–Mar'26 sum to the same: Q3'25 94,036 + Q4'25 (416,161−313,695=102,466) + Q1'26 143,756 +
  Q2'26 111,184 = **451,442** ✓. Abutment FY.end 2025-09-27 +1d = 2025-09-28 = cur.start ✓; 6m/6m roles,
  Δspan 0d; EBITDA margin 35.4% is Apple-typical.
- **Crocs 5.2% margin is HONEST, not a bug.** FY2025 operating income is impairment-crushed (the HeyDude
  goodwill/intangible writedown — flagged as-filed in the Phase-E gate). The LTM (12m ending Mar-2026)
  correctly still contains that impairment (it fell in FY2025, which the LTM retains; only Q1 is swapped
  Q1'25→Q1'26). The stitch does not paper over the impairment — exactly right.
- **SAP correctly does NOT stitch.** Files under `ifrs-full` only (20-F FPI, annual) ⇒ the us-gaap stitch
  never runs; the IFRS mapper returns FY, and the UI derives an `aging` badge from the 2025-12-31 period
  end vs the 2026-07-25 view — the FPI staleness disclosure §1.1 requires.

**Verdict:** the stitch produces correct LTM figures on real multi-quarter filers (Apple exact to the
dollar-million), handles an impairment honestly (Crocs), and falls back to FY with a staleness badge for
an FPI (SAP). No wrong number reached a displayed figure.
