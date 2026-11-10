# Normalisation ("Clean") step, flow redesign and suite shell — build plan

Written 2026-11-10 against PR #126 (SPEC v2.4.0), which has since merged to `main`.

## Status (2026-11-10, branch `claude/lbo-data-cleaning-ea3760`, on `main` @ 3302b48)

**Built and tested** (LibreOffice parity suite included; `tsc` and `npm run build` clean):

- Phase 1 — `lib/statements/` (pack from every route, widened on EDGAR us-gaap; detected
  candidates from a committed us-gaap tag list). Defects D1–D7 fixed.
- Phase 2 — `lib/cleaning/` (ledger, `applyCleaning`, checks C1–C8, pure edit helpers),
  `store/cleaning.ts`, `engine2Model.applyCleaned`. Arithmetic mutants each turn the suite red.
- Phase 3/4 — routes `/deal-engine/lbo/{source,clean,assumptions,results}`, shell, stepper,
  design tokens, the Clean screen. The Assumptions screen and detail tabs are restyled
  (readable type, card sections, sticky Build bar) but keep their old structure.
- Phase 5 — the Normalisation sheet; Inputs sizing revenue/EBITDA reference it; four cleaning
  deals in the parity suite; an edit made in Excel is recalculated and compared with the engine.
- Phase 6 — Results (KPIs, operating and debt charts, value bridge, IRR sensitivity, both
  bridges, what the sellers receive, export).
- Phase 7 — **SPEC §27** (v2.5.0): each EBITDA add-back STOPS or CONTINUES, a required choice;
  a continuing one is in the price basis and not in the forecast margin base. Implemented at the
  data layer and the workbook; **not yet through an independent sign-off round**.
- Persistence — `store/session.ts`: inputs are kept in localStorage and everything derived is
  rebuilt on restore.
- A frozen real filing (Hasbro, `tests/edgar-frozen-hasbro`) with hand-worked figures. It
  drove three data-layer fixes: alias chains resolve per period (a switched cash tag had been
  read as no cash), the balance-sheet window reaches back in periods not years, and the
  revenue tag order is pinned with its reason.
- Dev: `vite.config.ts` serves `/api/edgar` from the deployed handler, so filing imports work
  under `npm run dev`.
- Trading anchor on the adjusted basis, with the reported multiple beside it (§11).

**Not built:**

- **§8 AI read of the filing** for adjustments. It needs a filing-document route in the proxy
  and cannot be verified without a key.
- **IFRS candidates**: none are proposed — the ifrs-full tag names have not been verified
  against the taxonomy, and the IFRS routes do not pass their payload to the pack widening.
- **A structural redesign of the Assumptions screen** (it is restyled, not re-laid-out).
- The lease choice, the Clean-step exit and the AI header control follow the plan's
  recommendation; the owner never answered those three questions explicitly.

This plan implements `rebuild/V2_BACKLOG.md` item 5 (the 10-K reconciliation bridges) and widens
it into a proper step in the product flow. It supersedes that item's four bullets.

Owner rules that bind every line of this work (unchanged from the backlog):

1. Nothing is pre-filled or invented. A blank is a blank; it gates the next step, it is never 0.
2. Proposals are applied only on an explicit click, and each carries its basis.
3. One engine. The UI and the Excel model show the same numbers, held by the LibreOffice parity suite.
4. If a standard exists it is a rule; otherwise it is a visible choice. No silent clamps or thresholds.
5. No user tracking. Everything a user enters stays in the browser.

---

## 1. What is being built, in one paragraph

Today the flow is `source → assumptions → build`, and the sourced figures go straight into the
model. An analyst never does that: they first decide what EBITDA and net debt *mean* for this
company. The new flow is **Source → Clean → Assumptions → Results**, where Clean shows the
sourced statements with links to the filing, lets the analyst restate cells, add itemised
adjustments, and build an EBITDA bridge and a net-debt bridge. The cleaned figures then feed the
existing engine unchanged, and the bridges are exported to Excel as live formulas.

## 2. Architecture: cleaning is a pure layer in front of the engine

