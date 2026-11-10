/**
 * lib/cleaning/types.ts — the CleaningLedger: the analyst's normalisation work, kept apart from
 * the sourced figures (rebuild/CLEANING_AND_SUITE_PLAN.md §4.1).
 *
 * The sourced RawHistoricals + StatementPack are never mutated. `applyCleaning(raw, pack, ledger)`
 * is a pure function of the three; removing every ledger entry returns the sourced figures.
 *
 * Categories are LABELS (grouping, the Excel export). No category changes any arithmetic.
 * Nothing here has a default: an amount not entered is null, and null is never read as zero.
 *
 * No imports from lib/engine2.
 */
import type { LineId, PeriodKey } from '../statements/types';

export type AdjustmentTarget = 'ebitda' | 'revenue' | 'capex' | 'da' | 'nwc';

export type AdjustmentCategory =
  | 'non_recurring' | 'restructuring' | 'impairment' | 'sbc' | 'transaction_costs' | 'litigation'
  | 'pro_forma' | 'run_rate' | 'accounting_policy' | 'other';

export type NetDebtCategory =
  | 'pension' | 'earn_out' | 'deferred_consideration' | 'nci' | 'preferred' | 'restricted_cash'
  | 'trapped_cash' | 'other';

export type EntrySource =
  | { kind: 'filing'; tag: string; url?: string }
  | { kind: 'user' }
  | { kind: 'ai'; quote: string };

/** Restate ONE sourced cell (or enter one the source lacks). The reason is required. */
export interface Override {
  id: string;
  line: LineId;
  period: PeriodKey;
  value: number;
  reason: string;
}

/** An itemised bridge row on one line. */
export interface Adjustment {
  id: string;
  target: AdjustmentTarget;
  label: string;
  category: AdjustmentCategory;
  /** Signed: + increases the target line. A period that is absent or null is NOT ENTERED. */
  amounts: Record<PeriodKey, number | null>;
  /**
   * EBITDA rows only (SPEC §27) — does the cost STOP or CONTINUE after the deal?
   *   'gone'      a one-off: it is in the price basis AND the forecast margin base.
   *   'continues' excluded for valuation only (share-based pay that becomes cash pay, a saving
   *               not yet achieved): in the price basis, NOT in the forecast margin base.
   * null = not yet chosen. A required choice with no default; ignored on other lines.
   */
  forecast: 'gone' | 'continues' | null;
  source: EntrySource;
  note: string;
  /** Un-tick without deleting. An un-ticked row changes nothing. */
  included: boolean;
  /** Filing proposals whose tag is often below operating income: the analyst's confirmation. */
  confirmed_in_operating_income?: boolean;
}

export interface NetDebtItem {
  id: string;
  side: 'debt_like' | 'cash_like';
  label: string;
  category: NetDebtCategory;
  /** At the anchor balance-sheet date. Debt-like: + adds to debt. Cash-like: + adds to cash,
   *  − removes cash that is restricted or trapped. null = not entered. */
  amount: number | null;
  source: EntrySource;
  note: string;
  included: boolean;
}

export type LeaseChoice = 'none' | 'finance' | 'all';

export interface CleaningLedger {
  version: 1;
  overrides: Override[];
  adjustments: Adjustment[];
  net_debt_items: NetDebtItem[];
  /** null = not yet chosen. There is no default: US GAAP and IFRS EBITDA treat rent differently. */
  choices: { leases_in_net_debt: LeaseChoice | null };
  /** The analyst explicitly chose to model the figures as reported. While true, every other
   *  entry is ignored (and kept, so the choice can be reversed). */
  as_reported: boolean;
}

export const emptyLedger = (): CleaningLedger => ({
  version: 1, overrides: [], adjustments: [], net_debt_items: [], choices: { leases_in_net_debt: null }, as_reported: false,
});

// ── output ────────────────────────────────────────────────────────────────────────────────

export interface BridgeRow {
  id: string;
  label: string;
  category: string;
  amount: number | null;
  note: string;
  source: EntrySource['kind'];
  /** §27 (EBITDA rows). */
  forecast?: 'gone' | 'continues' | null;
}

/** One line, one period: sourced → restated (overrides) → adjusted (+ itemised rows). */
export interface LineBridge {
  period: PeriodKey;
  /** As sourced. null ⇔ the source does not give it. */
  reported: number | null;
  /** After cell overrides (= reported when none apply). */
  restated: number | null;
  rows: BridgeRow[];
  /** restated + Σ rows. null ⇔ restated is null or a row's amount is not entered. */
  adjusted: number | null;
}

export interface NetDebtBridge {
  /** Net debt exactly as sourced (the figure the model shows with an empty ledger). */
  reported: number | null;
  borrowings: number | null;
  lease_choice: LeaseChoice | null;
  /** Every lease liability the source reports, and whether the choice counts it as debt. */
  leases: { line: LineId; label: string; amount: number; included: boolean }[];
  debt_like: BridgeRow[];
  cash: number | null;
  cash_like: BridgeRow[];
  /** borrowings + included leases (financial debt). */
  gross: number | null;
  /** gross + Σ debt-like − (cash + Σ cash-like). null ⇔ a component is missing or a choice is open. */
  adjusted: number | null;
}

export interface Bridges {
  as_reported: boolean;
  sizing: PeriodKey | null;
  anchor: PeriodKey | null;
  periods: { key: PeriodKey; label: string }[];
  revenue: LineBridge[];
  ebitda: LineBridge[];
  da: LineBridge[];
  capex: LineBridge[];
  net_debt: NetDebtBridge | null;
}

export interface CleaningFlag {
  code: string;
  severity: 'block' | 'warn' | 'info';
  message: string;
}
