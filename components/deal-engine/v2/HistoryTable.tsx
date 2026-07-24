/**
 * v2 HistoryTable — the D1 multi-year table on Screen 2 (PHASE_E §E1): per-cell gaps
 * render EMPTY (an em-dash), never fabricated; the staleness label (D3) heads the block.
 * All numbers pass through lib/format — engine floats never reach the DOM raw.
 */
import React from 'react';
import { money, moneyIso, num, pct, staleness } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import type { DealFacts } from '../../../lib/engine2/types';

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const label = { color: 'rgba(17,17,17,0.45)', fontFamily: mono } as const;

const HistoryTable: React.FC<{
  facts: DealFacts;
  today?: Date;
  /** ISO code of an UNSUPPORTED filing currency (e.g. "SEK") — the table then prefixes the
   *  code instead of borrowing a modelled currency's symbol (facts.currency holds a display
   *  placeholder in that state; the Build gate is already closed by `currency_unsupported`). */
  isoOverride?: string | null;
}> = ({ facts, today = new Date(), isoOverride = null }) => {
  const ccy = facts.currency as Engine2Currency;
  const fmtMoney = (x: number) => (isoOverride ? moneyIso(x, isoOverride, 0) : money(x, ccy, 0));
  const rows = facts.history;
  if (!rows.length) {
    return (
      <p className="text-[11px]" style={label}>
        No usable multi-year history in the filing (≥3 full-year points are needed for a history-based suggestion).
      </p>
    );
  }
  const cell = (v: number | null, fmt: (x: number) => string) => (v === null ? '—' : fmt(v));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] tracking-wider uppercase" style={label}>Filing history</span>
        <span className="text-[10px]" style={label}>{staleness(facts.fiscal_year, facts.period_end, today)}</span>
      </div>
      <table className="w-full text-[11px]" style={{ fontFamily: mono, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'rgba(17,17,17,0.45)' }}>
            <th className="text-left font-normal py-1">FY end</th>
            <th className="text-right font-normal">Revenue</th>
            <th className="text-right font-normal">EBITDA</th>
            <th className="text-right font-normal">Margin</th>
            <th className="text-right font-normal">Capex</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.period_end} style={{ borderTop: '1px solid rgba(17,17,17,0.08)', color: '#111' }}>
              <td className="py-1">{h.period_end}</td>
              <td className="text-right">{cell(h.revenue, fmtMoney)}</td>
              <td className="text-right">{cell(h.ebitda, fmtMoney)}</td>
              <td className="text-right">{h.revenue !== null && h.ebitda !== null && h.revenue > 0 ? pct(h.ebitda / h.revenue) : '—'}</td>
              <td className="text-right">{cell(h.capex, (x) => num(x, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;