```
mappers (EDGAR / ESEF / upload / manual)
   └─► RawHistoricals + StatementPack        as sourced, immutable once imported
            │
            ▼
        CleaningLedger                        the analyst's work: overrides, adjustments, bridge items
            │   applyCleaning(raw, pack, ledger)   — pure, no I/O, no defaults
            ▼
        CleanedHistoricals                    same shape as RawHistoricals + the two bridges
            │   adaptRawHistoricals (existing, unchanged)
            ▼
        DealFacts ─► engine2 (unchanged)
```

Why this shape:

- **The engine and its 14 goldens are not touched.** The engine reads `facts.fy_ebitda`,
  `fy_ebitda_margin`, `fy_revenue`, the ratio seeds and `history`. Cleaning only changes what
  those facts contain.
- **Identity test is trivial and strong:** an empty ledger must return an output that deep-equals
  the input. Every existing test keeps passing with no edits.
- **It is model-agnostic.** An M&A model needs two cleaned companies. The same layer serves both,
  which is the real justification for building it properly now.
- **The sourced data is never mutated.** "Reset to as-reported" is always one click, and every
  screen can show reported and adjusted side by side.

New code lives in `lib/statements/` (the pack) and `lib/cleaning/` (ledger, apply, checks).
Neither imports from `lib/engine2/`, and `lib/engine2/` imports from neither.

### 2.1 What net debt does and does not do (read before designing the bridge)

The engine is EV-driven: `uses = EV + fees + min cash`, with `EV = multiple × EBITDA`.
`facts.net_debt` is read by **no engine arithmetic** — only by the trading anchor and display.
So the two bridges are not symmetric:

- The **EBITDA bridge moves the model**: price, leverage capacity, margin base, growth history.
- The **net-debt bridge moves what the sellers receive**, not the sponsor's returns:
  `implied equity value = EV − adjusted net debt`. For a take-private that is the number that
  matters (implied price per share and premium), and today the product does not show it.

So the net-debt bridge ships with a small display block — implied equity value, and per share and
premium where a share count and quote exist (`lib/edgar/quote.ts` already fetches both for
domestic 10-K filers). Display only, no engine change. State this plainly in the UI so nobody
expects adding a pension deficit to change the IRR.

## 3. Phase 1 — widen what is sourced (`lib/statements/`)

The mappers extract one anchor year of scalars plus a three-line history (revenue, EBITDA,
capex). That is not enough to clean anything. Add a `StatementPack`, produced beside the existing
`RawHistoricals` by each mapper. Do not change the fields `RawHistoricals` already has.

```ts
type PeriodKey = string;                    // FY period END date 'YYYY-MM-DD', or 'LTM'
interface Period { key: PeriodKey; kind: 'FY' | 'LTM'; end: string; start: string | null }
interface Cell   { value: number | null; provenance: Provenance | null }   // null stays null
interface StatementPack {
  periods: Period[];                        // ascending; up to 5 FY, plus LTM when the stitch succeeded
  lines: Partial<Record<LineId, Record<PeriodKey, Cell>>>;
  candidates: AdjustmentCandidate[];        // §3.2 — detected, never applied
  notes: string[];
}
```

`LineId` (v1, fixed list):

- Income statement: `revenue, cogs, gross_profit, sga, rnd, operating_income, da, interest_expense,
  pretax_income, tax_expense, net_income`
- Cash flow: `cfo, capex, sbc, acquisitions`
- Balance sheet: `cash, st_investments, receivables, inventory, payables, debt_current,
  debt_noncurrent, finance_lease_liab, operating_lease_liab, pension_deficit, nci, preferred,
  net_ppe, goodwill, total_equity`

Rules:

- Reuse `lib/edgar/history.ts` (`HistorySeries`: per-period alias resolution, restatement dedup,
  end-date keying, stub exclusion). Do not write a second period resolver.
- A subtotal is shown only when the filing tags it, or when every component resolves. No plugs.
- Each cell keeps its tag, form, accession and URL so the UI can link to the filing.
- EDGAR us-gaap first (richest). `mapCompanyFactsIfrs`, `mapIfrs` (ESEF) and `ixbrl.ts` fill what
  they can; lines they cannot resolve are absent, and the grid shows "not tagged in this filing".
