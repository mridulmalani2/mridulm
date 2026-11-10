/**
 * lib/statements/types.ts — the StatementPack: the sourced financial statements, several years
 * wide, that the Clean step works on (rebuild/CLEANING_AND_SUITE_PLAN.md §3).
 *
 * The pack is produced BESIDE the existing RawHistoricals by each import route and is immutable
 * once imported. A cell the filing does not tag is ABSENT (the grid shows "not tagged"); a value
 * is never invented, plugged or zero-filled. Money is in millions of the reporting currency.
 *
 * No imports from lib/engine2 (and lib/engine2 imports nothing from here).
 */
import type { Provenance } from '../edgar/types';

/** A fiscal-year period END date 'YYYY-MM-DD', or the literal 'LTM'. */
export type PeriodKey = string;

export interface Period {
  key: PeriodKey;
  kind: 'FY' | 'LTM';
  /** Period end date. For LTM: the trailing-twelve-months as-of date. */
  end: string;
  start: string | null;
}

export interface Cell {
  value: number;
  provenance: Provenance;
  /** A caveat about how this cell was sourced (e.g. a D&A alias that includes financing costs). */
  note?: string;
}

export type LineId =
  // income statement
  | 'revenue' | 'cogs' | 'gross_profit' | 'sga' | 'rnd' | 'operating_income' | 'da' | 'ebitda'
  | 'interest_expense' | 'pretax_income' | 'tax_expense' | 'net_income'
  // cash flow
  | 'cfo' | 'capex' | 'sbc' | 'acquisitions'
  // balance sheet
  | 'cash' | 'st_investments' | 'receivables' | 'inventory' | 'payables' | 'net_ppe' | 'goodwill'
  | 'total_equity' | 'borrowings' | 'finance_lease_liab' | 'operating_lease_liab' | 'lease_liab';

/** Which accounting framework the EBITDA is stated under — it decides how leases must be treated. */
export type Gaap = 'us-gaap' | 'ifrs' | 'unknown';

/**
 * An item detected in the filing that an analyst would usually consider for the bridges.
 * Detected deterministically from a committed tag list; NEVER applied and never pre-ticked.
 */
export interface AdjustmentCandidate {
  id: string;
  bridge: 'ebitda' | 'net_debt';
  /** net-debt candidates only */
  side?: 'debt_like' | 'cash_like';
  label: string;
  category: string;
  tag: string;
  taxonomy: string;
  /** Bridge-signed amounts (EBITDA: + raises EBITDA; net debt: the item's magnitude), per period. */
  amounts: Record<PeriodKey, number>;
  /** Why this tag is on the list. */
  rationale: string;
  /** Set when the tag is often reported outside operating income — the analyst must confirm. */
  caveat: string | null;
  url?: string;
}

export interface StatementPack {
  entityName: string;
  currency: string;
  gaap: Gaap;
  /** Ascending; FY periods then (when the stitch succeeded) LTM. */
  periods: Period[];
  /** The anchor fiscal year (balance-sheet date; the FY-basis ratios). null ⇔ no historical year. */
  anchor: PeriodKey | null;
  /** The period the deal is sized on: 'LTM' when stitched, else the anchor FY. */
  sizing: PeriodKey | null;
  lines: Partial<Record<LineId, Record<PeriodKey, Cell>>>;
  candidates: AdjustmentCandidate[];
  notes: string[];
}

export const cellAt = (pack: StatementPack, line: LineId, period: PeriodKey | null): Cell | null =>
  (period !== null && pack.lines[line]?.[period]) || null;
