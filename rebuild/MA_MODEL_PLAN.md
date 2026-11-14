# M&A (merger) model: build plan

Status (2026-11-14): Phases 0, 1 and 2 BUILT on branch claude/ma-model-planning-e78905 (PR #130);
Phases 3 to 6 not started. The engine lives in `lib/engine2/merger/` behind `runMerger`, specified
in SPEC §29 (v2.8.0; §29.10 to §29.21 are Phase 2; independent sign-off still pending for all of
§29). GM1 matches every populated reference cell; GM2 and GM3 match an independent Python
derivation (`scripts/goldens/merger_calc.py`) on every line; invariants 8 to 14 in
`tests/merger-phase2.test.ts`; 27 named mutants in `scripts/adversarial/merger-phase2-mutants.json`,
all killed (`node scripts/adversarial/mutate.mjs tests/merger < that file`).
Phase 2 departures from this plan, each written into the SPEC: one tax rate on all deal
adjustments (no separate rate on write-ups, so the DTL unwinds exactly); costs to achieve are a
`one_offs` line below EBITDA (leverage stays on recurring EBITDA); purchase accounting closes the
deal at the end of year 0 and every block's year 1 then opens from the closing balance sheet;
the unamortised financing fee is written off the year AFTER full repayment (keeps the sweep free
of circularity); break-even offer price and maximum premium moved to Phase 5 with the
sensitivities; GM2 has no valuation block (Phase 5).
Phase 0 shipped as:
`createCleaningStore(sink)` + `CleaningStoreContext` (the Clean screen reads whichever store its
provider names; the Buyout flow is the default and is unchanged) and `dealType` on sessions,
library entries and deal files. The "shared store helpers" item moves to Phase 4, where the merger
store becomes their second user (extracting them with one user would be guesswork).
Plan written 2026-11-14 against main @ 60b7280 (after PR #129).
Verification pass done the same day: the GM1 solve was recomputed independently, every reuse
claim in §3.2 and §3.3 was checked against the code (three corrections, marked VERIFIED), and
the §4 tag chains were checked against six live filers.
Audience: the model that codes this next. Read this top to bottom once, then work phase by phase (§13).
Reference workbook: `MA_simple_model_student_built.xlsx` (Prof. Petra; one sheet, "M&A model (student)").
Course material, NOT committed (same rule as G12-PROF): only the numbers extracted from it are, in
`tests/goldens/GM1/expected.json`, by `scripts/goldens/extract_gm1.py`.

## 0. What is being built, in one paragraph

A second deal type in the Deal Engine: a public acquirer buys a public target. Same four screens
(Source, Clean, Assumptions, Results), same provenance rules, same formula-workbook export. The
analyst sources BOTH companies from filings, cleans each, sets deal terms, financing, purchase
accounting and synergies, and gets the pro forma combined company: accretion or dilution of EPS,
pro forma leverage, the opening combined balance sheet, value created against premium paid, and
sensitivities. The reference workbook is the simplest case of this engine and becomes golden GM1;
the engine itself must carry real-world complexity (mixed consideration, diluted share count,
purchase price allocation, synergy phasing, debt schedules, partial-year close, different year ends
and currencies).

## 1. Rules that already bind this repo (do not relitigate)

1. Spec first. Every formula lands in `lib/engine2/SPEC.md` as new sections (§29 onward, see §7
   here for the content) with a changelog entry BEFORE code. Goldens adjudicate.
2. One path to every displayed number. UI computes nothing. `lib/format` is the only formatter.
3. Nothing is assumed for the user. A fact the filing lacks is an empty cell with a MISSING badge,
   never a default tagged as the user's. Forecasts, synergies, premium, mix: all start empty and
   gate Build; suggestions appear in-cell (cited first, then AI) exactly as on the LBO side.
4. Fixes are system-wide, validated out of sample (audience: a sceptical Excel-only professor).
5. User-visible text: no em dashes, no internal references (spec section numbers, file names,
   golden ids). `tests/no-em-dash.test.ts` and `tests/no-internal-references.test.ts` enforce it.
6. Site stays cookieless. No new third-party calls beyond the existing `api/edgar.ts` proxy.
7. No solver inside the evaluation order (SPEC §5). Interest is on BEGINNING balances (SPEC §4).
   The one goal-seek in this model (debt sized to a leverage cap) is an OUTER, deterministic
   bisection around the pure model function, specified in §7.11.
8. Existing LBO goldens must stay byte-green. The merger model adds; it does not edit LBO maths.

## 2. The reference workbook, dissected (golden GM1)

Layout: five column blocks, four years each (2023A pro forma, 2024E, 2025E, 2026E):
Buyer (C:F) | Target (H:K) | Buyer + Target (M:P) | Transaction impact (R:U) | Combined (W:Z).
Law of the sheet: Sum = Buyer + Target, Combined = Sum + Impact, for every flow and stock line;
ratios are recomputed inside each block, never added. Expenses and cash outflows are negative, so
every subtotal is a plain sum. ADOPT THIS FIVE-BLOCK LAW AS THE ENGINE'S OUTPUT SHAPE (§8).

Inputs (all €m unless stated):
- Target EV paid 8200; target net debt 2500 (refinanced); cost of acquisition debt 4%;
  buyer share price €24; fees 2% of equity value paid; pre-tax synergies 140 flat every year
  including the 2023A pro forma column; acquisition debt not amortised; leverage cap
  net debt / EBITDA 3.0x tested in 2025E; new equity issued at the current share price.
- Buyer: sales 15000 (2023A), growth 2.8% / 3.1% / 3.0%; EBITDA 2500 then margin 16.6 / 16.7 /
  16.8%; D&A -600, -616.8, -635.9208, -654.9984; net interest -141.6698, -136.5235, -131.0952,
  -124.7575 (hard-coded); tax 28%; minorities -191.2187, -196.4272, -205.2529, -214.2653; shares
  950; other cash items -250 flat; change in NWC -35, -33.6, -38.2416, -38.1552; capex -780 then
  5.2 / 5.3 / 5.3% of sales; other items -150 flat; dividends -506.3991 (2023A) then 40% payout of
  group net income; minority dividends 35% of minority interest; bank debt 6000, 5800, 5600, 5400;
  opening cash 1200.
- Target (presented debt free and cash free because its net debt is refinanced): sales 6000,
  growth 4.2 / 4.0 / 4.1%; EBITDA 1000 then margin 16.5 / 16.6 / 16.6%; D&A -252, -262.584,
  -273.0874, -284.2839; interest 0; tax 29%; minorities 0; other cash items -50; change in NWC
  -22, -23.226, -23.049, -24.5703; capex -320 then 5.3 / 5.4 / 5.4%; other items -40; dividends 0;
  debt 0; opening cash 0.
- Impact block: tax rate 30%; payout 40%.

Mechanics to reproduce exactly:
- Uses: equity value paid 5700 (= EV - net debt) + refinanced net debt 2500 + fees 114 = 8314.
  Sources: debt issued 7759 (found by goal seek) + equity issued 555 (the plug) = 8314.
  New shares 555 / 24 = 23.125; buyer dilution 23.125 / 950 = 2.43%.
- Impact P&L each year: EBITDA +140; interest = -4% x 7759 = -310.36 (on the constant balance; no
  interest on the impact block's own cash); PBT -170.36; tax +51.108 at 30%; net income -119.252.
- Impact dividends (2024E on): -(40% x (target NI + impact NI)) - target dividends
  = -170.6941, -181.2764, -190.6645. That is: the buyer's payout applied to the incremental
  group earnings. 2023A impact dividend is 0.
- Impact cash: 2023A column books the acquisition (-8314), debt (+7759) and equity (+555), ending
  -119.252, but 2024E OPENS AT ZERO (the "deal at 1/1/24" convention: the 2023A column is pro
  forma P&L only, its cash is not carried). Then -289.9461, -590.4745, -900.3910.
- Combined: EPS 1.5277 / 1.5732 / 1.6517 / 1.7281 on 973.125 shares; accretion against buyer
  standalone EPS 35.35% / 35.96% / 36.24% (2024E to 2026E); net debt 12130.2479 / 11884.6602 /
  11622.8769 / 11321.4162; ND/EBITDA 3.3325 / 3.1851 / 3.0000 / 2.8201; DPS 0.5204 / 0.6293 /
  0.6607 / 0.6913; cash checks (block cash = sum of blocks to the left) all zero.

What the workbook leaves out (the professor's own prompt H1 asks for these; they are the feature
list of the real engine): no purchase accounting (no goodwill, no write-ups, no amortisation of
acquired intangibles), fees neither expensed nor capitalised, flat un-phased synergies with no
cost to achieve, one debt instrument with no fees or amortisation, no interest on changing cash,
no diluted share count or premium analysis, no balance sheet, start-of-year close only, no
sensitivities, and hard-coded goal seek.

GM1 must be reproducible by the general engine purely through assumption settings (the "GM1
switch set", §10), with no special-case code path. If a number can only be matched with a
branch that says "reference mode", the design is wrong.

## 3. Architecture

### 3.1 Where code goes

New, parallel to the LBO modules, inside the single engine and under the same SPEC:

```
lib/engine2/merger/
  types.ts          MergerFacts, CompanySide, MergerAssumptions, MergerOutput (§6, §8)
  standalone.ts     one company's standalone forecast to net income, cash and net debt
  consideration.ts  offer price, diluted shares (treasury stock method), exchange ratio, mix
  sourcesUses.ts    merger sources and uses, fees by kind
  ppa.ts            purchase price allocation, goodwill, deferred tax, opening combined balance sheet
  adjustments.ts    the Transaction impact block, line by line
  combine.ts        five-block assembly (Sum, Combined) and in-block ratios
  financing.ts      acquisition debt schedule and combined cash roll (kernel only)
  accretion.ts      EPS, accretion or dilution, break-evens
  value.ts          synergy value against premium, contribution analysis, return on invested capital
  credit.ts         pro forma leverage and coverage; the leverage-cap sizing wrapper
  check.ts          merger invariants (§9) as coherence flags
  scenarios.ts      sensitivity grids and named cases
  facade.ts         runMerger(facts, assumptions): MergerOutput   <- the ONE entry point
  workbook.ts       formula workbook (five-block sheet + schedules)
```

Do NOT thread merger branches through `runModel`, `sequence.ts`, `exit.ts`, `returns.ts`. Those
are sponsor-return machinery. The merger facade is a sibling of `facade.ts`.

### 3.2 Reuse map (verified to exist on main)

| Need | Reuse | Note |
|---|---|---|
| Filing import, both companies | `lib/edgar/*` (mapXbrl, mapCompanyFactsIfrs, mapIfrs, esef, ltmStitch, history) | extend the mappers with the extra lines in §4 |
| Statement grid per company | `lib/statements/pack.ts` (`buildStatementPack`), `LineId` | add line ids (§4) |
| Clean step per company | `lib/cleaning/*` (ledger, ops, apply, checks, view) | pure functions already take a pack and a ledger: reusable as is, twice |
| Share count and price | `lib/edgar/quote.ts` (`sharesOutstanding`, quote) | add diluted securities (§4) |
| Revenue and margin paths | `operating.ts` (`buildRevenue`, `marginPath`, `nwcBalance`), `LineSpec`, `ForecastLines` | one call per company |
| Interest, amortisation, tax state | `kernel/rates.ts`, `kernel/amort.ts`, `kernel/taxstate.ts` | acquisition debt tranches use `TermTrancheAssumption` unchanged |
| Capitalised financing fees | `operating.ts` `buildAmortizingCostSchedules` | same treatment as the LBO side |
| Cash waterfall primitive | `kernel/waterfall.ts` (`waterfallYear`) | VERIFIED NOT A FIT for the impact block: its distribution step pays `min(request, cash - min_cash)`, but GM1's impact block pays dividends in full and runs NEGATIVE cash by design (-289.9, -590.5, -900.4). Write `merger/financing.ts` on `kernel/rates` + `kernel/amort` only. `waterfallYear` may be used later for the optional acquisition-debt sweep on the COMBINED company, nowhere else. |
| Coherence flags | `CoherenceFlag` type, `check.ts` pattern | new merger flag ids |
| Sensitivity grid shape | pattern only | VERIFIED: `SensitivityGrid` hard-codes `irr` and `moic` matrices and `SensitivityAxis` is LBO-only. Define `MergerSensitivityGrid { row_axis; col_axis; row_values; col_values; base_row_index; base_col_index; metric: 'accretion' \| 'leverage'; year: number; values: (number \| null)[][] }`. Do not widen the LBO type. |
| Suggestions and badges | `suggest.ts`, `suggestions/conventions.json`, `FieldBasis`, `BasisBadge` | new paths under `merger.*` |
| AI in cells, assistant | `lib/ai2/propose.ts`, `lib/assistant/*` | add merger briefs; AI never gates |
| Formatting | `lib/format/index.ts` | VERIFIED ABSENT: only `num, money, moneyIso, pct, multiple, bps, headroom`. Add `perShare(v, currency)` (money at 2 dp) and `ratio(v)` (4 dp, e.g. "0.4813x") there, with tests. |
| Workbook writer | `lib/engine2/workbook.ts` (ExcelJS, `buildFormulaWorkbook`, `formulaCoverageBlockers`, `ParityCell`) | lift shared cell/formula helpers; do not copy-paste. Parity is proven by `tests/engine2-workbook-parity.test.ts`: export WITHOUT cached values, recalculate in headless LibreOffice, compare every parity-mapped cell to the engine. Copy that harness for the merger workbook. |
| UI kit | `components/deal-engine/ui/*`, `v2/fields.tsx`, `HistoryTable`, `DebtTable`, shell | DebtTable edits acquisition tranches directly |

### 3.3 The one real refactor: singleton stores

`store/dealEngine.ts`, `store/cleaning.ts`, `store/engine2Model.ts` each hold ONE company. The
merger flow holds TWO. Do not duplicate the stores and do not make the existing ones generic
(that risks the LBO flow). Instead:

- New `store/mergerModel.ts` with `sides: { acquirer: SideState; target: SideState }` where
  `SideState = { raw: RawHistoricals | null; pack: StatementPack | null; ledger: CleaningLedger;
  cleaned: CleanedHistoricals | null; quote: ...; missing: ...; basis: ... }`, plus
  `assumptions: MergerAssumptions | null`, `output: MergerOutput | null`, pending/suggestions/
  undo-redo in the same shape `engine2Model.ts` uses. Copy the lifecycle contract (import ->
  suggest -> badged edits -> ATOMIC build), not the code: extract the shared pieces
  (basis bookkeeping, undo stack, suggestion accept/dismiss) into a small helper module used by
  both stores, behind tests, in its own preparatory commit that leaves LBO tests green.
- `CleanScreen` (513 lines) reads `useCleaning` directly (18 call sites). DONE (Phase 0) without
  touching it: `useCleaning` reads the store named by `CleaningStoreContext` (default: the Buyout
  store), and `createCleaningStore(sink)` makes one store per company. The merger Clean screen
  renders it twice, each inside a provider, behind an Acquirer | Target switch.
- `store/session.ts` and `store/workspace.ts` gain a `dealType: 'lbo' | 'merger'` discriminator.
  Old saves have no field and mean 'lbo'. Add a round-trip test for both.
- Entry: `SourceScreen` gets a deal-type choice first (Buyout | Merger). `DealShell` steps stay
  the same four ids. VERIFIED: routes are already namespaced by deal type
  (`stepPath = /deal-engine/lbo/<step>` in `pages/DealEngine.tsx`; `App.tsx` matches any
  `/deal-engine` prefix). Add `/deal-engine/merger/<step>` as a sibling page
  (`pages/MergerEngine.tsx`) with its own `resolveStep` gate, rather than branching inside the
  LBO page.

## 4. Data: what must be sourced per company

Already extracted: revenue, EBITDA, D&A, capex, NWC, gross debt, cash, net PP&E, effective tax
rate, history, LTM stitch, sector, share count (dei) and delayed quote.

Add to `LineId`, the candidate tag lists, and all three mappers (US GAAP companyfacts, IFRS
companyfacts, ESEF), each with provenance, each nullable with a gap entry:

Tag chains below were VERIFIED on 2026-11-14 against live SEC companyfacts for Apple, Pfizer,
Exxon, Hasbro, Bank of America (US GAAP) and SAP (IFRS 20-F). "Latest" = latest 10-K/20-F
fiscal year the tag appears in. First match wins, per period, following the layered-resolver
pattern already in `mapXbrl`. Every line is nullable with a gap entry.

| Line | US GAAP chain (verified) | IFRS chain (verified on SAP) | Notes from the check |
|---|---|---|---|
| interest_income | InvestmentIncomeInterest -> InterestIncomeOther | FinanceIncome | Apple tags neither (reports other income net): GAP, and rates-mode net interest then uses yield on cash as an analyst input |
| net_income_parent | NetIncomeLoss | ProfitLossAttributableToOwnersOfParent | all six |
| nci_income | NetIncomeLossAttributableToNoncontrollingInterest | ProfitLossAttributableToNoncontrollingInterests | absent = 0 only when MinorityInterest is also absent; otherwise GAP |
| eps_diluted | EarningsPerShareDiluted | DilutedEarningsLossPerShare | all six |
| shares_diluted_wtd | WeightedAverageNumberOfDilutedSharesOutstanding | AdjustedWeightedAverageShares | Exxon stopped tagging diluted in 2013 (no dilutive securities): fall back to basic WITH a visible note, never silently. IFRS `WeightedAverageNumberOfSharesOutstandingDiluted` does NOT exist in practice: dropped |
| shares_basic_wtd | WeightedAverageNumberOfSharesOutstandingBasic | WeightedAverageShares | all six |
| dividends_paid | PaymentsOfDividends -> PaymentsOfDividendsCommonStock -> PaymentsOfOrdinaryDividends | DividendsPaidClassifiedAsFinancingActivities | Pfizer uses PaymentsOfOrdinaryDividends only; Apple switched from ...CommonStock to PaymentsOfDividends after 2017. SAP's IFRS tag stops 2019: expect a GAP for recent IFRS years |
| dps | CommonStockDividendsPerShareDeclared -> CommonStockDividendsPerShareCashPaid | DividendsRecognisedAsDistributionsToOwnersPerShare | Exxon only tags CashPaid |
| buybacks | PaymentsForRepurchaseOfCommonStock | PaymentsToAcquireOrRedeemEntitysShares | all six |
| intangibles | IntangibleAssetsNetExcludingGoodwill -> FiniteLivedIntangibleAssetsNet | IntangibleAssetsOtherThanGoodwill | Exxon: none (GAP is a legitimate zero-candidate the analyst confirms) |
| deferred_tax (net) | DeferredTaxAssetsLiabilitiesNet -> DeferredIncomeTaxLiabilitiesNet -> DeferredIncomeTaxAssetsNet | DeferredTaxLiabilities, DeferredTaxAssets | US tagging is inconsistent (Hasbro only tags the components and the net). OPTIONAL fact: only the opening balance sheet needs it; the PPA computes the NEW DTL itself. Never gate Build on it |
| nci_equity | MinorityInterest | NoncontrollingInterests | |
| equity_parent | StockholdersEquity -> (StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest - MinorityInterest) | EquityAttributableToOwnersOfParent | Hasbro stopped tagging StockholdersEquity in 2019: the derived fallback is required, and its provenance must say it is derived |
| preferred | PreferredStockValue | (GAP unless tagged) | |
| total_assets / total_liabilities | Assets, Liabilities | Assets, Liabilities | all six |
| amort_intangibles | AmortizationOfIntangibleAssets | (GAP; `AmortisationExpense` not used by SAP) | Exxon: none |
| dilutive_increment | IncrementalCommonSharesAttributableToShareBasedPaymentArrangements -> WeightedAverageNumberDilutedSharesOutstandingAdjustment | DilutiveEffectOfShareOptionsOnNumberOfOrdinaryShares | Pfizer/BofA use the second US tag |
| options_outstanding, options_wtd_strike | ShareBasedCompensationArrangementByShareBasedPaymentAwardOptionsOutstandingNumber / ...WeightedAverageExercisePrice | (GAP) | Tagged by Pfizer (2025); stale or absent elsewhere. When present and current, offer it as ONE cited suggested row in the dilutive securities table (aggregate count at the weighted average strike, labelled as an approximation). Never auto-filled |

Add frozen-fixture tests in the style of `tests/edgar-frozen-hasbro.test.ts` for Pfizer (has
NCI, options, the Ordinary dividends tag) and Hasbro (derived equity). Keep the verification
script (`scripts/ma_tag_check.py`, see Phase 3) so the chains can be re-checked when tags drift.

Diluted share count for the TARGET at the OFFER price needs option counts and strikes, which
XBRL carries poorly (verified above). Rule: source `shares_basic` (cover page) and the reported dilutive increment
as a cited starting point; give the analyst an optional table of dilutive securities
(type, count, strike or conversion price) on the Clean step; with the table empty, the diluted
count is basic + reported increment and a note says the increment was measured at the average
market price, not the offer price. Never invent an option table.

Not available from filings and never pre-filled: forward estimates (consensus), the unaffected
share price date, synergies, premium. Standalone forecasts are analyst inputs with in-cell
suggestions (history-based, cited). A consensus feed is out of scope; leave a typed hook
(`ForecastSource`) so one can be added.

Two-company alignment (Clean step, explicit and visible, never silent):
- Fiscal year end mismatch: calendarise the target to the acquirer's year end by time-weighting
  adjacent fiscal years, or by quarters where `ltmStitch` data exists. Show the weights.
- Currency mismatch: one analyst-entered FX rate (target currency per acquirer currency), applied
  to all target figures; flagged on every surface. Empty by default; gates Build.
- GAAP mismatch: the existing `LeaseChoice` must be set the same way on both sides; a check
  blocks Build when one side's EBITDA is before lease cost and the other's is after.

## 5. Clean step for a merger

Per company: the existing ledger (EBITDA adjustments, net debt items, overrides, lease choice)
unchanged. Additions:
- Net debt items already classify debt-like and cash-like items. Add a per-item flag on the
  TARGET only: `at_close: 'refinanced' | 'assumed'` (default: empty, analyst chooses; suggestion
  cites change-of-control language is typical for bank debt). This drives Uses and interest.
- Equity bridge for the target: EV to equity value needs NCI, preferred, and associates. Reuse
  net-debt categories; ensure NCI and preferred have categories.
- Dilutive securities table (target, and acquirer if it issues shares) as in §4.
- Alignment panel (year end, currency, GAAP) as in §4.
- Output of Clean feeds `MergerFacts` through one adapter, `merger/factsAdapter.ts`, mirroring
  `lib/engine2/factsAdapter.ts` (required gaps gate Build; degradations become notes).

## 6. Input schema (write into SPEC as the merger §16 equivalent)

```ts
interface CompanySide {                  // built by the adapter from cleaned data; all nullable facts gate Build where required
  entity_name: string; currency: Engine2Currency; fiscal_year: number | null; period_end: string | null;
  base: {                                // last actual year (or LTM for sizing lines), cleaned
    revenue; ebitda; da; ebit; interest_expense; interest_income; pretax; tax; net_income; nci_income;
    net_income_parent; capex; delta_nwc; dividends; nci_dividends
  };
  balance: { cash; gross_debt; net_debt_items: {...}[]; nwc; net_ppe; goodwill; intangibles;
             deferred_tax_liab; deferred_tax_asset; other_assets; other_liabilities;
             equity_parent; nci_equity; preferred };
  shares: { basic: number | null; reported_dilutive_increment: number | null;
            securities: DilutiveSecurity[] };   // option | rsu | convertible
  price: { current: number | null; as_of: string | null };
  history: HistoricalYear[];
}
interface MergerFacts { acquirer: CompanySide; target: CompanySide;
                        alignment: { fx_target_per_acquirer: number | null; calendarised: boolean; notes: string[] } }

interface StandaloneAssumption {         // one per company; reuses ForecastLines / LineSpec
  lines: ForecastLines;                  // revenue, ebitda (or ebit), da, capex, delta_nwc
  other_cash_items: LineSpec | null;     // GM1 "other cash items" above the working-capital line
  other_items: LineSpec | null;          // GM1 "other items" below free cash flow
  net_interest: { mode: 'explicit'; values: number[] }
              | { mode: 'rates'; cost_of_debt: number; yield_on_cash: number };   // on beginning balances
  debt_schedule: { mode: 'explicit'; balances: number[] } | { mode: 'hold' } | { mode: 'amort'; per_year: number[] };
  tax_rate: number;
  nci: { mode: 'explicit'; values: number[] } | { mode: 'pct_of_net_income'; pct: number };
  nci_payout: number;                    // dividends to minorities as a share of minority income
  dividends: { mode: 'payout'; ratio: number[] } | { mode: 'dps'; values: number[] } | { mode: 'explicit'; values: number[] };
  buybacks: number[] | null; buyback_price_growth: number | null;
  shares: number;                        // opening standalone share count (diluted for EPS)
}

interface MergerAssumptions {
  deal_name: string;
  horizon_years: number;                 // forecast years after close (GM1: 3)
  timing: { close: 'start_of_year_1' } | { close: 'mid_year'; fraction_of_year_1: number };  // owned share of year 1
  pro_forma_year0: boolean;              // also show last actual year "as if combined" (GM1: true)
  price: { driver: 'offer_per_share' | 'premium' | 'equity_value' | 'enterprise_value';
           offer_per_share: number | null; premium_to: 'current' | 'unaffected'; premium: number | null;
           unaffected_price: number | null; equity_value: number | null; enterprise_value: number | null };
  consideration: { pct_stock: number | null;             // of the equity purchase price; null when solved (below)
                   exchange: 'fixed_ratio' | 'fixed_value';
                   acquirer_issue_price: number | null }; // price new shares are issued at (GM1: 24)
  funding: {                              // funds the cash part, refinancing and fees
    cash_from_balance_sheet: number; min_cash: number;
    tranches: TermTrancheAssumption[];    // REUSED type; size, pricing, amortisation, fees, OID
    equity_raise: { amount: number; discount: number } | null;   // primary placing to the market, distinct from stock paid to the target
    plug: 'debt' | 'equity' | 'none';     // which source balances the table (GM1: equity)
    leverage_cap: { metric: 'net_debt_to_ebitda'; max: number; test_year: number } | null;  // GM1: 3.0x, year 2
    solve: 'none' | 'max_debt_at_cap';    // GM1: max_debt_at_cap
  };
  target_debt: 'per_clean_step' | 'refinance_all' | 'assume_all';
  fees: { advisory: { basis: 'pct_equity_value' | 'pct_enterprise_value' | 'amount'; value: number;
                      treatment: 'expensed' | 'not_recognised'; tax_deductible: boolean };
          financing_pct_of_debt: number; equity_issuance_pct: number; other_one_off: number };
  ppa: null | {                           // null = no purchase accounting (GM1)
    structure: 'stock_purchase' | 'asset_purchase';      // asset: step-up deductible, no deferred tax on it
    ppe_writeup: number; ppe_life_years: number;
    intangibles: { name: string; amount: number; life_years: number | null }[];   // null life = indefinite, not amortised
    writeoff_existing_goodwill: boolean;  // true under the standard
    debt_fair_value_adjustment: number;
    tax_rate_on_writeups: number;
    tax_goodwill_life_years: number | null;   // asset purchase only (15 in the US)
  };
  synergies: {
    cost: { run_rate: number; phasing: number[] };        // phasing[t] in [0,1], length horizon (+1 if pro_forma_year0)
    revenue: { run_rate: number; phasing: number[]; flow_through_margin: number } | null;
    cost_to_achieve: number[] | null;                     // one-off cash and P&L cost per year
    dis_synergies: number[] | null;
    apply_to_year0: boolean;                              // GM1: true (flat 140 in the pro forma actual year)
  };
  adjustments_tax_rate: number;           // rate on the impact block (GM1: 30%)
  interest_on_impact_cash: { mode: 'none' } | { mode: 'rate'; rate: number };   // GM1: none
  combined_policy: { dividends: { mode: 'acquirer_payout_on_group_income'; ratio: number[] }   // GM1
                              | { mode: 'acquirer_dps_held' } | { mode: 'explicit'; values: number[] };
                     sweep_pct_of_free_cash: number;      // optional repayment of acquisition debt (0 in GM1)
                     buybacks: number[] | null };
  year0_cash_carried: boolean;            // GM1: false (impact cash restarts at zero in year 1)
  valuation: null | { wacc: number; synergy_terminal_growth: number; synergy_multiple: number | null;
                      acquirer_cost_of_equity: number | null };
  sensitivities: { axes: MergerSensitivityAxis[] } | null;
  scenarios: { name: string; deltas: MergerScenarioDeltas }[] | null;
}
```

Every `null`-able driver that the analyst must choose starts null and is a named Build rejection
(RangeError with a plain-language message), following SPEC §16 and §24.3. Validation examples:
phasing lengths, `pct_stock` in [0,1], exactly one price driver populated, tranche sizes not
both fixed and plugged, intangibles sum plus write-up not above the purchase premium over book
without a warning (negative goodwill is flagged as a bargain purchase, not clamped).

## 7. Calculation specification (draft for SPEC §29 to §40; order = evaluation order)

Sign convention on the engine side: follow the LBO engine (positive magnitudes in typed fields).
The five-block DISPLAY and the workbook use the reference convention (costs negative) through one
display adapter. Decide this once in the SPEC; do not mix inside modules.

7.1 Standalone forecasts (per company, `standalone.ts`). Revenue, EBITDA, D&A, EBIT, capex,
change in NWC from `ForecastLines` via the existing operating helpers. Net interest per its mode
(rates mode: beginning gross debt x cost of debt less beginning cash x yield). PBT, tax at the
side's rate, net income, minority income, group net income, EPS on standalone shares (after
buybacks: shares bought = buyback / (price grown at `buyback_price_growth`)). Cash flow in the
reference order: EBITDA, net interest, other cash items, tax = net cash before working capital;
then change in NWC, acquisitions, capex = free cash flow before financing; then other items,
dividends, minority dividends, debt raised or repaid, equity issuance = change in cash. Net debt
and ND/EBITDA. Year 0 is the last actual year from cleaned facts.

7.2 Target as acquired. When target debt is refinanced, the target block is presented debt free
and cash free: interest 0, opening cash 0, debt 0 (GM1). When assumed, the target keeps its debt
schedule and interest. Mixed per-item treatment follows the Clean flags. The target's standalone
dividends are shown but neutralised in the impact block (the combined company sets one policy).

7.3 Price and diluted shares (`consideration.ts`). Offer per share from the chosen driver.
Diluted target shares at the offer price P: basic + sum over options max(0, n x (1 - K / P)) +
RSUs + convertibles if converted when P > conversion price (then their debt drops out of net
debt: flag it). No circularity because P is an input or derived from equity value by a closed
loop: when the driver is equity value or EV, solve P by fixed-point over at most the number of
security strikes (piecewise linear: sort strikes, find the segment, solve linearly). Equity
purchase price = P x diluted shares. EV = equity price + target net debt + NCI + preferred
- associates. Implied multiples on LTM and year-1 EBITDA, with and without run-rate synergies.
Premium to current and to unaffected price.

7.4 Consideration. Stock part = pct_stock x equity price. New acquirer shares = stock part /
acquirer issue price. Exchange ratio = pct_stock x P / acquirer issue price (shares of acquirer
per target share). Fixed-ratio and fixed-value differ only in sensitivities: when the acquirer
price is flexed, fixed ratio holds shares and moves value; fixed value holds value and moves
shares. Pro forma ownership = old acquirer shares vs new shares (target holders plus any
primary placing).

7.5 Sources and uses (`sourcesUses.ts`). Uses: equity purchase price; refinanced target debt
net of target cash used (per §7.2); advisory fees; financing fees; equity issuance fees; other
one-off costs; cash to balance sheet if min cash requires. Sources: stock issued to target
holders; new debt by tranche (net of OID as on the LBO side); primary equity raise; acquirer
cash used (capped so cash stays at or above min cash); the plug. Invariant: sources = uses to
0.005. If `plug: 'equity'`, equity issued = uses - other sources (GM1). Negative plug is a
Build rejection with a message naming the over-funded source.

7.6 Purchase accounting (`ppa.ts`), skipped entirely when `ppa` is null.
  Adjusted net identifiable assets = target equity attributable to parent
    - existing goodwill (if written off)
    + PP&E write-up + sum of new intangibles (incremental to book intangibles)
    - debt fair value adjustment (positive = debt marked up)
    - new deferred tax liability, where DTL = tax_rate_on_writeups x (PP&E write-up + finite and
      indefinite intangibles - debt FV adjustment) for a stock purchase and 0 for an asset purchase.
  Goodwill = equity purchase price (+ fair value of NCI if the analyst opts for full goodwill;
  default partial: NCI stays at book) - adjusted net identifiable assets.
  Annual incremental depreciation = PP&E write-up / life; amortisation = each finite intangible /
  its life (straight line, time-weighted in a partial year 1). The DTL unwinds at the tax rate x
  that year's incremental D&A (so book tax falls; cash tax does not: the difference is a
  deferred tax line in cash flow). Asset purchase: write-ups and goodwill are deductible for
  CASH tax (goodwill over `tax_goodwill_life_years`); book goodwill is not amortised; the
  resulting book-tax difference builds a DTL over time. Advisory fees with
  treatment 'expensed' hit acquirer retained earnings at close (after tax only if deductible).
  Financing fees are capitalised and amortised over each tranche's tenor (existing helper).
  Equity issuance fees reduce the equity raised. Deferred revenue haircuts are NOT modelled
  (current US standard carries acquired contract liabilities at book); say so in disclosures.
  Opening combined balance sheet = acquirer + target + adjustment columns (eliminate target
  equity, book goodwill, write-ups, DTL, new debt, cash used, fees). It must balance to 0.005.

7.7 The Transaction impact block (`adjustments.ts`). One row per statement line, per year:
  - EBITDA: cost synergies x phasing + revenue synergies x phasing x flow-through - dis-synergies
    - cost to achieve (shown on its own row and excluded from adjusted EPS). Revenue synergies
    also add to Sales.
  - D&A: incremental depreciation and amortisation from 7.6.
  - Net interest: - sum over new tranches of beginning balance x all-in rate (kernel/rates)
    - financing fee and OID amortisation - forgone yield on acquirer cash used
    + target interest removed on refinanced debt (only if the target block still carries it;
    under the debt-free presentation of 7.2 this term is zero by construction)
    + interest on the impact block's own beginning cash at `interest_on_impact_cash` (the block's
    cash is usually negative, so this is a cost; GM1: none).
  - Tax: - impact PBT x `adjustments_tax_rate`, with non-deductible items (expensed advisory
    fees if flagged, book amortisation in a stock purchase is still tax-effected through the DTL
    unwind) handled explicitly. Loss-making combined years: no tax-state machine in v1 of the
    merger model; negative PBT gives a tax credit at the rate, FLAGGED when combined PBT < 0.
    (Later phase: route combined tax through `kernel/taxstate`.)
  - Minorities: unchanged unless the target has NCI (it flows through the target block).
  - Shares: new shares from 7.4 plus primary placing shares, time-weighted in a partial year 1;
    minus combined buybacks.
  - Cash flow: the same reference line order as 7.1. Acquisition row = - total uses in the
    close period. Debt raised and equity issued from 7.5. Dividends per `combined_policy`:
    for 'acquirer_payout_on_group_income', impact dividends = -(ratio x (target group NI + impact
    NI)) - target standalone dividends (reproduces GM1 exactly). Mandatory amortisation and
    optional sweep on acquisition debt (sweep = pct x max(0, combined free cash flow after
    dividends), applied by tranche priority, capped at outstanding, cash never below min cash).
  - Cash and debt roll for the block. `year0_cash_carried: false` resets year-1 opening impact
    cash to zero (GM1) and requires `pro_forma_year0: true`.

7.8 Combine (`combine.ts`). Sum = acquirer + target; Combined = Sum + impact; every flow and
stock line; ratios (growth, margin, effective tax rate, payout, capex %, leverage) recomputed
in-block. Combined shares = acquirer standalone shares + impact shares (target shares are
cancelled: the Sum block shows acquirer shares only, as in the reference row 46).

7.9 Partial-year close. `fraction_of_year_1 = f`: target block and impact block year-1 FLOWS
are scaled by f (target pre-close flows belong to the seller); new shares are weighted by f for
year-1 EPS; interest on new debt accrues for f; D&A from write-ups for f. Year 2 on is full.
Also output a "full-year pro forma" year 1 (f = 1 view) because that is what analysts quote.
Start-of-year close is f = 1.

7.10 Accretion and break-evens (`accretion.ts`). For each forecast year:
  reported EPS = combined group net income / combined weighted diluted shares;
  adjusted (cash) EPS adds back after-tax amortisation of acquired intangibles and after-tax
  one-offs (cost to achieve, expensed fees); accretion = combined EPS / acquirer standalone EPS
  - 1 (same year, same basis). Null, not zero, when standalone EPS <= 0 (display N/A).
  Break-even pre-tax synergies in year t = - (combined NI - standalone EPS x combined shares)
  / (1 - adjustments tax rate), floored at none-needed when already accretive; shown as an
  amount and as % of the target's cost base. Break-even offer price and maximum premium for
  zero dilution in a chosen year: closed form when 100% cash and no dilutive-security kinks;
  otherwise the outer bisection of 7.11 on a monotone function. Explanatory read-outs: target
  earnings yield at the offer (NI / equity price) against after-tax cost of debt and against the
  acquirer's earnings yield (the all-cash and all-stock rules of thumb), labelled as rules of
  thumb. Dividend per share effect for both shareholder groups (target holders: old DPS vs
  exchange ratio x combined DPS).

7.11 Leverage cap and the sizing solve (`credit.ts`). Metrics per year for acquirer standalone
and combined: net debt / EBITDA, gross debt / EBITDA, EBITDA / net interest, (EBITDA - capex) /
interest, FFO / net debt. `solve: 'max_debt_at_cap'`: find the size D of the designated plug
tranche such that the cap metric in `test_year` equals `max`, with equity as the residual.
g(D) = metric(D) - max is continuous and strictly increasing in D under 7.7 (more debt, more
interest, less cash). Deterministic bisection on [0, total uses], tolerance 1e-9 on the metric,
max 200 iterations, pure function of inputs, OUTSIDE runMerger's evaluation order
(`sizeDebtToCap(facts, assumptions) -> assumptions'`, then one normal run). If g(total uses) <= 0
the deal is fully debt funded and the cap does not bind (report headroom). If g(0) > 0 the cap is
breached even with no new debt: flag, do not clamp. In GM1 g is exactly linear; assert the
closed-form root equals the bisection root.

7.12 Value (`value.ts`), only when `valuation` is set. Present value of synergies = sum of
after-tax phased synergies less cost to achieve, discounted at WACC, plus a terminal value
(growing perpetuity at `synergy_terminal_growth`, or run-rate x multiple if given; show both when
both set, never blend). Premium paid = equity price - unaffected market value. Value created for
acquirer holders = their pro forma ownership x (standalone value of both + PV synergies - cash
leaving - fees) - acquirer standalone value: with 100% cash this collapses to PV synergies
- premium - fees. Split of synergy value between the two shareholder groups. Contribution
analysis: each side's share of revenue, EBITDA, EBIT, net income against pro forma ownership.
Return on invested capital of the deal per year = (target EBIT + synergies - incremental D&A)
x (1 - tax) / (EV paid + fees), against WACC, with the first year it crosses.

7.13 Sensitivities and cases (`scenarios.ts`). Grids (reuse `SensitivityGrid`): accretion in a
chosen year against (premium x % stock), (cost synergies x offer price), (cost of debt x % cash),
(acquirer share price x % stock, honouring fixed ratio vs fixed value); pro forma leverage
against (% stock x EBITDA shortfall). Named cases (base, synergies delayed a year, synergies at
50%, rates +100bp). Each cell is a full `runMerger` call (no shortcut maths), as on the LBO side, returned as
`MergerSensitivityGrid` (§3.2); the base cell must equal the base run (invariant, as LBO §14.7).

## 8. Output shape

```ts
type Block<T> = { acquirer: T; target: T; sum: T; impact: T; combined: T };
interface MergerOutput {
  facts; assumptions;
  years: { label: string; kind: 'pro_forma_actual' | 'forecast'; fraction: number }[];
  price: { offer_per_share; premium_current; premium_unaffected; diluted_target_shares; equity_value;
           enterprise_value; multiples: {...}; exchange_ratio; new_shares; ownership: { acquirer; target; placing } };
  sources_uses: { sources: Row[]; uses: Row[]; total: number };
  ppa: null | { rows: Row[]; goodwill; deferred_tax_liability; annual_incremental_da: number[];
                opening_balance_sheet: { acquirer; target; adjustments; combined }[]; check: number };
  income: Block<IncomeYear[]>; cash_flow: Block<CashFlowYear[]>; debt: Block<DebtYear[]>;
  balance_sheet: BalanceSheetYear[] | null;         // combined, forecast; null when ppa is null
  eps: { standalone: number[]; combined: number[]; combined_adjusted: number[];
         accretion: (number | null)[]; accretion_adjusted: (number | null)[];
         breakeven_synergies: number[]; dps: Block<number[]> };
  credit: { standalone: CreditYear[]; combined: CreditYear[]; cap: {...} | null };
  value: null | {...}; coherence: CoherenceFlag[];
  sensitivity: SensitivityGrid[] | null; scenarios: {...}[] | null;
}
```

## 9. Invariants (merger §14 equivalent; each a test and a coherence flag)

1. Sources = uses (0.005).
2. Combined = acquirer + target + impact for every flow and stock line, every year (1e-9).
3. Block cash built line by line = sum of block cash to the left (the workbook's row 85 checks).
4. Opening combined balance sheet balances; forecast balance sheet balances every year.
5. Goodwill identity: purchase price - adjusted net identifiable assets (recomputed independently).
6. Total intangible amortisation over life = amount; DTL fully unwinds for finite-lived items.
7. Debt roll: closing = opening + raised - repaid for each tranche; never negative.
8. Share roll: combined = acquirer + new - bought back; ownership shares sum to 1.
9. 100% cash, no placing: new shares = 0 and accretion sign equals sign of impact net income + target NI.
10. Zero synergies, zero premium, 100% stock at equal P/E, no fees, no PPA: accretion = 0 (1e-9).
11. Solved leverage equals the cap to 1e-9 when the cap binds.
12. Neutrality: with the target scaled to zero and no deal financing, combined = acquirer standalone.
13. Partial year: f = 1 output equals the start-of-year output.
14. Fixed ratio vs fixed value give identical results at the unflexed acquirer price.

Mutation-test the invariants (the repo already does this for the LBO side): each named mutant
must turn at least one test red.

## 10. Goldens

- GM1 (reference workbook). Inputs in §2. Switch set: `ppa: null`; advisory fee 2% of equity
  value, `treatment: 'not_recognised'`; `pct_stock` solved, `plug: 'equity'`,
  `solve: 'max_debt_at_cap'` at 3.0x in year 2, one bullet tranche at 4% with no fees;
  `target_debt: 'refinance_all'`; flat synergies 140 with `apply_to_year0: true`; impact tax 30%;
  `interest_on_impact_cash: none`; payout 40% on group income; `pro_forma_year0: true`;
  `year0_cash_carried: false`; explicit lines for the hard-coded rows. Pin every computed cell of
  the sheet (write `scripts/goldens/extract_gm1.py` in the style of `extract_g12prof.py`; the
  cached values in the xlsx are the expected numbers). Solve check (VERIFIED 2026-11-14 by independent
  recomputation): with every other GM1 input fixed, combined 2025E ND/EBITDA is exactly linear in
  the debt raised D, and the exact root at 3.0x is D* = 7759.0648 (equity issued 554.9352). The
  sheet's 7759 is that root rounded to a whole number, giving 2.99998 (shown as 3.0). So pin two
  runs: (a) debt FIXED at 7759 reproduces every cached cell of the sheet to 1e-4; (b) the solve
  run returns D* = 7759.0648 to 1e-4 and leverage 3.0 to 1e-9.
- GM2 (full-feature, hand-derived in `scripts/goldens/spec_calc.py` style, independent Python):
  60% stock, premium driver, option table, two tranches (amortising term loan plus bond with
  fees), PPA with write-up and two intangibles, phased synergies with cost to achieve, mid-year
  close, valuation on.
- GM3 (asset purchase, all cash, acquirer cash used, target debt assumed, loss-making target).
- GM4 (cross-currency, different year ends, calendarised; data-side golden).
- One live out-of-sample pair through EDGAR in a smoke script (not CI): pick a closed public
  deal and compare reported pro forma figures from the merger proxy (S-4 / 8-K pro forma
  financial statements carry goodwill, new shares, pro forma EPS) to the engine. This is the
  professor test: an external document, not our own derivation.

## 11. Workbook export

One sheet that mirrors the reference layout (assumptions block and sources and uses on top, then
P&L, cash flow, debt in five column blocks) so the professor's own file is recognisable, with
LIVE formulas following the reference patterns (Sum = Buyer + Target, Combined = Sum + Impact,
in-block ratios, check rows). Additional sheets: Price and shares, Purchase accounting and opening
balance sheet, Debt schedule, Accretion, Sensitivities (as values, labelled as such), Notes (cell
comments carry provenance, as today). The leverage solve exports as the solved hard-coded debt
plus a visible check cell and a note describing how to rerun Goal Seek. Test: recalculating the
exported file (LibreOffice headless in the existing export test pattern, if one exists; otherwise
formula-string assertions) reproduces engine numbers.

## 12. Screens

1. Source: choose Buyout or Merger. Merger shows two pickers (Acquirer, Target), each the
   existing search/import (EDGAR, ESEF, manual). Either side may be manual. Step unlocks when both
   are loaded.
2. Clean: Acquirer | Target switch over the existing Clean screen, plus the Alignment panel and
   the dilutive securities table. A side-by-side summary strip (revenue, EBITDA, net debt, shares,
   market value) before and after cleaning.
3. Assumptions: sections in this order: Deal terms (price, premium, mix) with a live sources and
   uses panel; Financing (reuse DebtTable; leverage cap); Purchase accounting; Standalone
   forecasts (two HistoryTable-style grids, history then empty forecast cells with suggestions);
   Synergies (run-rate, phasing row, cost to achieve); Combined policy (dividends, buybacks,
   repayment); Valuation (optional). Same keyboard model and badges as today.
4. Results: Summary (accretion by year, leverage, ownership, premium, goodwill, value created);
   Five-block statements (the reference view, toggled P&L / cash flow / debt); Accretion bridge
   waterfall (standalone EPS -> target earnings -> synergies -> financing cost -> amortisation
   -> new shares -> combined EPS; reuse `ui/Waterfall.tsx`); Purchase accounting and opening
   balance sheet; Credit; Value and contribution; Sensitivities; trace drawer on every figure.

The assistant, command palette, library, cases and versions must work for merger deals (they
key off stores: wire them to the merger store through the deal-type discriminator).

## 13. Build order (each phase is one PR, gates = vitest + build green, LBO goldens untouched)

- Phase 0, groundwork (no behaviour change): shared store helpers extracted; CleanScreen takes
  props; `dealType` in session/workspace with round-trip tests; reference workbook committed.
- Phase 1, SPEC + GM1 kernel: write SPEC sections from §7 here (changelog entry, version bump);
  `merger/types.ts`, standalone, sourcesUses (no PPA), adjustments, combine, financing, accretion,
  credit with the sizing solve, check, facade. GM1 green on every pinned cell. Invariants 1 to 3,
  7 to 14. Manual-entry only; no UI.
- Phase 2, the real model: consideration with diluted shares and mix, PPA and opening balance
  sheet, fees by treatment, synergy phasing and cost to achieve, multi-tranche debt with
  amortisation and sweep, partial-year close, forecast balance sheet, adjusted EPS, break-evens.
  GM2 and GM3 green; invariants 4 to 6; mutants.
- Phase 3, data: commit the tag-check script (fetch companyfacts for a list of CIKs, print
  which chain member each filer uses and its latest year; generic User-Agent, no personal
  details), new line ids and tags in all three mappers, quote and diluted shares, the
  merger facts adapter, alignment (calendarisation, FX, GAAP check). GM4 and frozen fixtures.
- Phase 4, UI: merger store, the four screens, suggestions catalogue entries, SSR smoke tests
  in the style of `tests/edgar-screens-smoke.test.tsx` and `engine2-workbench-smoke.test.tsx`.
- Phase 5, value, sensitivities, cases, workbook export, assistant briefs, one-page summary.
- Phase 6, out-of-sample check against one real closed deal's published pro forma; adversarial
  review of the SPEC sections under the repo's bounded sign-off rule.

Phase 1 is deliberately the professor's model end to end in the engine: it proves the five-block
law and the solve before any complexity is added, and gives something demonstrable early.

## 14. Traps (known in advance)

- The 2023A column in the reference is NOT a cash year: its impact cash is discarded. Model it
  as `pro_forma_year0` with `year0_cash_carried: false`, not as a normal period.
- Reference dividends for the impact block depend on TARGET net income, not just impact income.
- Reference tax on the Sum block is the sum of amounts at two rates; never apply a blended rate.
- Sum-block shares are the acquirer's only. Do not add target shares.
- Accretion compares against ACQUIRER standalone EPS including its own planned buybacks.
- Treasury stock method at the offer price, not the current price; convertibles that convert
  must leave net debt, or the equity bridge double counts.
- Goodwill uses the equity purchase price, never EV; refinanced debt is a use of funds, not
  purchase consideration.
- Advisory fees are expensed (not capitalised into goodwill) under both US GAAP and IFRS;
  financing fees are capitalised against the debt. The reference does neither.
- Book amortisation of acquired intangibles is not cash-tax deductible in a stock purchase; the
  DTL unwind is what keeps the effective rate sensible. Getting this wrong shows as a balance
  sheet that drifts by the tax effect each year (invariant 4 catches it).
- New debt interest on beginning balances: with a mid-year close the "beginning" balance of
  year 1 is the close balance, accrued for the owned fraction.
- Do not let the leverage solve run inside React render or per keystroke: solve on Build.
- User-visible strings: "Transaction impact", "Combined", "Acquirer", "Target". No em dashes.

## 15. Owner decisions needed (recommended default in brackets; none blocks Phase 0 or 1)

1. Name on the UI: "Merger" or "M&A" [Merger model].
2. Engine sign convention for merger typed fields. DECIDED IN PHASE 1 (SPEC §29.1), against the
   earlier recommendation: merger amounts are SIGNED as in a statement, because that makes the
   five-block law a plain element-wise sum for every line. The owner can still overrule.
3. Forecast source: analyst inputs with history-based suggestions only [yes; no consensus feed].
4. Partial vs full goodwill when the target has minorities [partial, NCI at book].
5. Combined-company tax losses in v1 [flat rate with a flag; tax-state machine later].
6. Out-of-sample deal for Phase 6 [owner picks a closed US deal with an S-4 pro forma].
