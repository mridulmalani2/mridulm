/**
 * Plain-language names for the fact paths the Build gate reports. A screen never shows a raw
 * field path to the analyst (tests/deal-engine-flow pins the coverage).
 */
export const FACT_LABELS: Record<string, string> = {
  fy_revenue: 'Revenue for the sizing period',
  fy_ebitda: 'EBITDA for the sizing period',
  fiscal_year: 'Fiscal year',
  period_end: 'Period end date',
  da_pct_revenue: 'D&A as a share of revenue',
  maint_capex_pct_revenue: 'Capex as a share of revenue',
  net_debt: 'Net debt at entry',
  nwc_pct_revenue: 'Operating working capital as a share of revenue',
  currency_unsupported: 'Reporting currency',
};

export const factLabel = (path: string): string => FACT_LABELS[path] ?? path.replace(/_/g, ' ');
