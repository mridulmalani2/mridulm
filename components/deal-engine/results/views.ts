/** The views of the Results step, in rail order. One list drives the rail and the command palette. */
export interface ResultView { id: string; label: string; group: 'Answer' | 'Model' | 'Analysis' | 'Reference'; keywords?: string }

export const RESULT_VIEWS: ResultView[] = [
  { id: 'overview', label: 'Overview', group: 'Answer', keywords: 'summary headline kpi' },
  { id: 'returns', label: 'Returns', group: 'Answer', keywords: 'irr moic bridge promote lp' },
  { id: 'operating', label: 'Operating forecast', group: 'Model', keywords: 'revenue ebitda capex fcf cash flow' },
  { id: 'su', label: 'Sources and uses', group: 'Model', keywords: 'financing equity fees' },
  { id: 'debt', label: 'Debt schedule', group: 'Model', keywords: 'tranche interest sweep amortization revolver' },
  { id: 'credit', label: 'Credit and covenants', group: 'Model', keywords: 'leverage dscr icr fccr headroom liquidity cash' },
  { id: 'bs', label: 'Balance sheet', group: 'Model', keywords: 'goodwill assets equity' },
  { id: 'sensitivity', label: 'Sensitivity', group: 'Analysis', keywords: 'tornado grid break-even flex' },
  { id: 'scenarios', label: 'Scenarios and cases', group: 'Analysis', keywords: 'downside stress compare' },
  { id: 'valuation', label: 'Valuation', group: 'Analysis', keywords: 'flow to equity npv cost of equity' },
  { id: 'methodology', label: 'Methodology', group: 'Reference', keywords: 'simplifications conventions' },
];
