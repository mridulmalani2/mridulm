import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { manualHistoricals } from '../../../lib/edgar/buildModel';
import type { ModelState } from '../../../lib/dealEngineTypes';

/**
 * Manual-entry "facts" screen (Phase 1) — for private targets not on EDGAR. It collects the
 * SAME factual surface the 10-K/EDGAR mapper extracts (revenue, EBITDA margin, D&A%, capex%,
 * NWC%, net debt, tax rate), builds a RawHistoricals tagged 'user', and routes through the
 * IDENTICAL assumptions review → model flow. The manual and EDGAR routes diverge only in how
 * the facts are sourced — everything downstream is one shared path.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const inputStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' };
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.4)', fontFamily: mono };

const SECTORS = ['Technology', 'Healthcare', 'Industrials', 'Consumer', 'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other'];
const CURRENCIES: ModelState['currency'][] = ['USD', 'GBP', 'EUR', 'INR', 'JPY'];

const DEFAULTS = {
  dealName: 'New Deal', sector: 'Technology', currency: 'USD' as ModelState['currency'],
  ltmRevenue: '100', ebitdaMargin: '25', daPctRevenue: '3', capexPctRevenue: '3',
  nwcPctRevenue: '10', netDebt: '0', taxRate: '25', nol: '0',
};

const Field: React.FC<{ label: string; unit?: string; value: string; onChange: (v: string) => void; wide?: boolean }>
  = ({ label, unit, value, onChange, wide }) => (
  <label className={`block ${wide ? 'col-span-2' : ''}`}>
    <span className="flex items-center justify-between mb-1">
      <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>{label}</span>
      {unit && <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: mono }}>{unit}</span>}
    </span>
    <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle} />
  </label>
);

const ManualFactsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const loadFromHistoricals = useDealEngineStore((s) => s.loadFromHistoricals);
  const [f, setF] = useState(DEFAULTS);
  const set = (k: keyof typeof DEFAULTS) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualHistoricals({
      dealName: f.dealName || 'New Deal',
      sector: f.sector,
      currency: f.currency,
      ltmRevenue: num(f.ltmRevenue),
      ebitdaMargin: num(f.ebitdaMargin) / 100,
      daPctRevenue: num(f.daPctRevenue) / 100,
      capexPctRevenue: num(f.capexPctRevenue) / 100,
      nwcPctRevenue: num(f.nwcPctRevenue) / 100,
      netDebt: num(f.netDebt),
      taxRate: num(f.taxRate) / 100,
      nol: num(f.nol),
    });
    loadFromHistoricals(raw, { dealName: f.dealName, sector: f.sector });
  };

  const csym = ({ GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' } as Record<string, string>)[f.currency] ?? '$';

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: paper }}>
      <form onSubmit={submit} className="relative z-10 w-full max-w-2xl mx-auto px-6 py-12">
        <button type="button" onClick={onBack} className="text-[10px] tracking-widest uppercase mb-5" style={{ ...labelStyle, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← back to EDGAR search</button>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111' }}>Enter the facts</h1>
        <p className="mb-8" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 480 }}>
          For a private target. Enter the same financials a 10-K would give us — you'll set the deal assumptions (growth, leverage, exit) on the next screen, exactly as the EDGAR route does.
        </p>

        <div className="p-6 lg:p-8" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
          <div className="border-t-[2px] border-[#111] mb-5" />
          <p className="mb-4 text-[10px] tracking-widest uppercase" style={labelStyle}>Factual inputs (last twelve months)</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Company / Deal Name" value={f.dealName} onChange={set('dealName')} wide />
            <label className="block">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Sector</span>
              <select value={f.sector} onChange={(e) => set('sector')(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Currency</span>
              <select value={f.currency} onChange={(e) => setF((p) => ({ ...p, currency: e.target.value as ModelState['currency'] }))} className="w-full px-3 py-2 text-sm" style={inputStyle}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <Field label="LTM Revenue" unit={`${csym}m`} value={f.ltmRevenue} onChange={set('ltmRevenue')} />
            <Field label="EBITDA Margin" unit="%" value={f.ebitdaMargin} onChange={set('ebitdaMargin')} />
            <Field label="D&A % Revenue" unit="%" value={f.daPctRevenue} onChange={set('daPctRevenue')} />
            <Field label="Capex % Revenue" unit="%" value={f.capexPctRevenue} onChange={set('capexPctRevenue')} />
            <Field label="NWC % Revenue" unit="%" value={f.nwcPctRevenue} onChange={set('nwcPctRevenue')} />
            <Field label="Net Debt at Entry" unit={`${csym}m`} value={f.netDebt} onChange={set('netDebt')} />
            <Field label="Effective Tax Rate" unit="%" value={f.taxRate} onChange={set('taxRate')} />
            <Field label="NOL Carryforward" unit={`${csym}m`} value={f.nol} onChange={set('nol')} />
          </div>

          {/* Implied snapshot */}
          {num(f.ltmRevenue) > 0 && (
            <div className="mb-4 px-3 py-2" style={{ background: paper, border: '1px solid rgba(17,17,17,0.08)' }}>
              <span className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.35)', fontFamily: mono }}>
                Implied EBITDA {csym}{(num(f.ltmRevenue) * num(f.ebitdaMargin) / 100).toFixed(1)}m
              </span>
            </div>
          )}

          <button type="submit" className="w-full py-2.5 text-sm tracking-widest uppercase" style={{ background: '#CC0000', color: '#fff', fontFamily: mono, border: '1px solid #CC0000', letterSpacing: '0.12em' }}>
            Review Assumptions →
          </button>
        </div>
      </form>
    </div>
  );
};

export default ManualFactsScreen;
