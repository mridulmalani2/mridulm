/**
 * Manual-entry facts + sector inference (post-cutover residue of the old draft layer).
 *
 * The old draft-ModelState bridge died with the F-tail deletion (2026-07-24; tag
 * `pre-deletion-lib-engine`). What remains: `manualHistoricals` (private targets typed by
 * hand → the SAME RawHistoricals shape every mapper emits, feeding engine2) and
 * `inferSector` (EDGAR sicDescription → sector bucket for facts.sector provenance).
 */

import type { RawHistoricals, SourcedValue, Provenance } from './types';

/** Map an EDGAR `sicDescription` (free text) onto one of the engine's sector buckets. */
export function inferSector(sic?: string): string {
  if (!sic) return 'Other';
  const s = sic.toLowerCase();
  if (/(software|semiconductor|computer|internet|technolog|electronic)/.test(s)) return 'Technology';
  if (/(pharm|biotech|health|medical|hospital|drug)/.test(s)) return 'Healthcare';
  if (/(bank|insurance|financ|invest|capital|credit)/.test(s)) return 'Financial Services';
  if (/(real estate|reit|property)/.test(s)) return 'Real Estate';
  if (/(oil|gas|energy|petroleum|mining|coal)/.test(s)) return 'Energy';
  if (/(retail|consumer|food|beverage|apparel|restaurant)/.test(s)) return 'Consumer';
  if (/(service|consult|staffing|advertis)/.test(s)) return 'Business Services';
  if (/(manufactur|industrial|machinery|aerospace|construction|chemical)/.test(s)) return 'Industrials';
  return 'Other';
}

/** The factual inputs a user types on the manual-entry screen — the SAME surface the 10-K/EDGAR
 *  mapper extracts, just sourced by hand. Decimals for rates/margins. */
export interface ManualFactsInput {
  dealName: string;
  sector: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR';
  ltmRevenue: number;
  ebitdaMargin: number;      // decimal (0.25 = 25%)
  daPctRevenue: number;      // decimal
  capexPctRevenue: number;   // decimal
  nwcPctRevenue: number;     // decimal
  netDebt: number;
  taxRate: number;           // decimal
  nol?: number;
}

/**
 * Build a RawHistoricals from manually-entered facts (Phase 1) — identical SHAPE to what
 * `mapCompanyFacts` produces, with every value tagged 'user' provenance. This is what unifies
 * the manual and EDGAR routes: both yield a RawHistoricals that feeds the SAME
 * engine2 adapter → suggest → workbench path. Zero divergence.
 */
export function manualHistoricals(inp: ManualFactsInput): RawHistoricals {
  const userProv = (label: string): Provenance => ({ source: 'user', detail: `Manually entered — ${label}` });
  const sv = (value: number, label: string): SourcedValue => ({ value, provenance: userProv(label) });
  const rev = inp.ltmRevenue;
  return {
    entityName: inp.dealName,
    currency: inp.currency,
    basis: 'FY',
    fy_revenue: sv(rev, 'FY revenue'),
    fy_ebitda: sv(rev * inp.ebitdaMargin, 'EBITDA'),
    ebitda_margin: sv(inp.ebitdaMargin, 'EBITDA margin'),
    da: sv(rev * inp.daPctRevenue, 'D&A'),
    da_pct_revenue: sv(inp.daPctRevenue, 'D&A %'),
    capex: sv(rev * inp.capexPctRevenue, 'Capex'),
    capex_pct_revenue: sv(inp.capexPctRevenue, 'Capex %'),
    nwc: sv(rev * inp.nwcPctRevenue, 'NWC'),
    nwc_pct_revenue: sv(inp.nwcPctRevenue, 'NWC %'),
    gross_debt: null,
    cash: null,
    net_debt: sv(inp.netDebt, 'Net debt at entry'),
    net_ppe: null, // manual entry has no PP&E field — engine2 §8 seeds 0 with its disclosed note
    effective_tax_rate: sv(inp.taxRate, 'Effective tax rate'),
    nol_carryforward: inp.nol && inp.nol > 0 ? sv(inp.nol, 'NOL carryforward') : null,
    sector: { value: 0, provenance: userProv('Sector') },
    gaps: [],
    dso: null,
    dio: null,
    dpo: null,
    cogs: null,
    days_notes: [],
  };
}
