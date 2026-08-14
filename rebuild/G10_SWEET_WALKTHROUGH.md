# Pre-PR three-issuer walkthrough — §22 sweet equity / ratchets / warrants (2026-08-14)

Run on branch `claude/deal-engine-exits-mip-5ee40a` @ 00425a6, per Tier-A step 5 and the
standing "after every feature" rule. Real filings via the PRODUCTION proxy
(`www.mridulmalani.com/api/edgar`) through THIS BRANCH's client → mappers → adapter →
suggest → `runModel`, driving the REAL stores (`dealEngineStore.importFromEdgar/importFromEsef`
→ `engine2Store` import → confirm → build) — the harness one-off, per the G-2/G-5/G-7/G-8
precedent, now COMMITTED as the opt-in `tests/walkthrough-g10.live.test.ts`
(`LIVE_WALKTHROUGH=1`; skipped in CI); SSR of the actual `EquityStrip` component covers the
render surface. Branch gates first: `tsc` 0 · vitest **730/730** (incl. the 2 harness
placeholders) · build green.

| Issuer | Path | basis | revenue ($/€m) | EBITDA | margin | gaps confirmed (value) | BS max\|check\| | IRR / MOIC | §22 silence |
|---|---|---|---|---|---|---|---|---|---|
| **Apple** (CIK 320193, 10-K) | us-gaap, stitched, prod proxy | **LTM** | 466,823 | 167,959 | 36.0% | (none) | 2.3e-10 | 14.7% / 1.99x | PASS |
| **SAP** (CIK 1000184, 20-F) | ifrs-full, FPI, prod proxy | **FY** | 36,800 | 10,928 | 29.7% | maint_capex_pct_revenue (0.03) | 1.5e-11 | 12.8% / 1.83x | PASS |
| **Vinci** (ESEF, LEI 213800WFQ334R8UXUG83) | ifrs-full, layered resolver | **FY** | 75,372 | 13,570 | 18.0% | net_debt (0) | 1.5e-11 | 7.2% / 1.42x | PASS |

**Hand-verification:**
- **Regression-free vs the signed G8 record:** all three issuers' extraction rows AND sponsor
  returns are IDENTICAL to the G8 walkthrough (Apple LTM 466,823 / 14.7% / 1.99x; SAP 36,800 /
  12.8% / 1.83x; Vinci 75,372 / 7.2% / 1.42x), same gaps, same BS closures. §22 moves NO
  imported number — §14.23(f)'s compatibility promise observed on live data, three features on.
- **§22 silence on every real deal (asserted, not observed):** the suggestion layer proposes
  NO strip/ratchet/warrant (§16); `equity_strip` is null; the ExitBlock zero columns are 0.0;
  the five-term mirror degenerates to three terms; the `EquityStrip` component renders EMPTY
  (§22.10's absent-when-off); no `loan_notes_unredeemed` fires.
- **Strip + warrant leg (Apple live data, programmatic — the §20.9 toggle-leg precedent):**
  `sweet_equity {p 0.10, rate 0.08, subscription 1,000, mgmt 0.10, tiers [{1.5, 0.15},
  {2.0, 0.20}]}` + a 5% warrant struck at 500 on the live LTM import. The §14.23(a) closed
  form held on the live plug: LN[0] = **1,118,173.691** (0.9 × plug), LN[5] =
  **1,642,963.999** ≡ LN[0] × 1.08⁵ (asserted to 4dp); notes redeemed IN FULL; **tier 1
  reached, tier 2 not** (realized institution MOIC **1.8721**, and
  `returns.sponsor_net.moic` MIRRORS it to 1e-9 — §14.23(d) on live data); management's
  ordinary share 106,101.703; warrant net 41,030.009; the five-term §14.16 mirror closed at
  1e-6 on live numbers; sponsor IRR 13.4% (down from 14.7% base — management's slice and the
  warrant genuinely dilute, which is what the numbers should say).
- **§22.3(vi) grid pre-test on the LIVE deal:** an entry-multiple axis at 0.05× re-derives a
  non-positive plug under the strip — the cell renders **null** and the grid SURVIVES with
  its healthy cells intact (pre-fix, the whole grid threw).
- **Ratcheted-promote leg (G10 shape, live data):** single-tier promote 184,447.346 vs
  ratcheted 276,326.862 — the marginal walk consumes the top bracket; `equity_strip` stays
  null on a promote deal (§22.10's biconditional).
- **Honest degradation intact:** SAP's capex gap and Vinci's net-debt gap fired the Build
  gate and required explicit confirmation (values recorded above) — gaps stay gaps; the
  harness THROWS on any unexpected gap rather than inventing a value.

**Verdict:** all three issuers import, suggest, and build exactly as before the feature; §22
stays OFF and INVISIBLE unless configured, and where configured it computes and renders per
§22 with the closed form, both mirrors, and the grid pre-test holding on live data. E-gate
re-run: **GREEN**.