- Manual route: `ManualFactsInput.years` becomes the pack directly, so manual deals get the same
  Clean screen. The manual screen's own grid can later be replaced by an editable pack.
- **LTM:** when `raw.basis === 'LTM'`, the pack carries an `LTM` period for the lines the stitch
  covers. Adjustments for the sizing period are then entered in the LTM column.

### 3.1 Data-layer defects to fix in this phase

Found while reading the PR #126 data layer. The engine has been through adversarial review;
`lib/edgar/` has not had the same treatment, and these break the owner rules:

| # | Where | Defect | Fix |
|---|---|---|---|
| D1 | `mapXbrl.ts:604`, `mapCompanyFactsIfrs.ts:185`, `mapIfrs.ts:436` | Effective tax rate is silently clamped to [0, 60%] and still badged as a filing fact. A loss-year or a 75% rate becomes 0% or 60% "from the filing". | Emit the true ratio, or null with a note when pretax income ≤ 0. Never clamp. |
| D2 | `mapXbrl.ts` net-debt block | With no cash fact, net debt = gross debt − 0, labelled "(no cash reported)". A silent zero. The manual route correctly treats the same case as a gap. | Missing cash ⇒ net debt is a gap, as on the manual route. |
| D3 | `suggest.ts:73,123` | `largeCap = fy_ebitda >= 100` ignores currency. ¥100m or ₹100m of EBITDA is classed large-cap and offered the US buyout median multiple and TLB terms. | Scope the size band and the US conventions to USD (as `s163j` already is); other currencies get no proposal until a cited regional source exists. |
| D4 | `mapXbrl.ts` D&A aliases | Two aliases (`…AndAmortizationOfDeferredCharges`, `DepreciationAmortizationAndAccretionNet`) include financing-cost amortisation or accretion, which overstates EBITDA = operating income + D&A. No flag. | Keep the alias, add a note on the cell, and surface it as a cleaning check (§5 C5). |
| D5 | `mapXbrl.ts` `includeFinanceLeasesInDebt ?? true`, `mapIfrs.ts` `includeLeasesInDebt ?? true` | Lease treatment is a policy baked into extraction, and it differs by GAAP (US: finance leases only; IFRS: all IFRS 16 leases). | Extraction reports borrowings and each lease liability as separate pack lines. Whether leases are debt becomes a net-debt bridge choice (§4.3). `raw.gross_debt` keeps today's composition so nothing downstream moves until the analyst chooses. |
| D6 | all three mappers | A statutory 21% / 25% rate is still generated with `source: 'default'`, then discarded by the adapter. Dead code; comments in `buildModel.ts` and `factsAdapter.ts` still describe it as used. | Delete the generation, the `statutoryTaxRate` option, `templateBases['tax.rate']` and the stale comments. |
| D7 | `factsAdapter.ts` | `operating_nwc: null` in every history row ("a D-follow-up"). | The pack now has receivables, inventory and payables per year; derive operating NWC history where all three resolve. |

Each fix gets a test that fails before it. D1–D3 change what a user sees today, so list them in
the PR description.

### 3.2 Detected adjustment candidates (deterministic — no AI)

`companyfacts` returns every tag a company has filed. Scan a fixed, committed list of tags that
usually mark non-recurring or non-cash items, and emit a candidate for each non-zero value in a
pack period:

- us-gaap: `RestructuringCharges`, `RestructuringCostsAndAssetImpairmentCharges`,
  `AssetImpairmentCharges`, `GoodwillImpairmentLoss`,
  `ImpairmentOfIntangibleAssetsExcludingGoodwill`, `ShareBasedCompensation`,
  `BusinessCombinationAcquisitionRelatedCosts`, `LitigationSettlementExpense`,
  `GainLossOnDispositionOfAssets1`, `GainLossOnSaleOfBusiness`, `InventoryWriteDown`
- ifrs-full equivalents where they exist (verify each name against the taxonomy before committing)
- Balance sheet, for the net-debt bridge: operating and finance lease liabilities, pension
  deficit, contingent consideration, NCI, preferred, restricted cash

A candidate carries the tag, the amount per period, the filing link, and a fixed caveat string
where the tag is often reported **below** operating income (disposal gains) — adding back an item
that is not inside operating income would be wrong, and XBRL cannot tell which it is. The analyst
confirms. Candidates are never applied automatically and never pre-ticked.

