/**
 * Provenance + factual-historicals types (Phase 1). Every value the import flow surfaces
 * carries WHERE it came from, so the assumptions-review screen can show a source badge/link
 * for each field and nothing is ever silently assumed.
 */

/** Who produced a value. Drives the provenance badge on screens 2 and 3.
 *  `'missing'` = a factual field the filing genuinely lacks: it is rendered as an EMPTY input
 *  with a red MISSING badge and is NEVER given a guessed default or tagged 'user' (which would
 *  falsely imply the user typed it). It appears only in the draft's `ProvenanceMap`, never inside
 *  a `RawHistoricals` (those stay null + recorded in `gaps`). Once the user fills it, the store
 *  flips the source to 'user'. */
export type ProvenanceSource = 'edgar' | 'esef' | 'ai' | 'user' | 'default' | 'missing';

export interface Provenance {
  source: ProvenanceSource;
  /** Human-readable basis, e.g. "us-gaap:Revenues · FY2023 · 10-K". */
  detail: string;
  /** Link to the underlying filing document (EDGAR) or reference, when available. */
  url?: string;
  // ── EDGAR/XBRL specifics (present when source === 'edgar') ──
  tag?: string;          // XBRL concept, e.g. RevenueFromContractWithCustomerExcludingAssessedTax
  taxonomy?: string;     // us-gaap | dei | ifrs-full
  unit?: string;         // USD, shares, …
  fy?: number;           // fiscal year
  fp?: string;           // fiscal period (FY, Q1…Q4)
  form?: string;         // 10-K, 20-F, …
  accession?: string;
  filed?: string;        // filing date
  period?: string;       // period end the value is for (YYYY-MM-DD)
}

/** A factual figure with its provenance. `value` is in the reporting currency's base units. */
export interface SourcedValue {
  value: number;
  provenance: Provenance;
}

/**
 * Factual historicals extracted from filings (or entered by the user where filings are silent).
 * Each field is nullable — a missing factual input is recorded in `gaps`, never defaulted
 * silently. Monetary values are in MILLIONS of `currency` (the engine's unit), already scaled
 * from the raw XBRL (which reports absolute units).
 */
export interface RawHistoricals {
  entityName: string;
  cik10?: string;
  currency: string;            // reporting currency (USD for EDGAR)
  /** Fiscal year the headline figures are drawn from, and its period end. */
  fiscalYear?: number;
  periodEnd?: string;
  /** 'FY' (latest annual) or 'LTM' (trailing four quarters) — how flow figures were assembled. */
  basis: 'FY' | 'LTM';

  fy_revenue: SourcedValue | null;          // revenue (£m/$m)
  fy_ebitda: SourcedValue | null;           // EBITDA = operating income + D&A
  ebitda_margin: SourcedValue | null;        // EBITDA / revenue (decimal)
  da: SourcedValue | null;                   // depreciation & amortisation (£m/$m)
  da_pct_revenue: SourcedValue | null;       // D&A / revenue (decimal)
  capex: SourcedValue | null;                // capital expenditure (£m/$m)
  capex_pct_revenue: SourcedValue | null;    // capex / revenue (decimal)
  /** OPERATING NWC (D2): (CA − cash − ST investments) − (CL − current debt − current
   *  finance leases) — one definition feeding BOTH the % method and the days method.
   *  (The old CA − CL figure embedded cash and current debt — retired.) */
  nwc: SourcedValue | null;
  nwc_pct_revenue: SourcedValue | null;      // operating NWC / revenue (decimal)
  /** D2 working-capital days (365 basis) — null when gated (financial SIC, unresolved
   *  components, bundled AP) with the reason in `days_notes`. */
  dso: SourcedValue | null;
  dio: SourcedValue | null;
  dpo: SourcedValue | null;
  cogs: SourcedValue | null;
  days_notes: string[];
  /** D4: gross interest ÷ average gross debt (same assembly both ends) — a banded
   *  [1%, 15%] sanity anchor, emitted only when gross debt > 0.5× EBITDA; suppressed
   *  for financial SICs; approximate (includes non-cash DFC/OID amortization). */
  implied_cost_of_debt?: SourcedValue | null;
  /** D6: the anchor fact's currency when it is OUTSIDE the modelled set — a BLOCKING
   *  badge at Build ("currency SEK not supported"), never a silent USD fallback. */
  currency_unsupported?: string;
  gross_debt: SourcedValue | null;           // total borrowings (£m/$m)
  cash: SourcedValue | null;                 // cash & equivalents (£m/$m)
  net_debt: SourcedValue | null;             // gross debt − cash (£m/$m)
  /** Net PP&E at the anchor period end — seeds the engine2 §8 opening roll. Absent ⇒ null
   *  (the engine seeds 0 WITH its disclosed warning; never a fabricated figure). */
  net_ppe: SourcedValue | null;
  effective_tax_rate: SourcedValue | null;   // tax expense / pretax income (decimal)
  nol_carryforward: SourcedValue | null;     // NOL carryforward (£m/$m)
  sector?: SourcedValue | null;              // SIC-derived sector, when available

  /** Field labels that could NOT be derived from filings — surfaced on Screen 2 for the user
   *  to fill in (provenance then becomes 'user'). Never silently defaulted. */
  gaps: string[];

  /** D1 multi-year annual history (lib/edgar/history.ts): per-period alias resolution,
   *  restatement dedup (latest filed wins, >1% noted), END-date keying, stubs excluded.
   *  Per-cell gaps stay gaps; derived series exist only where every component resolves. */
  history?: {
    revenue: import('./history').HistorySeries;
    operating_income: import('./history').HistorySeries;
    da: import('./history').HistorySeries;
    capex: import('./history').HistorySeries;
    /** operating income + D&A, only at ends where BOTH resolve (no fake totals). */
    ebitda: import('./history').HistorySeries;
  };
}

/** fieldPath → provenance, surfaced as source badges across the assumptions review + model. */
export type ProvenanceMap = Record<string, Provenance>;

/**
 * Provenance for a factual field the filing genuinely does NOT provide. The review screen renders
 * the input EMPTY (no guessed number) with a red MISSING badge; the user fills it (→ 'user').
 * A neutral placeholder may be kept inside `ModelState` only so the live preview can compute — it
 * is never displayed and never tagged 'user'.
 */
export const missingProv = (label: string): Provenance => ({
  source: 'missing',
  detail: `${label}: not reported in the filing — enter to confirm`,
});
