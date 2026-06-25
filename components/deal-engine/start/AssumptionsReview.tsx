import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import ProvenanceBadge from '../inputs/ProvenanceBadge';
import type { Provenance } from '../../../lib/edgar/types';

/**
 * Screen 2 — Assumptions review (Phase 1). Two clearly-labelled groups:
 *   • Extracted from filings (factual, read-only by default with an override affordance, each
 *     showing its source link);
 *   • Assumptions you must set (forward/structure, editable, AI-suggestable, each with a
 *     provenance badge).
 * A single Build button — the model is only reachable from here, after the user has seen and
 * approved every input.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.45)', fontFamily: mono };

const CSYM: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' };
const TRAJECTORIES = ['linear', 'front_loaded', 'back_loaded', 'step'];

/** One reviewed field: label, debounced editable value, unit, and a provenance badge. */
const Row: React.FC<{
  label: string;
  path: string;
  value: number | string;
  provenance?: Provenance;
  unit?: string;
  pct?: boolean;            // store decimal, display ×100
  readOnly?: boolean;
  options?: string[];
  step?: number;
}> = ({ label, path, value, provenance, unit, pct, readOnly, options }) => {
  const editAssumption = useDealEngineStore((s) => s.editAssumption);
  // A 'missing' field (the filing didn't provide it) reads EMPTY — never a placeholder number —
  // until the user types, at which point its provenance flips to 'user'.
  const missing = provenance?.source === 'missing';
  const fmt = (v: number | string) => (pct && typeof v === 'number' ? (v * 100).toFixed(2) : String(v));
  const [local, setLocal] = useState(missing ? '' : fmt(value));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setLocal(missing ? '' : fmt(value)); }, [value, pct, missing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback((raw: string) => {
    setLocal(raw);
    if (options) { editAssumption(path, raw); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      editAssumption(path, pct ? num / 100 : num);
    }, 350);
  }, [path, pct, options, editAssumption]);

  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] tracking-wider flex items-center gap-1.5" style={labelStyle}>
          {label}
          <ProvenanceBadge provenance={provenance} />
        </label>
        {unit && <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: mono }}>{unit}</span>}
      </div>
      {options ? (
        <select value={String(value)} onChange={(e) => commit(e.target.value)} className="w-full px-2 py-1.5 text-xs"
          style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.12)', color: '#111', fontFamily: mono, outline: 'none' }}>
          {options.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
        </select>
      ) : (
        <input
          type="text" value={local} readOnly={readOnly}
          placeholder={missing ? 'not in filing — enter a value' : undefined}
          onChange={(e) => commit(e.target.value)}
          className="w-full px-2 py-1.5 text-xs"
          style={{ background: readOnly ? paper : '#fff', border: `1px solid ${missing ? 'rgba(185,28,28,0.35)' : 'rgba(17,17,17,0.12)'}`, color: readOnly ? 'rgba(17,17,17,0.45)' : '#111', fontFamily: mono, outline: 'none' }}
        />
      )}
    </div>
  );
};