The tag list is a committed data file with one line of rationale per tag, tested the same way as
`conventions.json`.

## 4. Phase 2 — the cleaning core (`lib/cleaning/`)

### 4.1 The ledger

```ts
interface CleaningLedger {
  version: 1;
  overrides: Override[];
  adjustments: Adjustment[];
  net_debt_items: NetDebtItem[];
  choices: { leases_in_net_debt: 'none' | 'finance' | 'all' | null };   // null = not yet chosen
  as_reported: boolean;   // true = the analyst explicitly chose "use as reported"
}

interface Override {            // restate ONE sourced cell
  id: string; line: LineId; period: PeriodKey;
  value: number; reason: string;                 // reason is required, non-empty
}

interface Adjustment {          // an itemised bridge row on one line
  id: string;
  target: 'ebitda' | 'revenue' | 'capex' | 'da' | 'nwc';
  label: string;
  category: 'non_recurring' | 'restructuring' | 'impairment' | 'sbc' | 'transaction_costs'
          | 'litigation' | 'pro_forma' | 'run_rate' | 'accounting_policy' | 'other';
  amounts: Record<PeriodKey, number | null>;     // signed; + increases the target line. null = not entered
  forecast: 'gone' | 'continues' | null;         // EBITDA only — §4.4. null = not yet chosen
  source: { kind: 'filing'; tag: string; url?: string } | { kind: 'user' } | { kind: 'ai'; quote: string };
  note: string;
  included: boolean;                             // un-tick without deleting
}

interface NetDebtItem {
  id: string; side: 'debt_like' | 'cash_like';
  label: string;
  category: 'lease' | 'pension' | 'earn_out' | 'deferred_consideration' | 'nci' | 'preferred'
          | 'restricted_cash' | 'trapped_cash' | 'other';
  amount: number | null;                         // at the anchor balance-sheet date, signed
  source: Adjustment['source']; note: string; included: boolean;
}
```

Categories are labels for grouping and for the Excel export. **No category changes any
arithmetic.** That keeps the layer as subjective as the analyst wants without hidden rules.

### 4.2 `applyCleaning` — the arithmetic

Per period `p`, in this order:

1. Start from the pack. Apply overrides: the cell takes the override value; provenance becomes
   `user` with detail `"restated from <old> — <reason>"`.
2. Re-derive dependents from the overridden cells with the same formulas the mappers use:
   `reported EBITDA = operating_income + da`.
3. `adjusted[target][p] = reported[target][p] + Σ amounts[p]` over included adjustments on that target.
4. Anchor ratios from adjusted figures at the anchor FY: `da_pct_revenue`, `capex_pct_revenue`,
   `nwc_pct_revenue`. (They stay FY-basis even when sizing is LTM — SPEC §1.1.)
5. Sizing pair at the sizing period (FY or LTM): `fy_revenue`, `fy_ebitda` = adjusted.
6. `history` = adjusted revenue / EBITDA / capex / NWC per year.
7. Net debt at the anchor date:
   `adjusted net debt = borrowings + leases per choices.leases_in_net_debt + Σ debt_like − (cash + Σ cash_like)`.
   Trapped or restricted cash is a negative cash-like item.

**Blank handling (rule 1).** An included adjustment with a null amount in a period makes the
adjusted figure for that period null — shown as "—" with the reason. The UI offers one click,
"nil in the other years", which writes explicit zeros. The sizing-period amount must be entered
for the step to complete. A period is never silently treated as zero.

**Provenance.** Add `'adjusted'` to `ProvenanceSource`. Detail reads
`"reported 380.0 + 3 adjustments (+32.0)"`. `BasisBadge` gets a matching kind. The governance
test `governance-display-surface` must be extended, not allowlisted.

**Output.** `CleanedHistoricals` = a `RawHistoricals` (so the adapter is untouched) plus:

```ts
bridges: {
  ebitda: { period: PeriodKey; reported: number | null; rows: {...}[]; adjusted: number | null }[];
  net_debt: { reported_debt; lease_rows; debt_like_rows; cash; cash_like_rows; adjusted } | null;
}
```

