import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import InputField from './InputField';

const SECTORS = [
  'Technology', 'Healthcare', 'Industrials', 'Consumer',
  'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other',
].map((s) => ({ value: s, label: s }));

const CURRENCIES = ['GBP', 'EUR', 'USD', 'CHF'].map((c) => ({ value: c, label: c }));
const TRAJECTORIES = ['linear', 'front_loaded', 'back_loaded', 'step'].map((t) => ({ value: t, label: t.replace('_', ' ') }));
const EXIT_METHODS = ['strategic', 'secondary_buyout', 'ipo', 'recapitalization'].map((m) => ({ value: m, label: m.replace('_', ' ') }));
const AMORT_TYPES = ['bullet', 'straight_line', 'cash_sweep', 'PIK'].map((a) => ({ value: a, label: a.replace('_', ' ') }));

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1" style={{ borderBottom: '1px solid #1e2a3a' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-medium tracking-widest uppercase" style={{ color: '#6b7a96', fontFamily: 'Inter, sans-serif' }}>
          {title}
        </span>
        <span className="text-xs" style={{ color: '#3d4f6a' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

const InputPanel: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);

  if (!ms) return null;

  const entryMultWarn = ms.entry.entry_ebitda_multiple > 15 ? 'High entry — flag for IC' : undefined;
  const levWarn = ms.entry.leverage_ratio > 7 ? 'Covenant breach risk' : undefined;

  return (
    <div
      className="h-full overflow-y-auto flex-shrink-0"
      style={{ width: 320, background: '#0f1420', borderRight: '1px solid #1e2a3a' }}
    >
      {/* Entry */}
      <Section title="Entry">
        <InputField label="Deal Name" path="deal_name" value={ms.deal_name} type="text" />
        <InputField label="Sector" path="sector" value={ms.sector} type="select" options={SECTORS} />
        <InputField label="Currency" path="currency" value={ms.currency} type="select" options={CURRENCIES} />
        <InputField label="LTM Revenue" path="revenue.base_revenue" value={ms.revenue.base_revenue} suffix="£m" />
        <InputField label="EBITDA Margin" path="margins.base_ebitda_margin" value={ms.margins.base_ebitda_margin} suffix="%" step={0.01} />
        <InputField label="Entry EBITDA Multiple" path="entry.entry_ebitda_multiple" value={ms.entry.entry_ebitda_multiple} suffix="x" warning={entryMultWarn} />
        <InputField label="Enterprise Value" path="entry.enterprise_value" value={ms.entry.enterprise_value} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
        <InputField label="Revenue Multiple" path="entry.entry_revenue_multiple" value={ms.entry.entry_revenue_multiple} suffix="x" readOnly formatter={(v) => v.toFixed(1)} />
        <InputField label="Equity Check" path="entry.equity_check" value={ms.entry.equity_check} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
      </Section>

      {/* Debt Structure */}
      <Section title="Debt Structure" defaultOpen={false}>
        {ms.debt_tranches.map((t, i) => (
          <div key={i} className="mb-3 p-2" style={{ background: '#0a0d13', border: '1px solid #1e2a3a' }}>
            <InputField label="Name" path={`debt_tranches.${i}.name`} value={t.name} type="text" />
            <InputField label="Principal" path={`debt_tranches.${i}.principal`} value={t.principal} suffix="£m" />
            <InputField label="Rate Type" path={`debt_tranches.${i}.rate_type`} value={t.rate_type} type="select" options={[{ value: 'fixed', label: 'Fixed' }, { value: 'floating', label: 'Floating' }]} />
            <InputField label="Interest Rate" path={`debt_tranches.${i}.interest_rate`} value={t.interest_rate} suffix="%" step={0.005} />
            <InputField label="Amortization" path={`debt_tranches.${i}.amortization_type`} value={t.amortization_type} type="select" options={AMORT_TYPES} />
          </div>
        ))}
        <InputField label="Total Debt" path="" value={ms.entry.total_debt_raised} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
        <InputField label="Leverage" path="entry.leverage_ratio" value={ms.entry.leverage_ratio} suffix="x" readOnly warning={levWarn} formatter={(v) => v.toFixed(1)} />
      </Section>

      {/* Revenue */}
      <Section title="Revenue" defaultOpen={false}>
        {ms.revenue.growth_rates.map((g, i) => (
          <InputField key={i} label={`Year ${i + 1} Growth`} path={`revenue.growth_rates.${i}`} value={g} suffix="%" step={0.01} aiToggleable />
        ))}
        <InputField label="Churn Rate" path="revenue.churn_rate" value={ms.revenue.churn_rate} suffix="%" step={0.01} />
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
        <InputField label="Exit Method" path="exit.exit_method" value={ms.exit.exit_method} type="select" options={EXIT_METHODS} />
        <InputField label="Exit EV" path="exit.exit_ev" value={ms.exit.exit_ev} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
        <InputField label="Exit Net Debt" path="exit.exit_net_debt" value={ms.exit.exit_net_debt} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
        <InputField label="Exit Equity" path="exit.exit_equity" value={ms.exit.exit_equity} suffix="£m" readOnly formatter={(v) => v.toFixed(1)} />
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
