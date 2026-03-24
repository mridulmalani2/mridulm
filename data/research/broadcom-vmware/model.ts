export interface ModelSheet {
  id: string;
  name: string;
  description: string;
  columns: string[];
  rows: ModelRow[];
}

export interface ModelRow {
  label: string;
  values: string[];
  isHeader?: boolean;
  isBold?: boolean;
  isTotal?: boolean;
  indent?: number;
}

export const MODEL_SHEETS: ModelSheet[] = [
  // ── Sheet 1: Transaction Summary ───────────────────────────────
  {
    id: 'transaction-summary',
    name: 'Transaction Summary',
    description: 'Deal terms, pricing, and key transaction metrics',
    columns: ['', 'Value', 'Unit', 'Source / Notes'],
    rows: [
      { label: 'Transaction Detail', values: ['', '', ''], isHeader: true },
      { label: 'Announcement Date', values: ['May 26, 2022', '', ''] },
      { label: 'Close Date', values: ['November 22, 2023', '', ''] },
      { label: 'Equity Value', values: ['61,000', '$mm', 'Source: Broadcom 8-K, Nov 2023'] },
      { label: 'Assumed Debt', values: ['8,000', '$mm', 'Source: VMware 10-K, FY2023'] },
      { label: 'Total Enterprise Value', values: ['69,000', '$mm', 'Calculated: Equity + Debt'], isBold: true },
      { label: 'Cash Per Share', values: ['$142.50', '$/share', 'Source: Merger Agreement'] },
      { label: 'Stock Exchange Ratio', values: ['0.2520', 'AVGO shares/VMware share', 'Source: Merger Agreement'] },
      { label: 'VMware Pre-Deal Revenue (LTM)', values: ['13,350', '$mm', 'Source: VMware 10-K, FY2023'] },
      { label: 'VMware Pre-Deal Operating Income', values: ['2,803', '$mm', 'Source: VMware 10-K, FY2023'] },
      { label: 'VMware Pre-Deal Operating Margin', values: ['21.0%', '%', 'Calculated'] },
      { label: 'EV / Revenue (at close)', values: ['5.2x', 'x', 'Calculated'], isBold: true },
      { label: 'EV / Operating Income (at close)', values: ['24.6x', 'x', 'Calculated'], isBold: true },
      { label: '', values: ['', '', ''] },
      { label: 'Non-Core Divestiture', values: ['', '', ''], isHeader: true },
      { label: 'EUC Division Sale to KKR', values: ['4,000', '$mm', 'Source: Broadcom Press Release, Feb 2024'] },
      { label: 'Effective Net Acquisition Cost', values: ['65,000', '', ''], isBold: true },
    ],
  },

  // ── Sheet 2: Pre-Post P&L ─────────────────────────────────────
  {
    id: 'pre-post-pl',
    name: 'Pre-Post P&L',
    description: 'VMware / Infrastructure Software Segment: Pre- and Post-Acquisition P&L Comparison ($mm)',
    columns: ['', 'Pre-Acq FY2022', 'Pre-Acq FY2023', 'Post-Acq FY2024', 'Post-Acq FY2025', 'Post-Acq FY2026E'],
    rows: [
      { label: 'Revenue', values: ['', '', '', '', ''], isHeader: true },
      { label: 'Infrastructure Software Revenue', values: ['5,768', '5,956', '21,495', '27,035', '30,279'], indent: 1 },
      { label: 'YoY Growth', values: ['', '3.3%', '260.9%', '25.8%', '12.0%'], indent: 2 },
      { label: '', values: ['', '', '', '', ''] },
      { label: 'Operating Expenses', values: ['', '', '', '', ''], isHeader: true },
      { label: 'Cost of Revenue', values: ['1,956', '1,853', '4,094', '4,596', '4,693'], indent: 1 },
      { label: 'R&D', values: ['1,876', '1,987', '3,200', '2,800', '2,574'], indent: 1 },
      { label: 'SG&A', values: ['1,458', '1,510', '2,200', '1,900', '1,817'], indent: 1 },
      { label: 'Restructuring & Other', values: ['78', '103', '800', '300', '303'], indent: 1 },
      { label: 'Total Operating Expenses', values: ['5,368', '5,453', '10,294', '9,596', '9,387'], isBold: true, indent: 1 },
      { label: 'Operating Income', values: ['400', '503', '11,201', '17,439', '20,892'], isBold: true, indent: 1 },
      { label: 'Operating Margin', values: ['6.9%', '8.4%', '52.1%', '64.5%', '69.0%'], indent: 2 },
      { label: '', values: ['', '', '', '', ''] },
      { label: 'EBITDA (Estimated)', values: ['', '', '', '', ''], isHeader: true },
      { label: 'D&A (estimated)', values: ['800', '850', '3,500', '4,000', '4,200'], indent: 1 },
      { label: 'EBITDA', values: ['1,200', '1,353', '14,701', '21,439', '25,092'], isBold: true, indent: 1 },
      { label: 'EBITDA Margin', values: ['20.8%', '22.7%', '68.4%', '79.3%', '82.9%'], indent: 2 },
    ],
  },

  // ── Sheet 3: Synergy Waterfall ─────────────────────────────────
  {
    id: 'synergy-waterfall',
    name: 'Synergy Waterfall',
    description: 'Value Creation Bridge: Pre- to Post-Acquisition, Annualized Run-Rate ($mm)',
    columns: ['', 'Amount ($mm)', '% of Pre-Acq Rev', 'Notes'],
    rows: [
      { label: 'VMware Pre-Acquisition Revenue (FY2023)', values: ['13,350', '', ''], isBold: true },
      { label: 'VMware Pre-Acquisition Operating Income', values: ['2,803', '', ''] },
      { label: 'Pre-Acquisition Operating Margin', values: ['21.0%', '', ''], indent: 1 },
      { label: '', values: ['', '', ''] },
      { label: 'Revenue Synergies', values: ['', '', ''], isHeader: true },
      { label: 'Subscription Conversion Uplift', values: ['5,500', '41.2%', 'Perpetual-to-subscription repricing across installed base'], indent: 1 },
      { label: 'Portfolio Bundling (NSX, vSAN attach)', values: ['3,200', '24.0%', 'Forced bundling increases effective ASP'], indent: 1 },
      { label: 'VCF Upsell to Top 10,000 Accounts', values: ['2,800', '21.0%', 'Annual booking value $2.7B+ in Q4 FY2024'], indent: 1 },
      { label: 'Pricing Increases on Renewals', values: ['4,500', '33.7%', 'Reported 800-1,500% increases (CISPE data)'], indent: 1 },
      { label: 'Channel Consolidation (enterprise focus)', values: ['1,200', '9.0%', 'Mid-market/SMB revenue loss from partner cuts'], indent: 1 },
      { label: 'Net Revenue Synergies', values: ['17,200', '128.8%', ''], isTotal: true },
      { label: '', values: ['', '', ''] },
      { label: 'Cost Synergies (Annualized)', values: ['', '', ''], isHeader: true },
      { label: 'Headcount Reduction (est. 50%+ of VMware)', values: ['4,800', '36.0%', 'Largest single cost lever'], indent: 1 },
      { label: 'R&D Rationalization (non-core products)', values: ['1,500', '11.2%', 'Focus on VCF, vSphere core'], indent: 1 },
      { label: 'G&A / Corporate Overhead Elimination', values: ['1,200', '9.0%', 'Duplicate functions removed'], indent: 1 },
      { label: 'Go-to-Market Consolidation', values: ['800', '6.0%', 'Channel/sales force restructuring'], indent: 1 },
      { label: 'Facilities & Infrastructure', values: ['400', '3.0%', 'Real estate, IT systems consolidation'], indent: 1 },
      { label: 'Total Cost Synergies', values: ['8,700', '65.2%', ''], isTotal: true },
      { label: '', values: ['', '', ''] },
      { label: 'Post-Acquisition Operating Profile (Run-Rate)', values: ['', '', ''], isHeader: true },
      { label: 'Post-Acquisition Revenue', values: ['30,550', '', ''], isBold: true },
      { label: 'Post-Acquisition Operating Income', values: ['28,703', '', ''], isBold: true },
      { label: 'Post-Acquisition Operating Margin', values: ['94.0%', '', ''], indent: 1 },
      { label: 'Margin Expansion (bps)', values: ['7,296', '', ''], indent: 1 },
    ],
  },

  // ── Sheet 4: Implied Multiples ─────────────────────────────────
  {
    id: 'implied-multiples',
    name: 'Implied Multiples',
    description: 'Pre-Synergy vs. Post-Synergy Basis',
    columns: ['Metric', 'Pre-Synergy', 'Post-Synergy', 'Notes'],
    rows: [
      { label: 'Enterprise Value ($mm)', values: ['69,000', '65,000', 'Post-synergy net of $4B EUC divestiture'] },
      { label: 'Revenue ($mm)', values: ['13,350', '27,035', ''] },
      { label: 'Operating Income ($mm)', values: ['2,803', '20,817', 'Post-synergy: 77% margin on $27B rev'] },
      { label: 'EBITDA ($mm)', values: ['3,653', '24,817', ''] },
      { label: '', values: ['', '', ''] },
      { label: 'Implied Multiples', values: ['', '', ''], isHeader: true },
      { label: 'EV / Revenue', values: ['5.2x', '2.4x', ''], isBold: true },
      { label: 'EV / Operating Income', values: ['24.6x', '3.1x', ''], isBold: true },
      { label: 'EV / EBITDA', values: ['18.9x', '2.6x', ''], isBold: true },
      { label: '', values: ['', '', ''] },
      { label: 'Margin Profile', values: ['', '', ''], isHeader: true },
      { label: 'Operating Margin', values: ['21.0%', '77.0%', ''] },
      { label: 'EBITDA Margin', values: ['27.4%', '91.8%', ''] },
      { label: 'Margin Expansion (bps)', values: ['5,600', '', 'Operating margin expansion'], isBold: true },
    ],
  },

  // ── Sheet 5: Scenario Analysis ─────────────────────────────────
  {
    id: 'scenario-analysis',
    name: 'Scenario Analysis',
    description: 'Forward Outcomes (2028E), Infrastructure Software Segment ($mm)',
    columns: ['Metric', 'Bear Case', 'Base Case', 'Bull Case'],
    rows: [
      { label: 'Key Assumptions', values: ['', '', ''], isHeader: true },
      { label: 'Customer Retention Rate (% of pre-acq base)', values: ['55.0%', '72.5%', '85.0%'] },
      { label: 'Revenue CAGR (FY2025-2028E)', values: ['-6.0%', '2.0%', '8.0%'] },
      { label: 'Operating Margin (2028E)', values: ['55.0%', '72.0%', '77.0%'] },
      { label: 'EBITDA Margin (2028E)', values: ['62.0%', '78.0%', '83.0%'] },
      { label: '', values: ['', '', ''] },
      { label: 'Projected Financials (2028E)', values: ['', '', ''], isHeader: true },
      { label: 'FY2025 Revenue (Baseline)', values: ['27,035', '27,035', '27,035'] },
      { label: 'Projected Revenue (2028E)', values: ['22,455', '28,690', '34,056'], isBold: true },
      { label: 'Projected Operating Income', values: ['12,350', '20,657', '26,223'], isBold: true },
      { label: 'Projected EBITDA', values: ['13,922', '22,378', '28,267'], isBold: true },
      { label: '', values: ['', '', ''] },
      { label: 'Implied Segment Valuation (2028E)', values: ['', '', ''], isHeader: true },
      { label: 'Applied EV/EBITDA Multiple', values: ['12.0x', '16.0x', '22.0x'] },
      { label: 'Implied Segment Enterprise Value ($mm)', values: ['167,064', '358,048', '621,868'], isBold: true },
      { label: 'vs. Acquisition Cost ($69B)', values: ['142.1%', '418.9%', '801.3%'] },
      { label: '', values: ['', '', ''] },
      { label: 'Return Metrics (5-Year: 2023-2028)', values: ['', '', ''], isHeader: true },
      { label: 'Acquisition Cost ($mm)', values: ['69,000', '69,000', '69,000'] },
      { label: 'Cumulative FCF (5-yr est., $mm)', values: ['55,000', '75,000', '95,000'] },
      { label: 'Total Value Created (FCF + Terminal)', values: ['222,064', '433,048', '716,868'], isBold: true },
      { label: 'MOIC (Multiple of Invested Capital)', values: ['3.2x', '6.3x', '10.4x'], isBold: true },
      { label: 'Implied IRR (5-year)', values: ['26.3%', '44.4%', '59.7%'], isBold: true },
    ],
  },

  // ── Sheet 6: Playbook Comps ────────────────────────────────────
  {
    id: 'playbook-comps',
    name: 'Playbook Comps',
    description: 'Broadcom Acquisition Playbook: Historical Comparison',
    columns: ['Metric', 'CA Technologies', 'Symantec Enterprise', 'VMware'],
    rows: [
      { label: 'Acquisition Year', values: ['2018', '2019', '2023'] },
      { label: 'Enterprise Value ($mm)', values: ['18,900', '10,700', '69,000'] },
      { label: 'Pre-Acq Revenue ($mm)', values: ['4,235', '2,490', '13,350'] },
      { label: 'EV / Revenue', values: ['4.5x', '4.3x', '5.2x'], isBold: true },
      { label: 'Pre-Acq Operating Margin', values: ['25.0%', '18.0%', '21.0%'] },
      { label: 'Post-Acq Operating Margin (Target)', values: ['65.0%', '65.0%', '77.0%'], isBold: true },
      { label: 'Margin Expansion (bps)', values: ['4,000', '4,700', '5,600'], isBold: true },
      { label: 'Headcount Reduction (est.)', values: ['~30-40%', '~30-40%', '~50%+'] },
      { label: 'SKU Consolidation', values: ['Significant', 'Significant', '8,000 to 4'] },
      { label: 'Perpetual to Subscription', values: ['Yes', 'Yes', 'Yes'] },
      { label: 'Channel Restructuring', values: ['Yes', 'Yes', 'Yes (aggressive)'] },
      { label: 'Time to Target Margins', values: ['~12-18 months', '~12-18 months', '~12-18 months'] },
    ],
  },
];