`DealFacts` gains two optional display-only fields, `reported_ebitda` and `ebitda_bridge` /
`net_debt_bridge`, so the workbook builder and Results tab can render them. The engine never
reads them; assert that in `engine2-boundary.test.ts`.

### 4.3 Leases — a required choice, with a consistency check

Lease treatment is the most common net-debt disagreement and it must match the EBITDA basis:

- US GAAP: operating-lease cost sits in opex, so EBITDA is after rent. Counting operating-lease
  liabilities as debt without adding rent back double-counts.
- IFRS 16: lease cost is depreciation and interest, so EBITDA is before rent. Leaving lease
  liabilities out of debt understates leverage.

`choices.leases_in_net_debt` starts null. The screen states which basis the filing's EBITDA is
on and offers the three options; the check in §5 C1 fires on an inconsistent pair. No default.

### 4.4 Do add-backs turn into cash? — the one real engine question

The engine forecasts `EBITDA = revenue × margin` from `fy_ebitda_margin`, and
`FCF = EBITDA − tax − capex − ΔNWC`. If every add-back raises the margin base, then adding back
SBC or unrealised synergies also raises forecast cash flow — which is wrong when the cost keeps
being paid. Lenders and sponsors price on adjusted EBITDA but underwrite on cash.

**Recommended design (needs owner sign-off, then a SPEC amendment):** each EBITDA adjustment
carries `forecast: 'gone' | 'continues'`, a required choice with no default.

- `gone` — the cost will not recur (a one-off restructuring charge). It raises both the sizing
  EBITDA and the forecast margin base.
- `continues` — the item is excluded for valuation only (SBC that becomes cash comp, a pro-forma
  saving not yet achieved). It raises the sizing EBITDA but **not** the margin base.

Mechanically: `fy_ebitda` = fully adjusted; `fy_ebitda_margin` = (adjusted − Σ `continues`
amounts) ÷ revenue. The engine already reads these as two separate facts, so no engine code
changes — but SPEC line 148 and the adapter define the margin as `fy_ebitda ÷ fy_revenue`, so
this is a **new SPEC section (§27)** with: the definition, the consequence (entry leverage is on
adjusted EBITDA while year-1 forecast EBITDA starts from the cash base), a disclosure row in
`disclosures.ts`, a coherence WARN when the two bases differ, and a golden. Until §27 is signed,
ship with every adjustment forced to `gone` and a visible note; do not ship a toggle that does
nothing.

### 4.5 Tests

- Identity: empty ledger ⇒ `applyCleaning` output deep-equals the input, for every existing fixture.
- Property (fast-check or hand-rolled): adjusted = reported + Σ included; toggling `included`
  off equals deleting the row; order of rows never matters; an override then its removal is identity.
- Blank propagation: one null amount ⇒ that period's adjusted figure is null, others unaffected.
- Three fixtures from **frozen** `companyfacts` JSON snapshots (one clean US filer, one with
  restructuring + impairment, one IFRS 20-F filer). Expected bridges are derived by hand in a
  committed worksheet, then compared — same discipline as the goldens. Do not fetch live in tests.
- Mutants: drop a sign, skip an override's re-derivation, treat null as 0, swap FY/LTM column.
  Each must turn the suite red.

## 5. Cleaning checks (shown on the Clean screen, never blocking unless stated)

No numeric thresholds — a threshold would be a hardcode. Where magnitude matters, show the number.

| # | Check | Severity |
|---|---|---|
| C1 | Lease choice inconsistent with the EBITDA basis (§4.3) | WARN |
| C2 | Adjustments as a share of reported EBITDA — always displayed as a figure, never judged | INFO |
| C3 | A filing-sourced candidate whose tag is often below operating income was accepted | WARN, cleared by a tick "confirmed inside operating income" |
| C4 | Bridge identity: reported + Σ rows = adjusted, per period | BLOCK (a bug, never user-reachable) |
| C5 | D&A came from an alias that includes financing-cost amortisation (D4) | WARN |
| C6 | Sizing is LTM but an adjustment has no LTM amount | BLOCK for the step |
| C7 | An override moves a cell that a derived subtotal in the filing contradicts (e.g. restated revenue ≠ gross profit + COGS as tagged) | WARN |
| C8 | Adjusted EBITDA ≤ 0 | WARN (the engine already rejects an FY-basis multiple on EBITDA ≤ 0 — say so here, early) |

