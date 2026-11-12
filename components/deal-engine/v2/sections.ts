/**
 * The sections of the input sheet, in order, and which section an input path belongs to. One
 * list drives the sheet, the rail beside it, the "what blocks Build" list and the command palette.
 */
export interface SectionDef { id: string; title: string; optional?: boolean }

export const SECTIONS: SectionDef[] = [
  { id: 'transaction', title: 'Transaction' },
  { id: 'debt', title: 'Debt' },
  { id: 'operating', title: 'Operating forecast' },
  { id: 'tax', title: 'Tax' },
  { id: 'valuation', title: 'Valuation', optional: true },
  { id: 'equity', title: 'Management and equity', optional: true },
  { id: 'policy', title: 'Distributions and covenants', optional: true },
  { id: 'refinancing', title: 'Refinancing and PIK', optional: true },
  { id: 'fund', title: 'Fund overlay', optional: true },
];

/** An input's label as the interface shows it: the engine's label with its dashes read as commas. */
export const plainLabel = (label: string): string => label;

export function sectionOf(path: string): string {
  if (/^structure\.tranches\.\d+\.elections/.test(path) || path.startsWith('structure.refinancing')) return 'refinancing';
  if (path.startsWith('structure.tranches') || path.startsWith('structure.sweep')) return 'debt';
  if (path.startsWith('structure.selldown') || path.startsWith('mip') || path.startsWith('sweet_equity') || path.startsWith('warrant')) return 'equity';
  if (path.startsWith('structure.distributions') || path.startsWith('structure.surplus_distribution') || path.startsWith('covenants') || path.startsWith('fees.monitoring')) return 'policy';
  if (path.startsWith('operations')) return 'operating';
  if (path.startsWith('tax')) return 'tax';
  if (path.startsWith('valuation')) return 'valuation';
  if (path.startsWith('fund')) return 'fund';
  return 'transaction';
}
