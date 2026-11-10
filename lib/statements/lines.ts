/**
 * lib/statements/lines.ts — the fixed line list (v1): label, statement and whether the Clean
 * step lets the analyst restate the cell. A line is restatable only where the cleaning layer
 * has a defined, tested path from that cell to the figures the model reads — restating any
 * other cell would change nothing downstream, which would be a control that lies.
 */
import type { LineId } from './types';

export type Statement = 'income' | 'cash_flow' | 'balance_sheet';

export interface LineMeta {
  id: LineId;
  label: string;
  statement: Statement;
  kind: 'duration' | 'instant';
  restatable: boolean;
  /** Rendered as a subtotal (rule above, bold). */
  total?: boolean;
  /** One line on what the figure is, shown under the label where it is not obvious. */
  hint?: string;
}

export const LINES: LineMeta[] = [
  { id: 'revenue', label: 'Revenue', statement: 'income', kind: 'duration', restatable: true },
  { id: 'cogs', label: 'Cost of revenue', statement: 'income', kind: 'duration', restatable: false },
  { id: 'gross_profit', label: 'Gross profit', statement: 'income', kind: 'duration', restatable: false, total: true },
  { id: 'sga', label: 'Selling, general & administrative', statement: 'income', kind: 'duration', restatable: false },
  { id: 'rnd', label: 'Research & development', statement: 'income', kind: 'duration', restatable: false },
  { id: 'operating_income', label: 'Operating income', statement: 'income', kind: 'duration', restatable: true, total: true },
  { id: 'da', label: 'Depreciation & amortisation', statement: 'income', kind: 'duration', restatable: true },
  { id: 'ebitda', label: 'EBITDA (reported)', statement: 'income', kind: 'duration', restatable: true, total: true, hint: 'Operating income + D&A' },
  { id: 'interest_expense', label: 'Interest expense', statement: 'income', kind: 'duration', restatable: false },
  { id: 'pretax_income', label: 'Pre-tax income', statement: 'income', kind: 'duration', restatable: false },
  { id: 'tax_expense', label: 'Income tax expense', statement: 'income', kind: 'duration', restatable: false },
  { id: 'net_income', label: 'Net income', statement: 'income', kind: 'duration', restatable: false, total: true },

  { id: 'cfo', label: 'Cash from operations', statement: 'cash_flow', kind: 'duration', restatable: false, total: true },
  { id: 'capex', label: 'Capital expenditure', statement: 'cash_flow', kind: 'duration', restatable: true },
  { id: 'sbc', label: 'Share-based compensation', statement: 'cash_flow', kind: 'duration', restatable: false },
  { id: 'acquisitions', label: 'Acquisitions, net of cash', statement: 'cash_flow', kind: 'duration', restatable: false },

  { id: 'cash', label: 'Cash & equivalents', statement: 'balance_sheet', kind: 'instant', restatable: true },
  { id: 'st_investments', label: 'Short-term investments', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'receivables', label: 'Receivables', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'inventory', label: 'Inventory', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'payables', label: 'Payables', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'net_ppe', label: 'Net PP&E', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'goodwill', label: 'Goodwill', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'borrowings', label: 'Borrowings', statement: 'balance_sheet', kind: 'instant', restatable: true, hint: 'Bank and bond debt, before lease liabilities where the filing separates them' },
  { id: 'finance_lease_liab', label: 'Finance lease liabilities', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'operating_lease_liab', label: 'Operating lease liabilities', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'lease_liab', label: 'Lease liabilities (IFRS 16)', statement: 'balance_sheet', kind: 'instant', restatable: false },
  { id: 'total_equity', label: 'Shareholders’ equity', statement: 'balance_sheet', kind: 'instant', restatable: false, total: true },
];

export const LINE_META: Record<LineId, LineMeta> = Object.fromEntries(LINES.map((l) => [l.id, l])) as Record<LineId, LineMeta>;
export const lineLabel = (id: LineId): string => LINE_META[id].label;
