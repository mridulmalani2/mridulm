/**
 * v2 HistoryTable — the D1 multi-year table on Screen 2 (PHASE_E §E1): per-cell gaps
 * render EMPTY (an em-dash), never fabricated; the staleness label (D3) heads the block.
 * All numbers pass through lib/format — engine floats never reach the DOM raw.
 */
import React from 'react';
import { money, moneyIso, num, pct, staleness, stalenessTier } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import type { DealFacts } from '../../../lib/engine2/types';

const label = { color: 'var(--de-ink-3)' } as const;
// §1.1 staleness tiers — the sizing as-of's age vs import date (fresh ≤4.5m / aging ≤14.5m / stale).
const STALE_COLOR: Record<'fresh' | 'aging' | 'stale', string> = { fresh: 'var(--de-pos)', aging: 'var(--de-warn)', stale: 'var(--de-accent)' };

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
  // Source-honest wording: a hand-entered history is NOT a "filing" (the mislabel class
  // v1.1.2 taught us to test for) — facts.source names the producer.
  const sourceNoun = facts.source === 'manual' ? 'entered' : 'filing';
  if (!rows.length) {
    return (
      <p className="text-[13px]" style={label}>
        {facts.source === 'manual'
          ? 'No usable multi-year history was entered (≥3 full-year points are needed for a history-based suggestion).'
          : 'No usable multi-year history in the filing (≥3 full-year points are needed for a history-based suggestion).'}
      </p>
    );
  }
  const cell = (v: number | null, fmt: (x: number) => string) => (v === null ? '–' : fmt(v));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-semibold text-[color:var(--de-ink)]">{sourceNoun === 'entered' ? 'Entered history' : 'Filing history'}</span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[12px]" style={label}>{staleness(facts.fiscal_year ?? undefined, facts.period_end ?? undefined, today)}</span>
          {/* §1.1: the SIZING basis (leverage + entry EBITDA) — the LTM quarter-stitch when interim
              filings allow, else FY — with its staleness tier. Distinct from the FY-anchored filing
              history above (an LTM deal's sizing as-of runs past the latest FY end). */}
          {facts.sizing_basis && (() => {
            const tier = stalenessTier(facts.sizing_as_of, today); // view-relative, uniform across all filer paths
            return (
              <span className="text-[12px] flex items-center gap-1" style={label}
                title="Sizing basis for leverage & entry EBITDA (SPEC §1.1)">
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: STALE_COLOR[tier ?? 'fresh'] }} />
                {facts.sizing_basis === 'LTM' ? `sizing: LTM ending ${facts.sizing_as_of}` : 'sizing: FY'}
                {tier ? ` · ${tier}` : ''}
              </span>
            );
          })()}
        </span>
      </div>
      <div className="de-scroll-x">
        <table className="de-table">
          <thead>
            <tr>
              <th>FY end</th>
              <th>Revenue</th>
              <th>EBITDA</th>
              <th>Margin</th>
              <th>Capex</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.period_end}>
                <td>{h.period_end}</td>
                <td>{cell(h.revenue, fmtMoney)}</td>
                <td>{cell(h.ebitda, fmtMoney)}</td>
                <td>{h.revenue !== null && h.ebitda !== null && h.revenue > 0 ? pct(h.ebitda / h.revenue) : '–'}</td>
                <td>{cell(h.capex, (x) => num(x, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryTable;
