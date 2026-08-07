import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { manualHistoricals, shiftYearEnd, type ManualYearRow } from '../../../lib/edgar/buildModel';

import ApiKeyInline from './ApiKeyInline';

/**
 * Manual-entry "facts" screen — the REALISTIC private-target path. Most buyouts are of
 * private companies underwritten from a CIM / dataroom / management accounts; this screen
 * collects that surface: a multi-year operating history (the same D1 history the EDGAR
 * route extracts), the §1.1 sizing basis (FY or LTM), and the at-entry balance-sheet
 * items. Everything lands as a RawHistoricals tagged 'user' / origin 'manual' and feeds
 * the IDENTICAL engine2 workbench — the manual and filing routes diverge only in how the
 * facts are sourced.
 *
 * Honesty invariant (same as extraction): a BLANK cell stays blank — it becomes a gap the
 * review screen surfaces with a MISSING badge. Nothing is coerced to 0.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const inputStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' };
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.4)', fontFamily: mono };

const SECTORS = ['Technology', 'Healthcare', 'Industrials', 'Consumer', 'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other'];
const CURRENCIES: ('USD' | 'GBP' | 'EUR' | 'INR' | 'JPY')[] = ['USD', 'GBP', 'EUR', 'INR', 'JPY'];
const CSYM: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' };

/** '' → null; anything unparseable → null. Blank is BLANK, never 0. */
const parseCell = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

interface GridRow { revenue: string; ebitda: string; da: string; capex: string }
const emptyRow = (): GridRow => ({ revenue: '', ebitda: '', da: '', capex: '' });

const GRID_METRICS: { key: keyof GridRow; label: string; ltm: boolean }[] = [
  { key: 'revenue', label: 'Revenue', ltm: true },
  { key: 'ebitda', label: 'EBITDA', ltm: true },
  { key: 'da', label: 'D&A', ltm: false },
  { key: 'capex', label: 'Capex', ltm: false },
];

const Field: React.FC<{ label: string; unit?: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }>
  = ({ label, unit, value, onChange, placeholder, disabled }) => (
  <label className="block">
    <span className="flex items-center justify-between mb-1">
      <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>{label}</span>
      {unit && <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: mono }}>{unit}</span>}
    </span>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      inputMode="decimal" className="w-full px-3 py-2 text-sm" style={{ ...inputStyle, ...(disabled ? { background: paper, color: 'rgba(17,17,17,0.55)' } : {}) }} />
  </label>
);

const ManualFactsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const loadFromHistoricals = useDealEngineStore((s) => s.loadFromHistoricals);

  const [dealName, setDealName] = useState('New Deal');
  const [sector, setSector] = useState('Technology');
  const [currency, setCurrency] = useState<'USD' | 'GBP' | 'EUR' | 'INR' | 'JPY'>('USD');

  const [anchorEnd, setAnchorEnd] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const [rows, setRows] = useState<GridRow[]>([emptyRow(), emptyRow(), emptyRow()]); // index 0 = oldest
  const [basis, setBasis] = useState<'FY' | 'LTM'>('FY');
  const [ltmAsOf, setLtmAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [ltm, setLtm] = useState({ revenue: '', ebitda: '' });

  const [pt, setPt] = useState({ nwc: '', grossDebt: '', cash: '', netDebt: '', netPpe: '', taxRate: '', nol: '' });
  const setP = (k: keyof typeof pt) => (v: string) => setPt((p) => ({ ...p, [k]: v }));

  // Column end dates derive from the anchor FY end — one shared definition (data layer's).
  const ends = rows.map((_, i) => shiftYearEnd(anchorEnd, rows.length - 1 - i));
  const csym = CSYM[currency] ?? '$';

  const setCell = (i: number, k: keyof GridRow) => (v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addYear = () => setRows((rs) => (rs.length < 5 ? [emptyRow(), ...rs] : rs)); // older years prepend
  const dropYear = () => setRows((rs) => (rs.length > 1 ? rs.slice(1) : rs));

  // Derived net debt preview — shown (and locked) only when BOTH legs parse; the data layer
  // does the same derivation, so the two can never disagree.
  const g = parseCell(pt.grossDebt);
  const c = parseCell(pt.cash);
  const netDerived = g !== null && c !== null ? g - c : null;

  // Sizing pair completeness gates the submit (everything ELSE may stay blank → gaps).
  const anchorRow = rows[rows.length - 1];
  const sizingOk = basis === 'LTM'
    ? parseCell(ltm.revenue) !== null && parseCell(ltm.ebitda) !== null
    : parseCell(anchorRow.revenue) !== null && parseCell(anchorRow.ebitda) !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sizingOk) return;
    const years: ManualYearRow[] = rows.map((r, i) => ({
      end: ends[i],
      revenue: parseCell(r.revenue),
      ebitda: parseCell(r.ebitda),
      da: parseCell(r.da),
      capex: parseCell(r.capex),
    }));
    const taxPct = parseCell(pt.taxRate);
    const raw = manualHistoricals({
      dealName: dealName || 'New Deal',
      sector,
      currency,
      basis,
      ltm: basis === 'LTM' && parseCell(ltm.revenue) !== null && parseCell(ltm.ebitda) !== null
        ? { asOf: ltmAsOf, revenue: parseCell(ltm.revenue)!, ebitda: parseCell(ltm.ebitda)! }
        : null,
      years,
      nwc: parseCell(pt.nwc),
      grossDebt: g,
      cash: c,
      netDebt: parseCell(pt.netDebt),
      netPpe: parseCell(pt.netPpe),
      taxRate: taxPct === null ? null : taxPct / 100,
      nol: parseCell(pt.nol),
    });
    loadFromHistoricals(raw);
  };

  const fyLabel = (end: string) => `FY${end.slice(0, 4)}`;
  const marginAt = (r: GridRow): string => {
    const rev = parseCell(r.revenue);
    const eb = parseCell(r.ebitda);
    return rev !== null && eb !== null && rev > 0 ? `${((eb / rev) * 100).toFixed(1)}%` : '—';
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: paper }}>
      <form onSubmit={submit} className="relative z-10 w-full max-w-3xl mx-auto px-6 py-12">
        <button type="button" onClick={onBack} className="text-[10px] tracking-widest uppercase mb-5" style={{ ...labelStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← back to source options</button>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111' }}>Enter the facts</h1>
        <p className="mb-8" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 520 }}>
          The private-target workflow: type the numbers from the CIM, dataroom, or management accounts.
          A few years of history sharpens the growth suggestions; anything you leave blank stays blank —
          it surfaces as a gap to confirm on the next screen, never a silent default.
        </p>

        <div className="p-6 lg:p-8" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
          <div className="border-t-[2px] border-[#111] mb-5" />

          {/* Identity */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <label className="block col-span-2">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Company / Deal Name</span>
              <input value={dealName} onChange={(e) => setDealName(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle} />
            </label>
            <label className="block">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Sector</span>
              <select value={sector} onChange={(e) => setSector(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                {CURRENCIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
              </select>
            </label>
          </div>

          {/* History grid */}
          <div className="flex items-end justify-between mb-2 flex-wrap gap-2">
            <p className="text-[10px] tracking-widest uppercase" style={labelStyle}>Operating history ({csym}m per year)</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>Latest FY end</span>
                <input type="date" value={anchorEnd} onChange={(e) => e.target.value && setAnchorEnd(e.target.value)}
                  className="px-2 py-1 text-[11px]" style={inputStyle} />
              </label>
              <div className="flex" style={{ border: '1px solid rgba(17,17,17,0.15)' }}>
                <button type="button" onClick={dropYear} disabled={rows.length <= 1} className="px-2 py-1 text-[11px]" style={{ fontFamily: mono, color: rows.length > 1 ? '#111' : 'rgba(17,17,17,0.25)', background: 'transparent', border: 'none' }}>− year</button>
                <button type="button" onClick={addYear} disabled={rows.length >= 5} className="px-2 py-1 text-[11px]" style={{ fontFamily: mono, color: rows.length < 5 ? '#111' : 'rgba(17,17,17,0.25)', background: 'transparent', borderLeft: '1px solid rgba(17,17,17,0.15)', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>+ year</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto mb-2">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="text-left py-1 pr-2 text-[10px] tracking-widest uppercase font-normal" style={labelStyle}>{' '}</th>
                  {ends.map((end) => (
                    <th key={end} className="text-right py-1 px-1 font-normal">
                      <span className="block text-[11px]" style={{ color: '#111', fontFamily: mono }}>{fyLabel(end)}</span>
                      <span className="block text-[9px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono }}>{end}</span>
                    </th>
                  ))}
                  {basis === 'LTM' && (
                    <th className="text-right py-1 px-1 font-normal">
                      <span className="block text-[11px]" style={{ color: '#CC0000', fontFamily: mono }}>LTM</span>
                      <span className="block text-[9px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono }}>sizing basis</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {GRID_METRICS.map((m) => (
                  <tr key={m.key} style={{ borderTop: '1px solid rgba(17,17,17,0.06)' }}>
                    <td className="py-1 pr-2 text-[10px] tracking-widest uppercase whitespace-nowrap" style={labelStyle}>{m.label}</td>
                    {rows.map((r, i) => (
                      <td key={ends[i]} className="py-1 px-1">
                        <input value={r[m.key]} onChange={(e) => setCell(i, m.key)(e.target.value)} inputMode="decimal"
                          className="w-full px-2 py-1.5 text-[12px] text-right" style={inputStyle} placeholder="—" />
                      </td>
                    ))}
                    {basis === 'LTM' && (
                      <td className="py-1 px-1">
                        {m.ltm ? (
                          <input value={ltm[m.key as 'revenue' | 'ebitda']} onChange={(e) => setLtm((p) => ({ ...p, [m.key]: e.target.value }))} inputMode="decimal"
                            className="w-full px-2 py-1.5 text-[12px] text-right" style={{ ...inputStyle, borderColor: 'rgba(204,0,0,0.35)' }} placeholder="—" />
                        ) : (
                          <span className="block text-right text-[11px] pr-2" title="Operating rates always derive from the anchor fiscal year (§1.1)" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: mono }}>n/a</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid rgba(17,17,17,0.06)' }}>
                  <td className="py-1 pr-2 text-[9px] tracking-widest uppercase whitespace-nowrap" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono }}>Implied margin</td>
                  {rows.map((r, i) => (
                    <td key={ends[i]} className="py-1 px-2 text-right text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: mono }}>{marginAt(r)}</td>
                  ))}
                  {basis === 'LTM' && (
                    <td className="py-1 px-2 text-right text-[10px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: mono }}>{marginAt({ ...ltm, da: '', capex: '' })}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Sizing basis */}
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>Sizing figures are</span>
            <div className="flex" style={{ border: '1px solid rgba(17,17,17,0.15)', width: 'fit-content' }}>
              {(['FY', 'LTM'] as const).map((b) => (
                <button key={b} type="button" onClick={() => setBasis(b)}
                  className="px-3 py-1 text-[10px] tracking-widest uppercase"
                  style={{ background: basis === b ? '#111' : 'transparent', color: basis === b ? '#fff' : 'rgba(17,17,17,0.45)', fontFamily: mono, border: 'none' }}>
                  {b === 'FY' ? 'Latest FY' : 'LTM'}
                </button>
              ))}
            </div>
            {basis === 'LTM' && (
              <label className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>LTM as of</span>
                <input type="date" value={ltmAsOf} onChange={(e) => e.target.value && setLtmAsOf(e.target.value)}
                  className="px-2 py-1 text-[11px]" style={inputStyle} />
              </label>
            )}
            <span className="text-[9px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono }}>
              {basis === 'LTM' ? 'leverage & entry EBITDA size off the LTM pair; D&A/capex/NWC rates stay FY-based (§1.1)' : 'leverage & entry EBITDA size off the latest fiscal year'}
            </span>
          </div>

          {/* At-entry balance sheet */}
          <p className="mb-2 text-[10px] tracking-widest uppercase" style={labelStyle}>At entry ({csym}m unless noted)</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <Field label="Operating NWC" unit={`${csym}m`} value={pt.nwc} onChange={setP('nwc')} placeholder="blank = gap" />
            <Field label="Gross Debt" unit={`${csym}m`} value={pt.grossDebt} onChange={setP('grossDebt')} placeholder="blank = gap" />
            <Field label="Cash" unit={`${csym}m`} value={pt.cash} onChange={setP('cash')} placeholder="blank = gap" />
            {netDerived !== null ? (
              <Field label="Net Debt (derived)" unit="gross − cash" value={netDerived.toFixed(1)} onChange={() => undefined} disabled />
            ) : (
              <Field label="Net Debt" unit={`${csym}m`} value={pt.netDebt} onChange={setP('netDebt')} placeholder="or enter gross + cash" />
            )}
            <Field label="Net PP&E" unit={`${csym}m`} value={pt.netPpe} onChange={setP('netPpe')} placeholder="blank = gap" />
            <Field label="Effective Tax Rate" unit="%" value={pt.taxRate} onChange={setP('taxRate')} placeholder="blank = statutory default" />
            <Field label="NOL Carryforward" unit={`${csym}m`} value={pt.nol} onChange={setP('nol')} placeholder="0 / blank = none" />
          </div>

          <p className="mb-4 text-[9px]" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: mono, lineHeight: 1.7 }}>
            Blank cells stay blank — the review screen shows each as a red MISSING gap for you to confirm.
            Net debt locks to gross − cash when both are entered.
          </p>

          <button type="submit" disabled={!sizingOk} className="w-full py-2.5 text-sm tracking-widest uppercase"
            style={{ background: sizingOk ? '#CC0000' : 'rgba(17,17,17,0.08)', color: sizingOk ? '#fff' : 'rgba(17,17,17,0.35)', fontFamily: mono, border: `1px solid ${sizingOk ? '#CC0000' : 'rgba(17,17,17,0.08)'}`, letterSpacing: '0.12em' }}>
            {sizingOk ? 'Open the workbench →' : `Enter ${basis === 'LTM' ? 'LTM' : 'latest-FY'} revenue & EBITDA to continue`}
          </button>

          {/* Optional AI key — reused by AI-suggest on the next screen */}
          <ApiKeyInline />
        </div>
      </form>
    </div>
  );
};

export default ManualFactsScreen;
