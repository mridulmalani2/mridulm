import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import InputField from './InputField';

const SECTORS = [
  'Technology', 'Healthcare', 'Industrials', 'Consumer',
  'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other',
].map((s) => ({ value: s, label: s }));

const CURRENCIES = ['INR', 'EUR', 'USD', 'GBP', 'JPY'].map((c) => ({ value: c, label: c }));
const TRAJECTORIES = ['linear', 'front_loaded', 'back_loaded', 'step'].map((t) => ({ value: t, label: t.replace('_', ' ') }));
const EXIT_METHODS = ['strategic', 'secondary_buyout', 'ipo', 'recapitalization'].map((m) => ({ value: m, label: m.replace('_', ' ') }));
const AMORT_TYPES = ['bullet', 'straight_line', 'cash_sweep', 'PIK'].map((a) => ({ value: a, label: a.replace('_', ' ') }));
const TRANCHE_TYPES = ['senior', 'mezzanine', 'unitranche', 'revolver', 'pik_note'].map((t) => ({ value: t, label: t.replace('_', ' ') }));

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-0" style={{ borderBottom: '1px solid rgba(17,17,17,0.08)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[rgba(17,17,17,0.02)]"
      >
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          {title}
        </span>
        <span className="text-xs" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

const InputPanel: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  const updateField = useDealEngineStore((s) => s.updateField);
  const addTranche = useDealEngineStore((s) => s.addTranche);
  const removeTranche = useDealEngineStore((s) => s.removeTranche);
  const [showDistributions, setShowDistributions] = useState(false);

  if (!ms) return null;

  const entryMultWarn = ms.entry.entry_ebitda_multiple > 15 ? 'High entry — flag for IC' : undefined;
  const levWarn = ms.entry.leverage_ratio > 7 ? 'Covenant breach risk' : undefined;

  return (
    <div
      className="h-full overflow-y-auto flex-shrink-0"
      style={{ width: 320, background: '#ffffff', borderRight: '1px solid rgba(17,17,17,0.1)' }}
    >
      {/* Entry */}
      <Section title="Entry">
        <InputField label="Deal Name" path="deal_name" value={ms.deal_name} type="text" />
        <InputField label="Sector" path="sector" value={ms.sector} type="select" options={SECTORS} />
        <InputField label="Currency" path="currency" value={ms.currency} type="select" options={CURRENCIES} />
        <InputField label="LTM Revenue" path="revenue.base_revenue" value={ms.revenue.base_revenue} suffix="£m" />
        <InputField label="EBITDA Margin" path="margins.base_ebitda_margin" value={ms.margins.base_ebitda_margin} suffix="%" step={0.01} />
        <InputField label="Entry EBITDA Multiple" path="entry.entry_ebitda_multiple" value={ms.entry.entry_ebitda_multiple} suffix="x" warning={entryMultWarn} />
        <InputField label="Enterprise Value" path="entry.enterprise_value" value={ms.entry.enterprise_value} suffix="£m" formatter={(v) => v.toFixed(1)} />
      </Section>

      {/* Debt Structure */}
      <Section title="Debt Structure" defaultOpen={false}>
        <InputField label="Target Leverage" path="entry.leverage_ratio" value={ms.entry.leverage_ratio} suffix="x" warning={levWarn} />
        {ms.debt_tranches.map((t, i) => (
          <div key={i} className="mb-4 p-3 relative" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
            {ms.debt_tranches.length > 1 && (
              <button
                onClick={() => removeTranche(i)}
                className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-xs transition-colors hover:bg-[rgba(17,17,17,0.08)]"
                style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(17,17,17,0.12)' }}
                title="Remove tranche"
              >
                ×
              </button>
            )}
            <InputField label="Name" path={`debt_tranches.${i}.name`} value={t.name} type="text" />
            <InputField label="Type" path={`debt_tranches.${i}.tranche_type`} value={t.tranche_type || 'senior'} type="select" options={TRANCHE_TYPES} />
            <InputField label="Principal" path={`debt_tranches.${i}.principal`} value={t.principal} suffix="£m" />
            <InputField label="Rate Type" path={`debt_tranches.${i}.rate_type`} value={t.rate_type} type="select" options={[{ value: 'fixed', label: 'Fixed' }, { value: 'floating', label: 'Floating' }]} />
            <InputField label="Interest Rate" path={`debt_tranches.${i}.interest_rate`} value={t.interest_rate} suffix="%" step={0.005} />
            <InputField label="Amortization" path={`debt_tranches.${i}.amortization_type`} value={t.amortization_type} type="select" options={AMORT_TYPES} />
          </div>
        ))}
        <div className="mb-3">
          <button
            onClick={() => addTranche()}
            className="text-[10px] tracking-wider px-2 py-1 transition-colors hover:bg-[rgba(17,17,17,0.04)]"
            style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", border: '1px dashed rgba(17,17,17,0.15)' }}
          >
            + Add Tranche
          </button>
        </div>
      </Section>

      {/* Revenue */}
      <Section title="Revenue" defaultOpen={false}>
        {ms.revenue.growth_rates.map((g, i) => (
          <InputField key={i} label={`Year ${i + 1} Organic Growth`} path={`revenue.growth_rates.${i}`} value={g} suffix="%" step={0.01} aiToggleable />
        ))}
        <InputField label="Annual Churn Rate" path="revenue.churn_rate" value={ms.revenue.churn_rate} suffix="%" step={0.01} />
        {ms.revenue.acquisition_revenue.some((a: number) => a > 0) && (
          <>
            {ms.revenue.acquisition_revenue.map((a: number, i: number) => (
              <InputField key={`acq-${i}`} label={`Year ${i + 1} Acq. Revenue`} path={`revenue.acquisition_revenue.${i}`} value={a} suffix="£m" />
            ))}
          </>
        )}
      </Section>

      {/* Margins */}
      <Section title="Margins" defaultOpen={false}>
        <InputField label="Target EBITDA Margin" path="margins.target_ebitda_margin" value={ms.margins.target_ebitda_margin} suffix="%" step={0.01} aiToggleable />
        <InputField label="Trajectory" path="margins.margin_trajectory" value={ms.margins.margin_trajectory} type="select" options={TRAJECTORIES} />
        <InputField label="D&A % Revenue" path="margins.da_pct_revenue" value={ms.margins.da_pct_revenue} suffix="%" step={0.005} />
        <InputField label="Maint. Capex % Rev" path="margins.capex_pct_revenue" value={ms.margins.capex_pct_revenue} suffix="%" step={0.005} />
        <InputField label="NWC % Revenue" path="margins.nwc_pct_revenue" value={ms.margins.nwc_pct_revenue} suffix="%" step={0.01} />
      </Section>

      {/* Costs & Fees */}
      <Section title="Costs & Fees" defaultOpen={false}>
        <InputField label="Entry Fee %" path="fees.entry_fee_pct" value={ms.fees.entry_fee_pct} suffix="%" step={0.005} />
        <InputField label="Exit Fee %" path="fees.exit_fee_pct" value={ms.fees.exit_fee_pct} suffix="%" step={0.005} />
        <InputField label="Monitoring Fee" path="fees.monitoring_fee_annual" value={ms.fees.monitoring_fee_annual} suffix="£m/yr" />
        <InputField label="Financing Fee %" path="fees.financing_fee_pct" value={ms.fees.financing_fee_pct} suffix="%" step={0.005} />
        <InputField label="Transaction Costs" path="fees.transaction_costs" value={ms.fees.transaction_costs} suffix="£m" />
        <InputField label="Tax Rate" path="tax.tax_rate" value={ms.tax.tax_rate} suffix="%" step={0.01} />
        <InputField label="NOL Carryforward" path="tax.nol_carryforward" value={ms.tax.nol_carryforward} suffix="£m" />
      </Section>

      {/* Exit */}
      <Section title="Exit" defaultOpen={false}>
        <InputField label="Holding Period" path="exit.holding_period" value={ms.exit.holding_period} suffix="yrs" min={1} max={10} />
        <InputField label="Exit EBITDA Multiple" path="exit.exit_ebitda_multiple" value={ms.exit.exit_ebitda_multiple} suffix="x" aiToggleable />
        {/* Implied exit multiple context based on margin expansion */}
        {(() => {
          const entryMult = ms.entry.entry_ebitda_multiple;
          const entryMargin = ms.margins.base_ebitda_margin;
          const exitMargin = ms.margins.target_ebitda_margin;
          const marginDelta = exitMargin - entryMargin;
          // Heuristic: multiples expand ~0.5x per 1% of margin improvement, compress ~0.3x per 1% growth deceleration
          const marginEffect = marginDelta * 100 * 0.5;
          const growthY1 = ms.revenue.growth_rates[0] || 0;
          const growthExit = ms.revenue.growth_rates[ms.exit.holding_period - 1] || 0;
          const growthDecel = (growthY1 - growthExit) * 100 * 0.3;
          const impliedExit = Math.max(3, entryMult + marginEffect - growthDecel);
          const userExit = ms.exit.exit_ebitda_multiple;
          const delta = userExit - impliedExit;
          const deltaLabel = delta > 0.3 ? 'aggressive' : delta < -0.3 ? 'conservative' : 'in-line';
          const color = Math.abs(delta) > 1.0 ? '#b91c1c' : 'rgba(17,17,17,0.4)';
          return (
            <div className="mb-2.5 px-2 py-1.5" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.06)' }}>
              <span className="text-[9px] block" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
                Implied exit: {impliedExit.toFixed(1)}x (margin effect {marginEffect >= 0 ? '+' : ''}{marginEffect.toFixed(1)}x, growth decel {growthDecel > 0 ? '−' : '+'}{Math.abs(growthDecel).toFixed(1)}x) · {deltaLabel}
              </span>
            </div>
          );
        })()}
        <InputField label="Exit Method" path="exit.exit_method" value={ms.exit.exit_method} type="select" options={EXIT_METHODS} />
        {/* Mid-Year Convention Toggle */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              Mid-Year Convention
            </label>
            <button
              onClick={() => updateField('exit.mid_year_convention', !ms.exit.mid_year_convention)}
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: ms.exit.mid_year_convention ? '#111111' : 'rgba(17,17,17,0.15)' }}
            >
              <span
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                style={{ left: ms.exit.mid_year_convention ? 16 : 2 }}
              />
            </button>
          </div>
        </div>
        {/* Interim Distributions (Dividend Recaps) */}
        {(ms.exit.interim_distributions || []).some((d: number) => d > 0) || showDistributions ? (
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
                Distributions
              </label>
              <span className="text-[10px]" style={{ color: 'rgba(17,17,17,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
                £m/yr
              </span>
            </div>
            {Array.from({ length: ms.exit.holding_period }, (_, i) => (
              <InputField
                key={`dist-${i}`}
                label={`Year ${i + 1}`}
                path={`exit.interim_distributions.${i}`}
                value={(ms.exit.interim_distributions || [])[i] || 0}
                suffix="£m"
              />
            ))}
          </div>
        ) : (
          <div className="mb-2.5">
            <button
              onClick={() => setShowDistributions(true)}
              className="text-[10px] tracking-wider px-2 py-1 transition-colors hover:bg-[rgba(17,17,17,0.04)]"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", border: '1px dashed rgba(17,17,17,0.15)' }}
            >
              + Add Dividend Recap / Distribution
            </button>
          </div>
        )}
        <InputField label="Exit EV Override" path="exit.exit_ev_override" value={ms.exit.exit_ev_override ?? 0} suffix="£m" />
      </Section>

      {/* MIP */}
      <Section title="MIP" defaultOpen={false}>
        <InputField label="MIP Pool %" path="mip.mip_pool_pct" value={ms.mip.mip_pool_pct} suffix="%" step={0.01} />
        <InputField label="Hurdle MOIC" path="mip.hurdle_moic" value={ms.mip.hurdle_moic} suffix="x" step={0.1} />
        <InputField label="Vesting Years" path="mip.vesting_years" value={ms.mip.vesting_years} suffix="yrs" />
        <InputField label="Sweet Equity %" path="mip.sweet_equity_pct" value={ms.mip.sweet_equity_pct} suffix="%" step={0.01} />
      </Section>
    </div>
  );
};

export default InputPanel;