Checks are a pure function `cleaningChecks(pack, ledger, cleaned)` returning the same
`{code, severity, message}` shape as `output.coherence`, so one component renders both.

## 6. Phase 3 — flow, shell and the Clean screen

### 6.1 Flow and routing

Routes (the SPA rewrite in `vercel.json` already covers them):

```
/deal-engine                     suite hub — pick a model
/deal-engine/lbo/source          1 Source
/deal-engine/lbo/clean           2 Clean
/deal-engine/lbo/assumptions     3 Assumptions
/deal-engine/lbo/results         4 Results  (Export lives here)
```

A persistent stepper shows the four steps and their state (done / current / blocked, with the
count of blanks). A step cannot be opened until the one before it is complete; going back is
always allowed. Deep-linking to a later step with no data redirects to Source.

Staleness: any edit on Clean or Assumptions after a build clears `output` (the existing rule —
outputs never render stale) and the Results step shows "Rebuild". Editing the ledger must **not**
wipe the assumptions: add a store action `applyLedger` that swaps `facts` and re-computes the
suggestion catalogue, and keeps `assumptions`, `pending` and `basis`. Only a new import resets.
Accepted suggestions whose basis was a filing ratio (e.g. margin) keep their value but their
badge gains "based on the earlier figures — re-suggest?".

Store: add `store/cleaning.ts` holding `pack`, `raw`, `ledger`. `engine2Model.importFromRaw`
is then called with the cleaned historicals. Persist `ledger` + `assumptions` to `localStorage`
keyed by entity + period end, and offer "Save deal (.json)" / "Open deal" — the v2 flow appears
to have no deal save today (confirm before building). Local only; nothing leaves the browser.

### 6.2 The Clean screen

Wide layout (the current workbench is a single 768px column of 9–10px mono text). Three zones:

**A. Statements (main, ~60% width).** Tabs: Income statement · Balance sheet · Cash flow.
Years as columns, most recent on the right, plus LTM when it exists. Under each adjustable line,
the adjusted figure sits directly beneath the reported one. Hover a cell: XBRL tag, form, filing
date, "open in filing ↗". Click a cell: restate it (value + required reason). A restated cell
shows a mark and its old value on hover. Lines the filing does not tag render "not tagged", never 0.

**B. Bridges (right rail, sticky).** EBITDA bridge for the sizing period as a waterfall:
Reported → each adjustment → Adjusted, with a year switcher. Net-debt bridge beneath:
borrowings → leases (per the choice) → debt-like → less cash and cash-like → adjusted net debt,
then implied equity value (§2.1). Each row has an include tick, an edit and a delete.

**C. Proposals (below the statements).** "Found in the filing" — the §3.2 candidates as rows:
label, amount per year, the tag, the caveat, **Add to bridge** / **Dismiss**. Then
"+ Add adjustment" for free-form rows. With an AI key, a third group appears (§8).

**Impact strip (top, always visible):** adjusted EBITDA and the change vs reported, adjusted
margin, adjusted net debt, and the count of open choices. This is what makes the step feel
worth doing.

**Leaving the step:** two buttons. "Continue with adjusted figures →" (disabled while a sizing
amount, a `forecast` choice or the lease choice is open — each listed by name), and "Use the
figures as reported →", which sets `ledger.as_reported = true`. That choice is recorded on the
Methodology tab and in the Excel model so a reader knows no normalisation was applied.

### 6.3 UI foundations (do this before any screen)

The current tree styles everything inline with literal hex and sizes, shows raw field paths to
the user (`fy_ebitda`, `nwc_pct_revenue` in the missing-facts bar), and uses `alert()`.

- `components/deal-engine/ui/`: `tokens.ts` (colour, type scale, spacing — keep the existing
  paper `#F9F9F7`, ink `#111`, accent `#CC0000`), `Stepper`, `FinTable` (sticky first column,
  tabular numerals, negatives in parentheses, total rules, row grouping), `Field`, `Badge`,
  `Card`, `Kpi`, `Waterfall`, `Heatmap`, `Callout`, `Dialog`.
