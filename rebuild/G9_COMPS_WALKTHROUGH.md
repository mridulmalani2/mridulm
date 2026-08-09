# Pre-PR three-issuer walkthrough — §21 sector comps band (2026-08-09)

Run on branch `claude/reality-check-comps` @ 27a5e13, per the Tier-B step-5 requirement and the
standing "after every feature" rule. Real filings via the PRODUCTION proxy
(`www.mridulmalani.com/api/edgar`) through THIS BRANCH's client → mappers → adapter →
`runModel`, driving the REAL stores, with SSR of the actual `Summary` component for the render
surface (harness one-off, per the G-2/G-5/G-7/G-8 precedent). Branch gates first: `tsc` 0 ·
vitest **685/685** · build green.

| Issuer | Path | basis | revenue ($/€m) | EBITDA | margin | gaps confirmed | BS max\|check\| | IRR / MOIC |
|---|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, stitched | **LTM** | 466,823 | 167,959 | 36.0% | (none) | 2.3e-10 | 14.7% / 1.99x |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, **the §D6 IFRS-in-SEC route** | **FY** | 36,800 | 10,928 | 29.7% | maint_capex_pct_revenue | 1.5e-11 | 12.8% / 1.83x |
| **Vinci** (ESEF, LEI 213800WFQ334R8UXUG83) | ifrs-full, layered resolver | **FY** | 75,372 | 13,570 | 18.0% | net_debt | 1.5e-11 | 7.2% / 1.42x |

## The §21 band, per issuer — live

| Issuer | SIC (numeric, from EDGAR) | band |
|---|---|---|
| Apple | **3571** | **Technology 22.01–24.48 (median 24.48) · US · 5 Jan 26 · 11 industries, 806 firms** |
| SAP | **7372** | **Technology 12.03–20.85 (median 17.27) · Europe · 5 Jan 26 · 11 industries, 884 firms** |
| Vinci | (none published) | **UNAVAILABLE — no sector source** (the honest-null state, with its reason) |

**Hand-verification:**
- **Regression-free vs every prior signed record.** All three issuers' extraction rows and
  sponsor returns are IDENTICAL to the G5, G7-FUND and G8-PIK walkthroughs (Apple LTM 466,823 /
  14.7% / 1.99x; SAP 36,800 / 12.8% / 1.83x; Vinci 75,372 / 7.2% / 1.42x). §21 moves NO engine
  number on live data — the Tier-B containment promise, observed rather than asserted.
- **SAP is the route that was BROKEN.** §21.5b/round-3 B1 found the §D6 IFRS-in-SEC branch
  dropping the SIC that EDGAR had already supplied, so a 20-F filer would have been told "no
  sector information exists" about a company whose code was in hand. Here it carries SIC 7372
  end to end and lands in **Europe** — a materially different band from Apple's US one on the
  SAME bucket (median 17.27 vs 24.48), which is also the region rule working on live data.
- **Apple's SIC 3571 (Electronic Computers) buckets to Technology** via the 3570–3579 range —
  the numeric-SIC key doing what the rejected keyword ladder could not (that ladder dropped
  seven of twelve real EDGAR strings to `'Other'`).
- **Vinci is honestly unavailable.** The ESEF route publishes no SIC and has no dropdown, so the
  band is null and the Summary renders the unavailable state WITH its reason — never a
  fabricated number and never a silent whole-market fallback.
- **The disclosure rides every rendered band**: "listed comps, NOT buyout entry", the region,
  the vintage, and the constituent count — §21.8(e)'s NON-claim on the face of the surface.

**Scope note, recorded not hidden:** the ESEF/upload routes carry no sector source today, so
European filings imported that way show the unavailable state. §21.9 discloses it and §21.5
names an ESEF sector source as the v2 fix; the manual route reaches the band through the entry
screen's dropdown.

**Verdict:** all three issuers import, suggest and build exactly as before the feature; the band
appears where a sector source exists, is regionally correct, and is honestly unavailable where
it does not. E-gate re-run: **GREEN**.
