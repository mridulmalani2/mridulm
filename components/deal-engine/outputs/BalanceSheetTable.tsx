import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { csym } from '../../../lib/engine/utils';
import { fmtNumber } from '../../../lib/formatters';

const BalanceSheetTable: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms || !ms.balance_sheet || ms.balance_sheet.years.length === 0) return null;

  const bs = ms.balance_sheet;
  const sym = csym(ms.currency);
  const years = bs.years;
  const m = ms.margins;
  const daysNwcOn = m.nwc_dso != null || m.nwc_dio != null || m.nwc_dpo != null;

  const num = (v: number) => (v < 0 ? `(${fmtNumber(Math.abs(v))})` : fmtNumber(v));

  const headerStyle: React.CSSProperties = {
    color: 'rgba(17,17,17,0.4)', borderBottom: '1px solid rgba(17,17,17,0.1)',
  };
  const labelCell: React.CSSProperties = { color: 'rgba(17,17,17,0.55)' };
  const valCell: React.CSSProperties = { color: '#111111', textAlign: 'right' };

  const Row = ({ label, pick, bold, alt }: {
    label: string; pick: (y: typeof years[number]) => number; bold?: boolean; alt?: boolean;
  }) => (
    <tr style={alt ? { background: 'rgba(17,17,17,0.02)' } : undefined}>
      <td className="py-1 px-2 text-[10px]" style={{ ...labelCell, fontWeight: bold ? 600 : 400, color: bold ? '#111' : labelCell.color }}>{label}</td>
      {years.map((y, i) => (
        <td key={i} className="text-right py-1 px-2" style={{ ...valCell, fontWeight: bold ? 600 : 400 }}>{num(pick(y))}</td>
      ))}
    </tr>
  );

  const SectionRow = ({ label }: { label: string }) => (
    <tr>
      <td className="py-1.5 px-2 font-medium text-[10px] tracking-widest uppercase" style={{ color: '#CC0000' }} colSpan={years.length + 1}>{label}</td>
    </tr>
  );

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Balance Sheet ({sym}m)
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5"
          title="Three-statement integrity check: total assets minus total liabilities and equity, each year. A non-zero value indicates a flow inconsistency (e.g. operations could not fund debt service)."
          style={{
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
            background: bs.closes ? '#f0fdf4' : '#fff5f5',
            color: bs.closes ? '#15803d' : '#b91c1c',
            border: `1px solid ${bs.closes ? 'rgba(21,128,61,0.2)' : 'rgba(185,28,28,0.3)'}`,
          }}
        >
          {bs.closes ? '✓ BALANCES' : `⚠ DOES NOT CLOSE (Δ ${bs.max_abs_check.toFixed(2)})`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr>
              <th className="text-left py-1.5 px-2" style={headerStyle}></th>
              {years.map((y) => (
                <th key={y.year} className="text-right py-1.5 px-2 text-[10px] tracking-wider" style={headerStyle}>Yr {y.year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Assets" />
            <Row label="Cash" pick={(y) => y.cash} />
            <Row label="Net Working Capital" pick={(y) => y.net_working_capital} alt />
            {daysNwcOn && (
              <tr>
                <td className="py-0.5 px-2 text-[9px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }} colSpan={years.length + 1}>
                  days-based · DSO {m.nwc_dso ?? 0} / DIO {m.nwc_dio ?? 0} / DPO {m.nwc_dpo ?? 0}
                </td>
              </tr>
            )}
            <Row label="Net PP&E" pick={(y) => y.net_ppe} />
            <Row label="Deferred Fin. Costs" pick={(y) => y.deferred_financing_costs} alt />
            <Row label="Goodwill" pick={(y) => y.goodwill} />
            <Row label="Total Assets" pick={(y) => y.total_assets} bold alt />

            <SectionRow label="Liabilities" />
            <Row label="Debt" pick={(y) => y.total_debt} />
            <Row label="Deferred Tax" pick={(y) => y.deferred_tax_liability} alt />
            <Row label="Total Liabilities" pick={(y) => y.total_liabilities} bold />

            <SectionRow label="Equity" />
            <Row label="Shareholders' Equity" pick={(y) => y.shareholders_equity} bold alt />
            <Row label="Total Liab. + Equity" pick={(y) => y.total_liabilities_and_equity} bold />

            <tr style={{ borderTop: '1px solid rgba(17,17,17,0.1)' }}>
              <td className="py-1.5 px-2 font-medium text-[10px] tracking-wider uppercase" style={{ color: 'rgba(17,17,17,0.4)' }}>Balance Check</td>
              {years.map((y, i) => (
                <td key={i} className="text-right py-1.5 px-2" style={{ color: y.is_balanced ? '#15803d' : '#b91c1c', fontWeight: y.is_balanced ? 400 : 700 }}>
                  {y.is_balanced ? '0.0' : num(y.balance_check)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BalanceSheetTable;
