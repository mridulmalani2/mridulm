/**
 * Provenance + factual-historicals types (Phase 1). Every value the import flow surfaces
 * carries WHERE it came from, so the assumptions-review screen can show a source badge/link
 * for each field and nothing is ever silently assumed.
 */

/** Who produced a value. Drives the provenance badge on screens 2 and 3.
 *  'missing' = a factual field the filing did NOT provide — shown empty and flagged for the
 *  user to enter; it is never a guessed value and never falsely attributed to the user. */
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

  ltm_revenue: SourcedValue | null;          // revenue (£m/$m)
  ltm_ebitda: SourcedValue | null;           // EBITDA = operating income + D&A
  ebitda_margin: SourcedValue | null;        // EBITDA / revenue (decimal)
  da: SourcedValue | null;                   // depreciation & amortisation (£m/$m)
  da_pct_revenue: SourcedValue | null;       // D&A / revenue (decimal)
  capex: SourcedValue | null;                // capital expenditure (£m/$m)
  capex_pct_revenue: SourcedValue | null;    // capex / revenue (decimal)
  nwc: SourcedValue | null;                  // net working capital (£m/$m)
  nwc_pct_revenue: SourcedValue | null;      // NWC / revenue (decimal)
  gross_debt: SourcedValue | null;           // total borrowings (£m/$m)
  cash: SourcedValue | null;                 // cash & equivalents (£m/$m)
  net_debt: SourcedValue | null;             // gross debt − cash (£m/$m)
  effective_tax_rate: SourcedValue | null;   // tax expense / pretax income (decimal)
  nol_carryforward: SourcedValue | null;     // NOL carryforward (£m/$m)
  sector?: SourcedValue | null;              // SIC-derived sector, when available

  /** Field labels that could NOT be derived from filings — surfaced on Screen 2 for the user
   *  to fill in (provenance then becomes 'user'). Never silently defaulted. */
  gaps: string[];
}

/** fieldPath → provenance, surfaced as source badges across the assumptions review + model. */
export type ProvenanceMap = Record<string, Provenance>;
