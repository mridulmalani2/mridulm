# Pre-PR three-issuer walkthrough — §20 PIK toggle (2026-08-09)

Run on branch `claude/pik-toggle` @ 921b5be, per Tier-A step 5 and the standing "after every
feature" rule. Real filings via the PRODUCTION proxy (`www.mridulmalani.com/api/edgar`) through
THIS BRANCH's client → mappers → adapter → suggest → `runModel`, driving the REAL stores
(`dealEngineStore.importFromEdgar/importFromEsef` → `engine2Store` import → confirm → build) —
the browser UI is a view over exactly this data (harness one-off, per the G-2/G-5/G-7
precedent; SSR of the actual `Debt` component covers the render surface). Branch gates first:
`tsc` 0 · vitest **605/605** · build green.

| Issuer | Path | basis | revenue ($/€m) | EBITDA | margin | gaps confirmed (value) | BS max\|check\| | IRR / MOIC | §20 silence | Debt tab: no marker |
|---|---|---|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, stitched, prod proxy | **LTM** | 466,823 | 167,959 | 36.0% | (none) | 2.3e-10 | 14.7% / 1.99x | PASS | PASS |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, FPI, prod proxy | **FY** | 36,800 | 10,928 | 29.7% | maint_capex_pct_revenue (0.03) | 1.5e-11 | 12.8% / 1.83x | PASS | PASS |
| **Vinci** (ESEF, LEI 213800WFQ334R8UXUG83) | ifrs-full, layered resolver | **FY** | 75,372 | 13,570 | 18.0% | net_debt (0) | 1.5e-11 | 7.2% / 1.42x | PASS | PASS |

**Hand-verification:**
- **Regression-free vs the signed G5 and G7-FUND records:** all three issuers' extraction rows
  AND sponsor returns are IDENTICAL to both prior walkthroughs (Apple LTM 466,823 / 14.7% /
  1.99x; SAP 36,800 / 12.8% / 1.83x; Vinci 75,372 / 7.2% / 1.42x). §20 moves NO imported
  number — the §20.6(c) compatibility promise observed on live data, two features running.
- **§20 silence on every real deal:** no suggested structure carries a `pik_note` at all (the
  D7 assembly builds TLB/unitranche + RCF), so no elections exist, `ahydo_shape` never fires,
  and the Debt tab renders NO election marker and NO §20 footnote on any of the three.
- **Toggle-ON leg (Apple + a programmatic §20.9 note — cash 9% / PIK 12%, elections
  [pik,pik,cash,cash,pik], maturity 8, 1.0× EBITDA):** every year served exactly ONE leg on
  live filing data (accruals 20,155.08 / 22,573.69 / 25,282.53; cash coupons 18,961.90 twice
  on the flat balance — the §20.6(b) identity); the §20.6(a) closed form held on the live
  balance (ending 235,970.302 = face × 1.12³, the three pik years); `ahydo_shape` fired with
  its §20.8 honesty clauses intact (yield leg stated untested, significant-OID leg stated
  proxied, catch-up cure named as assumed); the Debt tab rendered the per-year markers
  matching the schedule plus the whole-coupon footnote. Sponsor IRR 15.2%, payoff 660,345.42.
- **Honest degradation intact:** SAP's capex gap and Vinci's net-debt gap fired the Build gate
  and required explicit confirmation (values recorded above) — gaps stay gaps.

**Scope note (recorded, not hidden):** the v2 UI has no tranche BUILDER and the suggestion
layer never proposes a `pik_note`, so the toggle's INPUT surface is reachable today only for
programmatically-constructed deals (and templates, once wired) — which is exactly how this
leg was run. The Advanced editor renders conditionally on a note being present, matching the
refi editor's floating-tranche gate.

**Verdict:** all three issuers import, suggest, and build exactly as before the feature
(closing balance sheets ≤ 2.3e-10, finite returns, gaps honest); the toggle stays OFF and
INVISIBLE unless a deal carries a PIK note with elections, and where present it computes and
renders per §20 with the closed form and the disclosure holding on live data. E-gate re-run:
**GREEN**.
