# PHASE D — Data layer extension (runs IN PARALLEL with Phases B–C)

**Goal:** extend `lib/edgar/*` so facts do the work defaults used to do — history-grounded
suggestions, real working-capital days, honest labels. Needs only `engine2/types.ts`
(`DealFacts`) from Phase A; no dependency on the engine core.

**Everything here follows the extraction reliability rules the data review demanded.**

## D1 — Multi-year history builder (the reliability core)

companyfacts is NOT a clean time series. The builder must:
1. **Resolve alias chains PER PERIOD**, not once per concept (filers switch tags mid-history:
   Revenues ↔ RevenueFromContractWithCustomer…, D&A and capex variants). Record the tag used
   per year in provenance; flag any year whose tag differs from the anchor year's.
2. **Dedupe restatements**: group facts by exact (start, end); pick the **latest `filed`**
   vintage; emit a provenance note when |restated − original| > 1%.
3. **Key periods on end dates only** — the `fy`/`fp` metadata describes the FILING, not the
   fact's period (a FY2022 comparative in a FY2024 10-K carries fy=2024). Never key on fy/fp.
4. **CAGRs over true date spans**: ((end0 − endN)/365.25), not row count (fiscal-year changes
   leave holes). A SUGGESTED (history) basis requires **≥ 3 usable full-year points** of that
   specific metric; otherwise the assumption field stays REQUIRED/convention-suggested.
5. Degradation contract: the review-screen history table renders per-cell gaps (empty +
   MISSING); partial components never combine into a fake total (no EBITDA from OpInc without
   D&A).
Fixtures to add: an ASC-606 tag switcher, a discontinued-ops restater, a fiscal-year changer,
a financial-sector filer (asserts clean gapping, no fake EBITDA).

## D2 — Operating NWC + days (replaces the CA−CL figure)

- **Operating NWC** = (AR + inventory + other operating current assets) − (AP + accrued +
  deferred revenue); minimum viable: (CurrentAssets − cash & ST investments) −
  (CurrentLiabilities − current debt − current finance leases). This series feeds BOTH the
  historical NWC% and the days method — one definition, no contradictory suggestions. The old
  CA−CL fact is retired/renamed (it embeds cash and current debt; Apple's is negative mostly
  for financing reasons).
- Alias chains: AR = AccountsReceivableNetCurrent → ReceivablesNetCurrent →
  AccountsNotesAndLoansReceivableNetCurrent. Inventory = InventoryNet → FG/WIP/RM components.
  AP = AccountsPayableCurrent → AccountsPayableTradeCurrent **only** — if only the bundled
  AccountsPayableAndAccruedLiabilitiesCurrent exists, **DPO is a gap** (fall back to % method),
  never computed off the bundle. COGS = CostOfRevenue → CostOfGoodsAndServicesSold →
  CostOfGoodsSold; the excluding-D&A variant accepted but flagged in provenance.
- DPO prefers **purchases = COGS + ΔInventory** when consecutive year-ends exist (D1 provides
  them); else COGS with a provenance note. 365-day basis, documented.
- Gating: days method only when all required components resolve AND non-financial SIC. No
  inventory in a services SIC → DIO omitted with a note (NOT a MISSING gap that blocks Build).
  Implausible outputs (DSO/DPO > 180, DIO > 365) are flagged, never silently suggested.

## D3 — Honest period labels
Rename `ltm_*` → `fy_*` throughout `RawHistoricals`/`DealFacts`; review screen shows
"FY2025 · ended 2025-09-27 · 9 months ago" (staleness indicator). The entry-basis toggle reads
FY | NTM. Quarter-stitched true LTM (FY + YTD − prior-YTD, Q4 = FY − 9M, 52/53-week handling)
is a **Phase G item** with its own fixtures — do not half-ship it.

## D4 — Implied cost of existing debt (sanity anchor, banded)
Numerator chain: InterestExpenseDebt → InterestExpense → InterestAndDebtExpense →
InterestExpenseNonoperating. **Never from a net interest line** (gap instead). Denominator:
average of beginning/ending gross debt (from D1), same lease-inclusion as the numerator's
base. Emit only when gross debt > 0.5× EBITDA and result ∈ [1%, 15%]; suppress for financial
SICs. Badge: "approximate — includes non-cash DFC/OID amortization".

## D5 — Trading-multiple anchor [OWNER DECISION #3]
If taken: shares outstanding (dei tag, multi-class caveat noted; v2 upgrade to
WeightedAverageNumberOfDilutedSharesOutstanding) × price (one free quote endpoint via the
existing proxy, allowlisted) ÷ FY EBITDA → read-only "trades at ~28x FY EBITDA" line next to
the entry-multiple input; coherence-gate soft flag at ±40% deviation.

## D6 — FPIs and currency honesty
- **IFRS-reporting 20-F filers currently extract NOTHING** (mapXbrl reads only
  facts['us-gaap']). Build `mapCompanyFactsIfrs`: reuse mapIfrs.ts's ifrs-full alias chains
  against the companyfacts shape, selected when facts['ifrs-full'] exists and us-gaap is
  absent/sparse. Real 20-F fixtures: one EUR filer, one non-modelled-currency filer.
- **Currency**: always carry the detected unit currency; outside the modelled set
  {USD, EUR, GBP, JPY, INR} → **blocking badge** ("currency SEK not supported"), never a
  silent USD fallback (today's KNOWN_CURRENCIES fallback violates the no-silent-default
  invariant).
- 40-F/no-XBRL filers: out of scope, everything gaps, stated on screen. FPI history is
  FY-only (no 10-Qs) — note in SPEC.
- NOL: companyfacts returns non-dimensional facts only; member-tagged NOLs are invisible →
  present extracted NOL as a **floor** ("≥ $X — member-level detail unavailable").

## D7 — Suggestions assembly
`lib/engine2/suggest.ts`: builds the Class-B suggestion set from (history bases per D1,
conventions.json per Phase A, templates). Pure function: (DealFacts, conventions) →
suggested DealAssumptions + basis metadata per field. The §14.13 coherent-suggestions test
lives here.

## Files
Modify: `lib/edgar/mapXbrl.ts` (+ new `history.ts`, `mapCompanyFactsIfrs.ts`), `types.ts`,
`buildModel.ts`, proxy allowlist (quote endpoint if D5 taken). Create: `lib/engine2/suggest.ts`,
fixtures under `tests/fixtures/`. All under the freeze exception for `lib/edgar` (the freeze
covers `lib/engine`, not `lib/edgar` — state this in the Phase A amendment).

## Gate
All new fixtures green (tag switcher, restater, FY-changer, financial-sector, 2× 20-F) ·
MISSING invariant preserved (edgar-missing tests extended to new fields) · days method
correctly gated (services-SIC fixture) · no silent currency fallback (fixture asserts block) ·
coherent-suggestions test green against a real large-cap fixture.