- Body text ≥ 13px; table figures 13px tabular; labels ≥ 11px. Mono for figures only, a
  proportional face for prose and labels.
- Every field path shown to a user goes through a label map (one file, tested for coverage
  against `draft.ts` paths). No raw paths on screen.
- No inline hex in new components; add a lint test in the style of the governance tests.
- Keyboard: tab order through grids, Enter to commit, Esc to cancel. Screen width 1280–1440
  primary; the Clean screen degrades to stacked zones under 1024.
- Charts with `recharts` (already a dependency). No new UI library.

### 6.4 Results screen

Same engine output, presented as a results page rather than a tab strip under the inputs:

- Header: company, sizing basis and date, and four KPIs — sponsor IRR, MOIC, equity cheque,
  entry leverage — with "N/M" handling from `headlineNotMeaningful` unchanged.
- A primary **Export Excel model** button, top right, always visible. Memo and redline beside it.
- First view, four charts: value-creation bridge (waterfall), debt paydown by tranche (stacked),
  revenue and EBITDA with margin (history + forecast, adjusted vs reported in the history),
  sensitivity heatmap.
- The existing eleven tabs stay as the detail view, re-skinned with `FinTable`. Add a
  **Normalisation** tab showing both bridges exactly as exported.
- Coherence flags move to one panel with severity, not a strip of 10px text.

Display code must keep reading from `output` only; `governance-display-surface.test.ts` already
enforces that.

## 7. Phase 4 — Excel

The export is the product. In `lib/engine2/workbook.ts`:

- New sheet **Normalisation**, between Inputs and Model. Reported lines per year as blue inputs,
  each with a cell comment carrying the XBRL tag and filing URL. One row per adjustment (label,
  category, note, amount per year — blue). Adjusted EBITDA per year as a formula. The net-debt
  bridge the same way. Overridden cells show the restated value with the original in the comment.
- The Model's entry EBITDA, margin base and history cells **reference** the Normalisation sheet.
  Today they are Inputs hardcodes; after this change an analyst can add a row in Excel and the
  whole model moves. That is the feature.
- Checks sheet gains the bridge identities (C4) for each year.
- Summary gains reported vs adjusted EBITDA, and implied equity value.
- With `as_reported`, the sheet still exists with zero adjustment rows and a one-line statement.

Parity: add cleaning deals to `tests/engine2-workbook-parity.test.ts` (no adjustments; several
across categories; an override; LTM sizing; `continues` rows once §27 exists). Every mapped
cell equals the engine after LibreOffice recalculation. Mutants: delete one adjustment row's
term from the sum, point the Model at reported instead of adjusted — both must go red.

## 8. AI — optional, never a gate

Everything above runs with no key. With a key, one addition in the proposal list:

- **"Read the filing for adjustments."** Fetch the filing's non-GAAP reconciliation and the
  MD&A (via the existing `api/edgar` proxy), ask the model for candidate adjustments, and show
  each as a proposal with the **quoted sentence** it came from and the filing link. Same
  discipline as `lib/ai2/suggest.ts`: proposals only, nothing applied, an amount the model
  cannot tie to a quote is dropped. A useful by-product is the company's own adjusted EBITDA as
  a reference line next to the analyst's.

Do **not** put an "AI or no AI" decision screen at the front of the suite. It asks for a
commitment before the user has seen any value, and most visitors will not have a key. Keep what
exists — features visibly off without a key — and move the key into a header control
("AI: off · add key") available on every step.

## 9. Suite shell and M&A — VOID (owner decision 2026-11-10: M&A left out; see §11)

- `/deal-engine` becomes a small hub: LBO (live), Merger model (in build). The value of the hub
  is that Source and Clean are shared, so say that on the page.
- **Do not build the M&A model this week.** It is a new engine: purchase price allocation,
  financing mix, accretion/dilution, synergy phasing, pro-forma balance sheet. At this repo's bar
  it needs its own SPEC sections, goldens from a reference workbook, a challenger and a formula
  workbook with parity. The deliverable this week is `rebuild/MA_SPEC_BRIEF.md` — inputs, outputs,
  conventions to research, and the golden source — so it can start cleanly afterwards.
