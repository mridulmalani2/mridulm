# Phase-1 upload-parser walkthrough — REAL files through the REAL browser (2026-08-07)

The E-gate check for the uploaded-filing route (IXBRL_SPEC v1 r4): the committed REAL
fixtures driven through the LIVE UI in Chrome (dev server; files injected into the upload
card's input via DataTransfer — the exact `File` → `uploadedFilingToRaw` →
`loadFromHistoricals` path a user's drop takes, exercising the real browser `DOMParser`
rather than the happy-dom test double).

## Companies House (real FRS filing, `ch-real.xhtml`, 19KB — the §2b truth)

- Entity extracted: **PARR OFFSHORE LTD** (uk-bus legal name), balance-sheet date read via
  `ixt2:datedaymonthyearen`.
- The FRC document-level note renders verbatim: *"FRC (Companies House) accounts: v1
  extracts identity only — financial fields surface as gaps; FRC alias mapping is a planned
  extension."*
- **Every financial field surfaced as a red REQUIRED confirm** (fy_revenue, fy_ebitda,
  da/capex/nwc rates, net_debt) — the MISSING-badge flow, Build gated; suggestions degraded
  honestly to TEMPLATE. The identity-prefilled manual-confirm workflow, exactly as spec'd —
  no silent failure, no fabricated number, no EUR default (GBP from the document's units).

## Apple FY2024 10-K (real Workiva markup, `aapl-10k-trimmed.htm`, 216 facts)

- Entity **APPLE INC.**; **FILING HISTORY** table with the three in-document fiscal years at
  the EXACT EDGAR-published figures: FY2022 $394,328m / $130,541m (33.1%), FY2023 $383,285m
  / $125,820m (32.8%), FY2024 $391,035m / $134,661m (34.4%).
- **Staleness honesty**: "FY2024 · ended 2024-09-28 · 22 months ago · sizing: FY · STALE" —
  an old uploaded filing badges stale, as §2c promises (vs the fetch route's fresh LTM
  stitch of the same issuer — the honest difference between a live pull and an old file).
- The §1e dedup notes render to the user: "duplicate us-gaap:UnrecognizedTaxBenefits @
  2024-09-28: kept most precise" (the $22,038m-beats-$22.0bn pin, visible).
- Growth suggestion **SUGGESTED · HISTORY −0.42%** — the true 2022→2024 in-document CAGR
  (Apple's revenue genuinely dipped; the suggestion doesn't flatter).
- **BUILD runs end-to-end**: Sponsor IRR 3.3% / MOIC 1.2x with the value bridge — an
  honestly unimpressive LBO of a mega-cap at convention multiples off a stale filing, which
  is precisely what the numbers say.

## Gates at this state

`tsc` 0 · vitest **548/548** (regeneration gate 4/4; TS-parser-≡-gospel 4/4; orchestration
pins 5/5) · build green. Adjudication: pass 1 SIGNED; pass 2 (blind, independent) recorded
in `tests/fixtures/ixbrl/DERIVATION.md`.
