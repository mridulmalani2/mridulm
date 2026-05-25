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
const FEE_BASIS = [{ value: 'committed', label: 'committed' }, { value: 'invested', label: 'invested' }];
const WATERFALL = [{ value: 'european', label: 'european' }, { value: 'american', label: 'american' }];

// Sensible institutional defaults applied when fund-level economics are enabled.
// Deal-level IRR/MOIC are unaffected — this only drives the net LP overlay (P4-2).
const DEFAULT_FUND_ASSUMPTIONS = {
  management_fee_pct: 0.02,
  management_fee_basis: 'invested' as const,
  carry_rate: 0.20,
  preferred_return: 0.08,
  carry_waterfall: 'european' as const,
  fund_size: 1000,
  deal_allocation_pct: 0.1,
};

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

  const fa = ms.fund_assumptions;
  const ratchetTiers = ms.mip.ratchet_tiers ?? [];
  const partialExits = ms.exit.partial_exits ?? [];

  const toggleFund = () => {
    updateField('fund_assumptions', fa ? undefined : { ...DEFAULT_FUND_ASSUMPTIONS });
  };
  const addRatchetTier = () => {
    const last = ratchetTiers[ratchetTiers.length - 1];
    const moic = last ? Math.round((last.moic_threshold + 0.5) * 100) / 100 : 2.0;
    updateField('mip.ratchet_tiers', [...ratchetTiers, { moic_threshold: moic, pool_pct: ms.mip.mip_pool_pct || 0.1 }]);
  };
  const removeRatchetTier = (i: number) => {
    const next = ratchetTiers.filter((_, idx) => idx !== i);
    updateField('mip.ratchet_tiers', next.length ? next : undefined);
  };
  const addPartialExit = () => {
    const yr = Math.max(1, Math.min(ms.exit.holding_period - 1, partialExits.length ? partialExits[partialExits.length - 1].year + 1 : Math.ceil(ms.exit.holding_period / 2)));
    updateField('exit.partial_exits', [...partialExits, { year: yr, pct_sold: 0.2, exit_multiple: ms.exit.exit_ebitda_multiple, exit_fee_pct: ms.fees.exit_fee_pct }]);
  };
  const removePartialExit = (i: number) => {
    const next = partialExits.filter((_, idx) => idx !== i);
    updateField('exit.partial_exits', next.length ? next : undefined);
  };

  // ── Per-tranche advanced inputs (A2: PIK toggle, refinancing, OID) ──
  const togglePikElection = (i: number) => {
    const t = ms.debt_tranches[i];
    if (t.pik_toggle) {
      updateField(`debt_tranches.${i}.pik_toggle`, false);
    } else {
      // Default every year to PIK (true) — preserves always-PIK behaviour until edited.
      const arr = Array.from({ length: ms.exit.holding_period }, (_, k) => t.pik_election_by_year?.[k] ?? true);
      updateField(`debt_tranches.${i}`, { ...t, pik_toggle: true, pik_election_by_year: arr });
    }
  };
  const setPikElectionYear = (i: number, yr: number, pik: boolean) => {
    const t = ms.debt_tranches[i];
    const arr = Array.from({ length: ms.exit.holding_period }, (_, k) => (k === yr ? pik : (t.pik_election_by_year?.[k] ?? true)));
    updateField(`debt_tranches.${i}.pik_election_by_year`, arr);
  };
  const toggleRefi = (i: number) => {
    const t = ms.debt_tranches[i];
    if (t.refinancing) {
      updateField(`debt_tranches.${i}.refinancing`, undefined);
    } else {
      updateField(`debt_tranches.${i}.refinancing`, {
        year: Math.max(1, Math.min(ms.exit.holding_period, Math.ceil(ms.exit.holding_period / 2))),
        new_spread: t.rate_type === 'fixed' ? t.interest_rate : t.spread,
        new_floor: t.floor,
        prepayment_premium: 0.01,
        extend_maturity_by: 0,
      });
    }
  };

  // ── Credit covenants & working capital (A3) ──
  const cov = ms.credit_covenants;
  const cashTrapOn = cov.distribution_block_leverage != null || cov.distribution_block_dscr != null;
  const springingOn = cov.springing_dscr_covenant != null || cov.springing_utilization_threshold != null;
  const daysNwcOn = ms.margins.nwc_dso != null || ms.margins.nwc_dio != null || ms.margins.nwc_dpo != null;

  const toggleCashTrap = () => {
    const next = { ...cov };
    if (cashTrapOn) {
      delete next.distribution_block_leverage;
      delete next.distribution_block_dscr;
    } else {
      next.distribution_block_leverage = cov.leverage_covenant;
      next.distribution_block_dscr = cov.dscr_covenant;
    }
    updateField('credit_covenants', next);
  };
  const toggleSpringing = () => {
    const next = { ...cov };
    if (springingOn) {
      delete next.springing_dscr_covenant;
      delete next.springing_utilization_threshold;
    } else {
      next.springing_dscr_covenant = Math.round((cov.dscr_covenant + 0.1) * 100) / 100;
      next.springing_utilization_threshold = 0.35;
    }
    updateField('credit_covenants', next);
  };
  const toggleDaysNwc = () => {
    const next = { ...ms.margins };
    if (daysNwcOn) {
      delete next.nwc_dso;
      delete next.nwc_dio;
      delete next.nwc_dpo;
    } else {
      next.nwc_dso = 45;
      next.nwc_dio = 60;
      next.nwc_dpo = 45;
    }
    updateField('margins', next);
  };

  const csym = ({ GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' } as Record<string, string>)[ms.currency ?? 'GBP'] ?? '£';
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
        <InputField label="LTM Revenue" path="revenue.base_revenue" value={ms.revenue.base_revenue} suffix={`${csym}m`} />
        <InputField label="EBITDA Margin" path="margins.base_ebitda_margin" value={ms.margins.base_ebitda_margin} suffix="%" step={0.01} />
        <InputField label="Entry EBITDA Multiple" path="entry.entry_ebitda_multiple" value={ms.entry.entry_ebitda_multiple} suffix="x" warning={entryMultWarn} />
        <InputField label="Enterprise Value" path="entry.enterprise_value" value={ms.entry.enterprise_value} suffix={`${csym}m`} formatter={(v) => v.toFixed(1)} />
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
            <InputField label="Principal" path={`debt_tranches.${i}.principal`} value={t.principal} suffix={`${csym}m`} />
            <InputField label="Rate Type" path={`debt_tranches.${i}.rate_type`} value={t.rate_type} type="select" options={[{ value: 'fixed', label: 'Fixed' }, { value: 'floating', label: 'Floating' }]} />
            <InputField label="Interest Rate" path={`debt_tranches.${i}.interest_rate`} value={t.interest_rate} suffix="%" step={0.005} />
            <InputField label="Amortization" path={`debt_tranches.${i}.amortization_type`} value={t.amortization_type} type="select" options={AMORT_TYPES} />

            {/* OID (P4-14) */}
            <InputField label="OID %" path={`debt_tranches.${i}.oid_pct`} value={t.oid_pct ?? 0} suffix="%" step={0.005} />
            {(t.oid_pct ?? 0) > 0 && (
              <InputField label="OID Maturity" path={`debt_tranches.${i}.debt_maturity_years`} value={t.debt_maturity_years ?? ms.exit.holding_period} suffix="yrs" />
            )}

            {/* PIK election (P4-4) — only meaningful for a PIK-amortising tranche */}
            {t.amortization_type === 'PIK' && (
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
                    PIK Election (per yr)
                  </label>
                  <button
                    onClick={() => togglePikElection(i)}
                    className="relative w-8 h-4 rounded-full transition-colors"
                    style={{ background: t.pik_toggle ? '#111111' : 'rgba(17,17,17,0.15)' }}
                    title="Elect PIK or cash-pay per year. Off = always PIK."
                  >
                    <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: t.pik_toggle ? 16 : 2 }} />
                  </button>
                </div>
                {t.pik_toggle && (
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: ms.exit.holding_period }, (_, yr) => {
                      const pik = t.pik_election_by_year?.[yr] ?? true;
                      return (
                        <button
                          key={yr}
                          onClick={() => setPikElectionYear(i, yr, !pik)}
                          className="px-1.5 py-0.5 text-[9px] transition-colors"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: pik ? '#b45309' : '#15803d', border: `1px solid ${pik ? 'rgba(180,83,9,0.4)' : 'rgba(21,128,61,0.4)'}` }}
                          title={`Year ${yr + 1}: ${pik ? 'PIK (accrue)' : 'Cash pay'} — click to flip`}
                        >
                          {yr + 1}:{pik ? 'PIK' : 'Cash'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Refinancing (P4-3) */}
            <div className="mb-1">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
                  Refinance Tranche
                </label>
                <button
                  onClick={() => toggleRefi(i)}
                  className="relative w-8 h-4 rounded-full transition-colors"
                  style={{ background: t.refinancing ? '#111111' : 'rgba(17,17,17,0.15)' }}
                  title="Reprice the tranche from the refi year, charge a prepayment premium, optionally extend maturity."
                >
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: t.refinancing ? 16 : 2 }} />
                </button>
              </div>
              {t.refinancing && (
                <>
                  <InputField label="Refi Year" path={`debt_tranches.${i}.refinancing.year`} value={t.refinancing.year} suffix="yr" />
                  <InputField label={t.rate_type === 'fixed' ? 'New All-in Rate' : 'New Spread'} path={`debt_tranches.${i}.refinancing.new_spread`} value={t.refinancing.new_spread} suffix="%" step={0.005} />
                  {t.rate_type === 'floating' && (
                    <InputField label="New Floor" path={`debt_tranches.${i}.refinancing.new_floor`} value={t.refinancing.new_floor} suffix="%" step={0.005} />
                  )}
                  <InputField label="Prepayment Premium" path={`debt_tranches.${i}.refinancing.prepayment_premium`} value={t.refinancing.prepayment_premium} suffix="%" step={0.005} />
                  <InputField label="Extend Maturity" path={`debt_tranches.${i}.refinancing.extend_maturity_by`} value={t.refinancing.extend_maturity_by} suffix="yrs" />
                </>
              )}
            </div>
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
              <InputField key={`acq-${i}`} label={`Year ${i + 1} Acq. Revenue`} path={`revenue.acquisition_revenue.${i}`} value={a} suffix={`${csym}m`} />
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

        {/* Days-based working capital (P4-9) — overrides the % peg when on */}
        <div className="mb-2.5 mt-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              Days-Based NWC (DSO/DIO/DPO)
            </label>
            <button
              onClick={toggleDaysNwc}
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: daysNwcOn ? '#111111' : 'rgba(17,17,17,0.15)' }}
              title="Model NWC from first principles (A/R, inventory, A/P). Overrides the NWC % peg above."
            >
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: daysNwcOn ? 16 : 2 }} />
            </button>
          </div>
          {daysNwcOn && (
            <div className="mt-2">
              <InputField label="DSO (days sales outstanding)" path="margins.nwc_dso" value={ms.margins.nwc_dso ?? 45} suffix="days" step={1} />
              <InputField label="DIO (days inventory)" path="margins.nwc_dio" value={ms.margins.nwc_dio ?? 60} suffix="days" step={1} />
              <InputField label="DPO (days payable)" path="margins.nwc_dpo" value={ms.margins.nwc_dpo ?? 45} suffix="days" step={1} />
            </div>
          )}
        </div>
      </Section>

      {/* Costs & Fees */}
      <Section title="Costs & Fees" defaultOpen={false}>
        <InputField label="Entry Fee %" path="fees.entry_fee_pct" value={ms.fees.entry_fee_pct} suffix="%" step={0.005} />
        <InputField label="Exit Fee %" path="fees.exit_fee_pct" value={ms.fees.exit_fee_pct} suffix="%" step={0.005} />
        <InputField label="Monitoring Fee" path="fees.monitoring_fee_annual" value={ms.fees.monitoring_fee_annual} suffix={`${csym}m/yr`} />
        {ms.fees.monitoring_fee_annual > 0 && (
          <>
            <InputField label="Monitoring Term. Years" path="fees.monitoring_fee_termination_years" value={ms.fees.monitoring_fee_termination_years ?? 0} suffix="yrs" />
            <InputField label="Monitoring Disc. Rate" path="fees.monitoring_fee_discount_rate" value={ms.fees.monitoring_fee_discount_rate ?? 0.10} suffix="%" step={0.01} />
          </>
        )}
        <InputField label="Financing Fee %" path="fees.financing_fee_pct" value={ms.fees.financing_fee_pct} suffix="%" step={0.005} />
        <InputField label="Transaction Costs" path="fees.transaction_costs" value={ms.fees.transaction_costs} suffix={`${csym}m`} />
        <InputField label="Tax Rate" path="tax.tax_rate" value={ms.tax.tax_rate} suffix="%" step={0.01} />
        <InputField label="NOL Carryforward" path="tax.nol_carryforward" value={ms.tax.nol_carryforward} suffix={`${csym}m`} />
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
                {csym}m/yr
              </span>
            </div>
            {Array.from({ length: ms.exit.holding_period }, (_, i) => (
              <InputField
                key={`dist-${i}`}
                label={`Year ${i + 1}`}
                path={`exit.interim_distributions.${i}`}
                value={(ms.exit.interim_distributions || [])[i] || 0}
                suffix={`${csym}m`}
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
        <InputField label="Exit EV Override" path="exit.exit_ev_override" value={ms.exit.exit_ev_override ?? 0} suffix={`${csym}m`} />

        {/* Partial Exits / IPO selldown (P4-5) */}
        <div className="mb-2 mt-1">
          <label className="text-[10px] tracking-wider block mb-1" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
            Partial Exits / Selldown
          </label>
          {partialExits.map((e, i) => (
            <div key={i} className="mb-3 p-3 relative" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
              <button
                onClick={() => removePartialExit(i)}
                className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-xs transition-colors hover:bg-[rgba(17,17,17,0.08)]"
                style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(17,17,17,0.12)' }}
                title="Remove partial exit"
              >
                ×
              </button>
              <InputField label="Year" path={`exit.partial_exits.${i}.year`} value={e.year} suffix="yr" />
              <InputField label="% of Stake Sold" path={`exit.partial_exits.${i}.pct_sold`} value={e.pct_sold} suffix="%" step={0.05} />
              <InputField label="Exit Multiple" path={`exit.partial_exits.${i}.exit_multiple`} value={e.exit_multiple} suffix="x" step={0.5} />
              <InputField label="Exit Fee %" path={`exit.partial_exits.${i}.exit_fee_pct`} value={e.exit_fee_pct} suffix="%" step={0.005} />
            </div>
          ))}
          <button
            onClick={addPartialExit}
            className="text-[10px] tracking-wider px-2 py-1 transition-colors hover:bg-[rgba(17,17,17,0.04)]"
            style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", border: '1px dashed rgba(17,17,17,0.15)' }}
          >
            + Add Partial Exit
          </button>
        </div>
      </Section>

      {/* MIP */}
      <Section title="MIP" defaultOpen={false}>
        <InputField label="MIP Pool %" path="mip.mip_pool_pct" value={ms.mip.mip_pool_pct} suffix="%" step={0.01} />
        <InputField label="Hurdle MOIC" path="mip.hurdle_moic" value={ms.mip.hurdle_moic} suffix="x" step={0.1} />
        <InputField label="Vesting Years" path="mip.vesting_years" value={ms.mip.vesting_years} suffix="yrs" />
        <InputField label="Sweet Equity %" path="mip.sweet_equity_pct" value={ms.mip.sweet_equity_pct} suffix="%" step={0.01} />

        {/* Ratchet tiers (P4-1) — when present, the highest cleared tier overrides the single hurdle above */}
        <div className="mb-2 mt-1">
          <label className="text-[10px] tracking-wider block mb-1" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
            Ratchet Tiers
          </label>
          {ratchetTiers.length > 0 && (
            <p className="text-[9px] mb-2" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
              Highest cleared MOIC tier overrides the single hurdle above.
            </p>
          )}
          {ratchetTiers.map((t, i) => (
            <div key={i} className="mb-3 p-3 relative" style={{ background: '#F9F9F7', border: '1px solid rgba(17,17,17,0.08)' }}>
              <button
                onClick={() => removeRatchetTier(i)}
                className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-xs transition-colors hover:bg-[rgba(17,17,17,0.08)]"
                style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace", border: '1px solid rgba(17,17,17,0.12)' }}
                title="Remove tier"
              >
                ×
              </button>
              <InputField label={`Tier ${i + 1} MOIC Hurdle`} path={`mip.ratchet_tiers.${i}.moic_threshold`} value={t.moic_threshold} suffix="x" step={0.1} />
              <InputField label="Pool %" path={`mip.ratchet_tiers.${i}.pool_pct`} value={t.pool_pct} suffix="%" step={0.01} />
            </div>
          ))}
          <button
            onClick={addRatchetTier}
            className="text-[10px] tracking-wider px-2 py-1 transition-colors hover:bg-[rgba(17,17,17,0.04)]"
            style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", border: '1px dashed rgba(17,17,17,0.15)' }}
          >
            + Add Ratchet Tier
          </button>
        </div>
      </Section>

      {/* Fund Economics (P4-2) — optional LP-level overlay */}
      <Section title="Fund Economics" defaultOpen={false}>
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              Model Fund-Level LP Returns
            </label>
            <button
              onClick={toggleFund}
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: fa ? '#111111' : 'rgba(17,17,17,0.15)' }}
              title="Adds a net LP returns overlay (mgmt fee + carry over preferred). Deal-level IRR/MOIC are unaffected."
            >
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: fa ? 16 : 2 }} />
            </button>
          </div>
        </div>
        {fa && (
          <>
            <InputField label="Mgmt Fee % p.a." path="fund_assumptions.management_fee_pct" value={fa.management_fee_pct} suffix="%" step={0.005} />
            <InputField label="Fee Basis" path="fund_assumptions.management_fee_basis" value={fa.management_fee_basis} type="select" options={FEE_BASIS} />
            <InputField label="Carry Rate" path="fund_assumptions.carry_rate" value={fa.carry_rate} suffix="%" step={0.01} />
            <InputField label="Preferred Return" path="fund_assumptions.preferred_return" value={fa.preferred_return} suffix="%" step={0.01} />
            <InputField label="Waterfall" path="fund_assumptions.carry_waterfall" value={fa.carry_waterfall} type="select" options={WATERFALL} />
            <InputField label="Fund Size" path="fund_assumptions.fund_size" value={fa.fund_size} suffix={`${csym}m`} />
            <InputField label="Deal Allocation %" path="fund_assumptions.deal_allocation_pct" value={fa.deal_allocation_pct} suffix="%" step={0.01} />
          </>
        )}
      </Section>

      {/* Credit Covenants (P2-4 scalars, P4-8 springing, P4-10 recovery, P4-13 cash trap) */}
      <Section title="Credit Covenants" defaultOpen={false}>
        <InputField label="Leverage Covenant (max)" path="credit_covenants.leverage_covenant" value={cov.leverage_covenant} suffix="x" step={0.25} />
        <InputField label="DSCR Covenant (min)" path="credit_covenants.dscr_covenant" value={cov.dscr_covenant} suffix="x" step={0.05} />
        <InputField label="FCCR Covenant (min)" path="credit_covenants.fccr_covenant" value={cov.fccr_covenant} suffix="x" step={0.05} />

        {/* Cash trap / restricted payments (P4-13) */}
        <div className="mb-2.5 mt-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              Cash Trap (block distributions)
            </label>
            <button
              onClick={toggleCashTrap}
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: cashTrapOn ? '#111111' : 'rgba(17,17,17,0.15)' }}
              title="Block interim distributions when leverage exceeds / DSCR falls below the trigger."
            >
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: cashTrapOn ? 16 : 2 }} />
            </button>
          </div>
          {cashTrapOn && (
            <div className="mt-2">
              <InputField label="Block if Leverage >" path="credit_covenants.distribution_block_leverage" value={cov.distribution_block_leverage ?? cov.leverage_covenant} suffix="x" step={0.25} />
              <InputField label="Block if DSCR <" path="credit_covenants.distribution_block_dscr" value={cov.distribution_block_dscr ?? cov.dscr_covenant} suffix="x" step={0.05} />
            </div>
          )}
        </div>

        {/* Springing DSCR covenant (P4-8) */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] tracking-wider" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
              Springing DSCR (revolver-drawn)
            </label>
            <button
              onClick={toggleSpringing}
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: springingOn ? '#111111' : 'rgba(17,17,17,0.15)' }}
              title="A tighter DSCR test that applies only when revolver utilisation exceeds the threshold."
            >
              <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: springingOn ? 16 : 2 }} />
            </button>
          </div>
          {springingOn && (
            <div className="mt-2">
              <InputField label="Springing DSCR (min)" path="credit_covenants.springing_dscr_covenant" value={cov.springing_dscr_covenant ?? cov.dscr_covenant} suffix="x" step={0.05} />
              <InputField label="Revolver Util. Trigger" path="credit_covenants.springing_utilization_threshold" value={cov.springing_utilization_threshold ?? 0.35} suffix="%" step={0.05} />
            </div>
          )}
        </div>

        {/* Recovery haircuts (P4-10) — defaults used when blank */}
        <label className="text-[10px] tracking-wider block mb-1" style={{ color: 'rgba(17,17,17,0.45)', fontFamily: "'JetBrains Mono', monospace" }}>
          Recovery Haircuts (distressed)
        </label>
        <InputField label="EBITDA Haircut" path="credit_covenants.recovery_ebitda_haircut" value={cov.recovery_ebitda_haircut ?? 0.40} suffix="%" step={0.05} />
        <InputField label="Multiple Haircut" path="credit_covenants.recovery_multiple_haircut" value={cov.recovery_multiple_haircut ?? 0.50} suffix="%" step={0.05} />
        <InputField label="Distressed Cost %" path="credit_covenants.recovery_distressed_cost_pct" value={cov.recovery_distressed_cost_pct ?? 0.10} suffix="%" step={0.05} />
      </Section>
    </div>
  );
};

export default InputPanel;