- Skip a standalone DCF. The flow-to-equity valuation tab in #126 already covers the ground.

## 10. Build order

Each phase is one PR, green on `npm test`, `tsc` and `npm run build`, checked in the browser.

| # | Phase | Contains | Done when |
|---|---|---|---|
| 0 | Prep | #126 merged. Backlog item 5 points at this file. The 5-hour autonomous routine is paused or re-pointed, or it will start item 5 on its own. | One branch owns this work |
| 1 | Data | `lib/statements/`, pack from all four routes, candidates, fixes D1–D7 | Three frozen-filing fixtures match hand-derived packs; identity holds |
| 2 | Core | `lib/cleaning/` ledger, `applyCleaning`, checks, store wiring, `applyLedger` | §4.5 tests and mutants; existing 878 tests untouched and green |
| 3 | UI kit + flow | tokens, primitives, routes, stepper, label map | The existing screens run inside the new shell with no behaviour change |
| 4 | Clean screen | §6.2 in full | A US filer can be sourced, cleaned and built end to end in the browser |
| 5 | Excel | Normalisation sheet, references, parity deals, mutants | LibreOffice parity green; changing an adjustment in Excel moves the IRR |
| 6 | Results | §6.4 | Charts and tabs read only `output` |
| 7 | §27 | The `continues` treatment: SPEC, golden, disclosure, UI choice enabled | Signed spec section; golden matches |
| 8 | Hub + AI read | `/deal-engine` hub, header key control, §8, `MA_SPEC_BRIEF.md` | — |

Phases 1–2 and phase 3 touch disjoint files and can run in parallel. 4 needs 2 and 3. 5 needs 2.
A realistic week is phases 0–6. Phase 7 depends on the owner decision in §11.

## 11. Owner decisions

Decided 2026-11-10:

- **M&A: left out entirely.** No hub card, no spec brief. §9 is void: `/deal-engine` stays the
  LBO flow, and the routes in §6.1 drop the hub (`/deal-engine` redirects to
  `/deal-engine/lbo/source`). Phase 8 shrinks to the header key control and §8.
- **Base branch: wait for PR #126 to merge, then build on `main`.** Do not branch off the PR branch.
- **Autonomous routine:** `trig_01BHRUyxTy5GJSF711ZhhTao` is disabled (checked 2026-11-10;
  it was already off). Leave it off while this work is in flight.
- **Trading anchor: restate on the adjusted basis, and show the reported multiple beside it.**
  The anchor exists to be compared with the entry multiple, and a multiple is only comparable
  when the EV and the EBITDA describe the same claims and the same earnings on both sides —
  the consistency rule every comps reference states. The entry multiple is on adjusted EBITDA,
  so the anchor is `(market cap + adjusted net debt) ÷ adjusted EBITDA`, recomputed when the
  ledger changes. Reported-basis EBITDA under an adjusted entry multiple would understate the
  premium being paid. The coherence gate reads the adjusted figure; the display shows both,
  each labelled. Market cap is unchanged — it is the observation. The §21 sector comps band is
  external data and is not restated.

Never answered — the build follows the recommendation on 2–4 and ships 1 as `gone`-only:

1. **Add-backs and cash (§4.4).** Adopt the `gone` / `continues` split as SPEC §27? Recommended: yes.
2. **Leases (§4.3).** Confirm lease treatment becomes a required choice with no default, which
   changes what `gross_debt` shows before the analyst chooses for IFRS filers.
3. **Is Clean skippable?** Recommended: always shown, with an explicit "use as reported" exit.
4. **AI gate.** Recommended: no front gate; a header control instead (§8).

## 12. Things the builder must not do

- Do not edit any file under `lib/engine2/kernel/`, or `sequence.ts`, `debt.ts`, `tax.ts`,
  `exit.ts`, `returns.ts`. If cleaning seems to need an engine change, stop — it means §27.
- Do not add a default, a pre-ticked proposal, a numeric threshold or a clamp anywhere.
- Do not let a category change arithmetic.
- Do not allowlist a governance test; extend it.
- Do not fetch from the network in tests.
- Do not add analytics, cookies or any call that sends user-entered figures off the device.