const AssumptionsReview: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  const prov = useDealEngineStore((s) => s.provenanceMap);
  const raw = useDealEngineStore((s) => s.rawHistoricals);
  const filings = useDealEngineStore((s) => s.sourceFilings);
  const editAssumption = useDealEngineStore((s) => s.editAssumption);
  const aiSuggest = useDealEngineStore((s) => s.aiSuggestAssumptions);
  const isSuggesting = useDealEngineStore((s) => s.isSuggesting);
  const build = useDealEngineStore((s) => s.buildModelFromDraft);
  const setStartScreen = useDealEngineStore((s) => s.setStartScreen);
  const error = useDealEngineStore((s) => s.error);
  const apiKey = useDealEngineStore((s) => s.apiKey);

  if (!ms) return null;
  const csym = CSYM[ms.currency] ?? '$';
  const driver = ms.entry.entry_valuation_driver ?? 'multiple';
  const p = (path: string): Provenance | undefined => prov[path];
  // Label the factual source from the provenance of a core extracted field.
  const factSource = prov['revenue.base_revenue']?.source;
  const sourceLabel = factSource === 'esef' ? 'ESEF filings' : factSource === 'edgar' ? 'SEC EDGAR' : 'your inputs';

  return (
    <div className="min-h-screen overflow-y-auto" style={{ background: paper }}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button onClick={() => setStartScreen('source')} className="text-[10px] tracking-widest uppercase mb-5" style={{ ...labelStyle, background: 'none', border: 'none', cursor: 'pointer' }}>← back to source</button>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <div className="flex items-end justify-between flex-wrap gap-3 mb-2">
          <h1 className="font-playfair text-4xl font-bold" style={{ color: '#111' }}>{ms.deal_name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-widest uppercase" style={labelStyle}>Currency</span>
            <select value={ms.currency} onChange={(e) => editAssumption('currency', e.target.value)}
              className="px-2 py-1 text-xs" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' }}>
              {['USD', 'GBP', 'EUR', 'INR', 'JPY'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="mb-5" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 13 }}>
          {raw ? <>Extracted from {sourceLabel}{raw.fiscalYear ? ` · FY${raw.fiscalYear}` : ''}. Review every input below — facts link back to the filing; assumptions are yours to set.</> : 'Review every input below before building.'}
        </p>

        {/* Filing links */}
        {filings.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {filings.map((f, i) => (
              <a key={i} href={f.documentUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 tracking-wider transition-colors hover:bg-[rgba(17,17,17,0.03)]"
                style={{ color: '#15803d', border: '1px solid rgba(21,128,61,0.3)', fontFamily: mono, textDecoration: 'none' }}>
                {f.form} · {f.filingDate} ↗
              </a>
            ))}
          </div>
        )}

        {/* Gaps banner */}
        {raw && raw.gaps.length > 0 && (
          <div className="mb-6 px-3 py-2" style={{ background: 'rgba(180,83,9,0.05)', border: '1px solid rgba(180,83,9,0.25)' }}>
            <span className="text-[10px] tracking-wider uppercase" style={{ color: '#b45309', fontFamily: mono }}>
              {raw.gaps.length} field(s) not in the filings — please confirm: {raw.gaps.join(', ')}
            </span>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Group A: Extracted from filings ── */}
          <section className="p-5" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
            <div className="border-t-[2px] border-[#15803d] mb-4" />
            <h2 className="text-[11px] tracking-widest uppercase mb-1" style={{ color: '#111', fontFamily: mono }}>Extracted from filings</h2>
            <p className="text-[10px] mb-4" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: 'Lora, serif' }}>Factual — read-only, but you may override.</p>
            <Row label="LTM Revenue" path="revenue.base_revenue" value={ms.revenue.base_revenue} provenance={p('revenue.base_revenue')} unit={`${csym}m`} />
            <Row label="EBITDA Margin" path="margins.base_ebitda_margin" value={ms.margins.base_ebitda_margin} provenance={p('margins.base_ebitda_margin')} unit="%" pct />
            <Row label="D&A % Revenue" path="margins.da_pct_revenue" value={ms.margins.da_pct_revenue} provenance={p('margins.da_pct_revenue')} unit="%" pct />
            <Row label="Capex % Revenue" path="margins.capex_pct_revenue" value={ms.margins.capex_pct_revenue} provenance={p('margins.capex_pct_revenue')} unit="%" pct />
            <Row label="NWC % Revenue" path="margins.nwc_pct_revenue" value={ms.margins.nwc_pct_revenue} provenance={p('margins.nwc_pct_revenue')} unit="%" pct />
            <Row label="Net Debt at Entry" path="entry.net_debt_at_entry" value={ms.entry.net_debt_at_entry} provenance={p('entry.net_debt_at_entry')} unit={`${csym}m`} />
            <Row label="Effective Tax Rate" path="tax.tax_rate" value={ms.tax.tax_rate} provenance={p('tax.tax_rate')} unit="%" pct />
            <Row label="NOL Carryforward" path="tax.nol_carryforward" value={ms.tax.nol_carryforward} provenance={p('tax.nol_carryforward')} unit={`${csym}m`} />
          </section>

          {/* ── Group B: Assumptions you set ── */}
          <section className="p-5" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
            <div className="border-t-[2px] border-[#CC0000] mb-4" />
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[11px] tracking-widest uppercase" style={{ color: '#111', fontFamily: mono }}>Assumptions you set</h2>
              <button
                onClick={aiSuggest}
                disabled={isSuggesting}
                title={apiKey ? 'Fill the forward assumptions with AI (uses your saved provider/key)' : 'Add an API key to enable AI-suggest'}
                className="text-[9px] px-2 py-1 tracking-widest uppercase transition-colors"
                style={{ color: isSuggesting ? 'rgba(17,17,17,0.3)' : '#CC0000', border: `1px solid ${isSuggesting ? 'rgba(17,17,17,0.1)' : 'rgba(204,0,0,0.3)'}`, fontFamily: mono, background: isSuggesting ? 'transparent' : 'rgba(204,0,0,0.04)' }}
              >
                {isSuggesting ? 'Suggesting…' : '✦ AI-suggest'}
              </button>
            </div>
            <p className="text-[10px] mb-4" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: 'Lora, serif' }}>Forward / structure — not in filings.</p>

            {/* Growth path */}
            <div className="mb-3">
              <label className="text-[10px] tracking-wider flex items-center gap-1.5 mb-1" style={labelStyle}>
                Revenue Growth (yr 1…{ms.exit.holding_period}) <ProvenanceBadge provenance={p('revenue.growth_rates')} /> <span style={{ color: 'rgba(17,17,17,0.25)' }}>%</span>
              </label>
              <div className="flex gap-1 flex-wrap">
                {ms.revenue.growth_rates.map((g, i) => (
                  <input key={i} type="text" defaultValue={(g * 100).toFixed(1)}
                    onBlur={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) editAssumption(`revenue.growth_rates.${i}`, n / 100); }}
                    className="w-12 px-1 py-1 text-[11px] text-center"
                    style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.12)', color: '#111', fontFamily: mono, outline: 'none' }} />
                ))}
              </div>
            </div>

            <Row label="Target EBITDA Margin" path="margins.target_ebitda_margin" value={ms.margins.target_ebitda_margin} provenance={p('margins.target_ebitda_margin')} unit="%" pct />
            <Row label="Margin Trajectory" path="margins.margin_trajectory" value={ms.margins.margin_trajectory} provenance={p('margins.margin_trajectory')} options={TRAJECTORIES} />

            {/* Valuation driver toggle */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] tracking-wider" style={labelStyle}>Set entry by</label>
                <div className="flex" style={{ border: '1px solid rgba(17,17,17,0.15)' }}>
                  {(['multiple', 'ev'] as const).map((d) => (
                    <button key={d} onClick={() => editAssumption('entry.entry_valuation_driver', d)}
                      className="px-2 py-0.5 text-[9px] tracking-widest uppercase transition-colors"
                      style={{ background: driver === d ? '#111' : 'transparent', color: driver === d ? '#fff' : 'rgba(17,17,17,0.4)', fontFamily: mono }}>
                      {d === 'ev' ? 'EV' : 'Multiple'}
                    </button>
                  ))}
                </div>
              </div>
              {driver === 'multiple'
                ? <>
                    <Row label="Entry EBITDA Multiple" path="entry.entry_ebitda_multiple" value={ms.entry.entry_ebitda_multiple} provenance={p('entry.entry_ebitda_multiple')} unit="x" />
                    <Row label="Enterprise Value (derived)" path="entry.enterprise_value" value={Number(ms.entry.enterprise_value.toFixed(1))} unit={`${csym}m`} readOnly />
                  </>
                : <>
                    <Row label="Enterprise Value" path="entry.enterprise_value" value={Number(ms.entry.enterprise_value.toFixed(1))} provenance={p('entry.enterprise_value')} unit={`${csym}m`} />
                    <Row label="Entry Multiple (derived)" path="entry.entry_ebitda_multiple" value={Number(ms.entry.entry_ebitda_multiple.toFixed(2))} unit="x" readOnly />
                  </>}
            </div>

            <Row label="Entry Leverage" path="entry.leverage_ratio" value={ms.entry.leverage_ratio} provenance={p('debt_tranches')} unit="x" />
            <Row label="Holding Period" path="exit.holding_period" value={ms.exit.holding_period} provenance={p('exit.holding_period')} unit="yrs" />
            <Row label="Exit EBITDA Multiple" path="exit.exit_ebitda_multiple" value={ms.exit.exit_ebitda_multiple} provenance={p('exit.exit_ebitda_multiple')} unit="x" />
            <Row label="Entry Fee" path="fees.entry_fee_pct" value={ms.fees.entry_fee_pct} provenance={p('fees.entry_fee_pct')} unit="%" pct />
            <Row label="MIP Pool" path="mip.mip_pool_pct" value={ms.mip.mip_pool_pct} provenance={p('mip.mip_pool_pct')} unit="%" pct />
          </section>
        </div>

        {error && <p className="text-xs mt-4" style={{ color: '#b91c1c', fontFamily: mono }}>{error}</p>}

        {/* Live preview + Build */}
        <div className="mt-6 flex items-center justify-between flex-wrap gap-4 p-4" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
          <div className="text-[11px]" style={{ color: 'rgba(17,17,17,0.6)', fontFamily: mono }}>
            Implied: EV {csym}{ms.entry.enterprise_value.toFixed(0)}m · Entry equity {csym}{ms.returns.entry_equity.toFixed(0)}m · IRR {ms.returns.irr != null ? `${(ms.returns.irr * 100).toFixed(1)}%` : 'N/C'} · MOIC {ms.returns.moic.toFixed(2)}x
          </div>
          <button onClick={build}
            className="px-8 py-2.5 text-sm tracking-widest uppercase transition-colors"
            style={{ background: '#CC0000', color: '#fff', fontFamily: mono, border: '1px solid #CC0000', letterSpacing: '0.12em' }}>
            Build Model →
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssumptionsReview;
