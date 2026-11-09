/**
 * v2 AssumptionsPanel — v2.0.0 "blank until entered" (owner rule 2026-11-09).
 *
 * Every model input lives here, grouped like an LBO model's input sheet. Nothing is
 * pre-filled: a blank field is UNSET (red edge) and gates Build; a choice is "choose…" until
 * made; switching a feature on brings its fields in BLANK — no invented terms, ramps or
 * defaults. Where the suggestion catalogue has a cited/fact/history proposal for a field, a
 * one-click chip offers it with its basis. Every operating line can be a §7 driver OR entered
 * exactly as the case states it (§24), and the §25 flow-to-equity valuation has its inputs here.
 */
import React from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { setPath } from '../../../lib/engine2/draft';
import type {
  CashPayTrancheAssumption, DealAssumptions, ForecastLines, FundOverlayAssumption, LineSpec,
  PikNoteAssumption, RefinancingEvent, RevolverAssumption, TrancheAssumption, TranchePricing,
} from '../../../lib/engine2/types';
import { ChoiceField, Label, labelStyle, mono, NumBox, NumField, Section, SmallButton, SuggestionChips, YearGrid, isSet } from './fields';
import { entryGrossLeverageFromAssumptions } from '../../../lib/engine2/sourcesUses';
import { allInRate } from '../../../lib/engine2/kernel/rates';
import { multiple, toPctInput } from '../../../lib/format';
import { sizingBasisLabel } from '../../../lib/engine2/display';

const U = Number.NaN;
const blanks = (n: number) => Array.from({ length: n }, () => U);
const EMPTY_LINES: ForecastLines = { revenue: null, ebitda: null, da: null, capex: null, delta_nwc: null, year_n_plus_1_growth: null };

type LineKey = 'revenue' | 'ebitda' | 'da' | 'capex' | 'delta_nwc';

const AssumptionsPanel: React.FC = () => {
  const facts = useEngine2Model((s) => s.facts);
  const a = useEngine2Model((s) => s.assumptions);
  const pending = useEngine2Model((s) => s.pending);
  const edit = useEngine2Model((s) => s.editAssumptions);
  const editWithChoices = useEngine2Model((s) => s.editWithChoices);
  const setHold = useEngine2Model((s) => s.setHoldYears);
  if (!facts) return null;

  if (!a) {
    return (
      <Section title="Start" note="The holding period sizes every per-year input, so it comes first.">
        <div className="flex items-center justify-between gap-2">
          <Label>Holding period</Label>
          <NumBox value={null} unit="years" ariaLabel="Holding period" onCommit={(v) => setHold(v)} />
        </div>
      </Section>
    );
  }

  const N = a.entry.hold_years;
  const hasLtm = facts.fy_ebitda !== null && facts.fy_ebitda > 0;
  const set = (next: DealAssumptions, paths: string[]) => edit(next, paths);
  const at = (path: string, value: unknown) => setPath<DealAssumptions>(a, path, value);

  // ── forecast-line helpers ───────────────────────────────────────────────────────────
  const lines = a.operations.lines;
  const setLine = (key: LineKey, spec: ForecastLines[LineKey]) => {
    const next: ForecastLines = { ...(lines ?? EMPTY_LINES), [key]: spec } as ForecastLines;
    const allDriver = (['revenue', 'ebitda', 'da', 'capex', 'delta_nwc'] as LineKey[]).every((k) => next[k] === null);
    set({ ...a, operations: { ...a.operations, lines: allDriver ? null : next } }, [`operations.lines.${key}`]);
  };
  const spec = (mode: 'explicit' | 'grown'): LineSpec => (mode === 'explicit' ? { mode, values: blanks(N) } : { mode, year1: U, growth: blanks(N - 1) });
  const LineValues: React.FC<{ k: LineKey; s: LineSpec; label: string }> = ({ k, s, label }) =>
    s.mode === 'explicit' ? (
      <YearGrid path={`operations.lines.${k}.values`} label={`${label} by year`} unit="money" values={s.values} />
    ) : (
      <>
        <NumField path={`operations.lines.${k}.year1`} label={`${label}: year-1 amount`} unit="money" value={s.year1} />
        {N > 1 && <YearGrid path={`operations.lines.${k}.growth`} label={`${label}: growth`} unit="pct" values={s.growth} from={2} />}
      </>
    );

  // ── debt helpers ─────────────────────────────────────────────────────────────────────
  const tranches = a.structure.tranches;
  const termCount = tranches.filter((t) => t.type !== 'revolver').length;
  const hasRevolver = tranches.some((t) => t.type === 'revolver');
  const addTranche = (t: TrancheAssumption) => {
    const i = tranches.length;
    editWithChoices(
      { ...a, structure: { ...a.structure, tranches: [...tranches, t] } },
      ['structure.tranches'],
      t.type === 'revolver' ? [] : [`structure.tranches.${i}.sweep.participates`],
    );
  };
  const newTerm = (type: CashPayTrancheAssumption['type'], floating: boolean): CashPayTrancheAssumption => ({
    name: `${type === 'senior' ? 'Term loan' : type === 'unitranche' ? 'Unitranche' : 'Mezzanine'} ${termCount + 1}`,
    type, size: { amount: U },
    pricing: floating ? { kind: 'floating', base_rate: U, spread: U, floor: U } : { kind: 'fixed', rate: U },
    amort_pct_of_face: U, maturity_years: U, oid_pct: U, sweep: { participates: false, priority: U },
  });
  const removeTranche = (i: number) => {
    const next = tranches.filter((_, j) => j !== i);
    // re-key every tranche-indexed pending choice after the removed one (indices shift down)
    const shifted = pending
      .filter((p) => p.startsWith('structure.tranches.'))
      .map((p) => {
        const m = /^structure\.tranches\.(\d+)\.(.*)$/.exec(p);
        if (!m) return p;
        const j = Number(m[1]);
        return j === i ? null : j > i ? `structure.tranches.${j - 1}.${m[2]}` : p;
      })
      .filter((p): p is string => p !== null);
    editWithChoices({ ...a, structure: { ...a.structure, tranches: next, refinancing: (a.structure.refinancing ?? []).filter((r) => r.tranche_name !== tranches[i].name) || null } },
      ['structure.tranches'], shifted, ['structure.tranches']);
  };
  const pricingFields = (base: string, p: TranchePricing, who: string) =>
    p.kind === 'fixed' ? (
      <NumField path={`${base}.rate`} label={`${who}: fixed rate`} unit="pct" value={p.rate} />
    ) : (
      <>
        <NumField path={`${base}.base_rate`} label={`${who}: base rate`} unit="pct" value={p.base_rate} hint="e.g. term SOFR / EURIBOR for the deal date" />
        <NumField path={`${base}.floor`} label={`${who}: base-rate floor`} unit="pct" value={p.floor} />
        <NumField path={`${base}.spread`} label={`${who}: spread`} unit="pct" value={p.spread} />
      </>
    );
  const sizeFields = (base: string, size: { x_ebitda?: number; amount?: number }, who: string, what = "size") => {
    const isX = size.x_ebitda !== undefined;
    return (
      <>
        <div className="flex items-center justify-between gap-2 mb-2">
          <Label>{who}: {what} basis</Label>
          <select aria-label={`${who} ${what} basis`} value={isX ? 'x' : 'amt'} className="px-1 py-1 text-[11px]"
            style={{ fontFamily: mono, border: '1px solid rgba(17,17,17,0.14)' }}
            onChange={(e) => set(at(base, e.target.value === 'x' ? { x_ebitda: U } : { amount: U }), [base])}>
            <option value="amt">amount</option>
            {hasLtm && <option value="x">× historical EBITDA</option>}
          </select>
        </div>
        {isX
          ? <NumField path={`${base}.x_ebitda`} label={`${who}: ${what} (× EBITDA)`} unit="mult" value={size.x_ebitda} />
          : <NumField path={`${base}.amount`} label={`${who}: ${what} (amount)`} unit="money" value={size.amount} />}
      </>
    );
  };

  // ── feature toggles (each brings its fields in BLANK) ────────────────────────────────
  const Toggle: React.FC<{ on: boolean; label: string; onOn: () => void; onOff: () => void; hint?: string }> = ({ on, label, onOn, onOff, hint }) => (
    <label className="flex items-center justify-between gap-2 mb-2 cursor-pointer" title={hint}>
      <Label>{label}</Label>
      <input type="checkbox" aria-label={label} checked={on} onChange={(e) => (e.target.checked ? onOn() : onOff())} />
    </label>
  );

  const fund = a.fund;
  const v = a.valuation;
  // which §7 drivers the facts can support (§24.3 R1–R3) — an unsupported driver is never offered
  const revenueAvailable = lines?.revenue ? lines.revenue.mode !== 'not_modelled' : facts.fy_revenue !== null;
  const marginDriverOk = facts.fy_ebitda_margin !== null && revenueAvailable;
  const nwcDriverOk = facts.fy_revenue !== null && revenueAvailable;

  return (
    <div>
      {/* ═══ 1. Transaction ═══ */}
      <Section title="1 · Transaction">
        <NumField path="entry.hold_years" label="Holding period" unit="years" value={N} onCommit={(x) => setHold(x)} />
        <ChoiceField path="entry.driver" label="Entry priced by" value={a.entry.driver}
          options={[{ value: 'multiple', label: 'multiple × EBITDA' }, { value: 'ev', label: 'purchase price (EV)' }]}
          onChoose={(d) => set({ ...a, entry: { ...a.entry, driver: d, entry_multiple: d === 'multiple' ? U : null, enterprise_value: d === 'ev' ? U : null } }, ['entry.driver'])} />
        {a.entry.driver === 'multiple'
          ? <NumField path="entry.entry_multiple" label="Entry multiple" unit="mult" value={a.entry.entry_multiple} />
          : <NumField path="entry.enterprise_value" label="Purchase price (enterprise value)" unit="money" value={a.entry.enterprise_value} />}
        {facts.implied_trading_ev_ebitda !== null && (
          <p className="text-[10px] mb-2 text-right" style={labelStyle}>
            trades at ~{multiple(facts.implied_trading_ev_ebitda)} {sizingBasisLabel(facts.sizing_basis)} EBITDA (read-only anchor)
          </p>
        )}
        <ChoiceField path="entry.basis" label="Entry multiple basis" value={a.entry.basis}
          options={[...(hasLtm ? [{ value: 'fy' as const, label: `${facts.sizing_basis === 'LTM' ? 'LTM' : 'FY'} (historical)` }] : []), { value: 'ntm' as const, label: 'NTM (forecast year 1)' }]} />
        <NumField path="exit.multiple" label="Exit multiple" unit="mult" value={a.exit.multiple} />
        <ChoiceField path="exit.basis" label="Exit multiple basis" value={a.exit.basis}
          options={[{ value: 'fy', label: 'exit-year EBITDA' }, { value: 'ntm', label: 'year N+1 EBITDA' }]} />
        <NumField path="exit.fees_pct" label="Exit fees (% of exit EV)" unit="pct" value={a.exit.fees_pct} />
        <NumField path="fees.transaction_pct_of_ev" label="Transaction costs (% of EV)" unit="pct" value={a.fees.transaction_pct_of_ev} />
        {tranches.length > 0 && <NumField path="fees.financing_pct_of_commitments" label="Financing fees (% of commitments)" unit="pct" value={a.fees.financing_pct_of_commitments} />}
        <NumField path="structure.min_cash" label="Minimum cash (funded at close)" unit="money" value={a.structure.min_cash} />
        <NumField path="rollover_equity" label="Rollover equity (0 if none)" unit="money" value={a.rollover_equity} />
      </Section>

      {/* ═══ 2. Debt ═══ */}
      <Section title="2 · Debt" note="Add each tranche as the term sheet states it. Interest accrues on the opening balance; the sweep runs after mandatory amortization, by priority.">
        {pending.includes('structure.tranches') && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px]" style={{ ...labelStyle, color: '#CC0000' }}>add tranches, or confirm an all-equity deal</span>
            <SmallButton onClick={() => editWithChoices({ ...a, structure: { ...a.structure, tranches: [] } }, ['structure.tranches'], [])}>no debt</SmallButton>
          </div>
        )}
        <SuggestionChips path="structure.tranches" render={() => 'the cited tranche template'} />
        {tranches.map((t, i) => {
          const base = `structure.tranches.${i}`;
          return (
            <div key={i} className="mb-3 p-2" style={{ border: '1px solid rgba(17,17,17,0.08)' }}>
              <div className="flex items-center justify-between mb-2">
                <input aria-label={`tranche ${i + 1} name`} value={t.name} className="text-[11px] px-1 py-0.5" style={{ fontFamily: mono, border: '1px solid rgba(17,17,17,0.12)' }}
                  onChange={(e) => set(at(`${base}.name`, e.target.value), [`${base}.name`])} />
                <span className="flex gap-1 items-center">
                  <span className="text-[9px]" style={labelStyle}>{t.type.replace('_', ' ')}</span>
                  <SmallButton danger onClick={() => removeTranche(i)}>remove</SmallButton>
                </span>
              </div>
              {t.type === 'revolver' ? (
                <>
                  {sizeFields(`${base}.commitment`, t.commitment, t.name, 'commitment')}
                  {pricingFields(`${base}.pricing`, t.pricing, t.name)}
                  <NumField path={`${base}.commitment_fee`} label={`${t.name}: commitment fee (undrawn)`} unit="pct" value={t.commitment_fee} />
                  <NumField path={`${base}.maturity_years`} label={`${t.name}: maturity`} unit="years" value={t.maturity_years} />
                </>
              ) : (
                <>
                  {t.type !== 'pik_note' && (
                    <ChoiceField path={`${base}.type`} label={`${t.name}: ranking`} value={t.type}
                      options={[{ value: 'senior', label: 'senior' }, { value: 'unitranche', label: 'unitranche' }, { value: 'mezzanine', label: 'mezzanine' }]} />
                  )}
                  {sizeFields(`${base}.size`, t.size, t.name)}
                  {t.type === 'pik_note' ? (
                    <>
                      <NumField path={`${base}.cash_coupon`} label={`${t.name}: cash coupon`} unit="pct" value={t.cash_coupon} />
                      <NumField path={`${base}.pik_coupon`} label={`${t.name}: PIK coupon`} unit="pct" value={t.pik_coupon} />
                    </>
                  ) : pricingFields(`${base}.pricing`, t.pricing, t.name)}
                  <NumField path={`${base}.amort_pct_of_face`} label={`${t.name}: mandatory amortization (% face / yr)`} unit="pct" value={t.amort_pct_of_face} />
                  <NumField path={`${base}.oid_pct`} label={`${t.name}: OID (% of par)`} unit="pct" value={t.oid_pct} />
                  <NumField path={`${base}.maturity_years`} label={`${t.name}: maturity (must exceed the hold)`} unit="years" value={t.maturity_years} />
                  <ChoiceField path={`${base}.sweep.participates`} label={`${t.name}: takes the cash sweep?`} value={t.sweep.participates}
                    options={[{ value: true, label: 'yes' }, { value: false, label: 'no' }]} />
                  {t.sweep.participates && <NumField path={`${base}.sweep.priority`} label={`${t.name}: sweep priority (1 = first)`} unit="ratio" value={t.sweep.priority} />}
                </>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-1 justify-end mb-2">
          <SmallButton onClick={() => addTranche(newTerm('senior', true))}>+ floating term loan</SmallButton>
          <SmallButton onClick={() => addTranche(newTerm('senior', false))}>+ fixed-rate debt</SmallButton>
          <SmallButton onClick={() => addTranche({
            name: `PIK note ${termCount + 1}`, type: 'pik_note', size: { amount: U }, cash_coupon: U, pik_coupon: U,
            amort_pct_of_face: U, maturity_years: U, oid_pct: U, sweep: { participates: false, priority: U }, elections: null,
          } as PikNoteAssumption)}>+ PIK note</SmallButton>
          {!hasRevolver && <SmallButton onClick={() => addTranche({
            name: 'Revolver', type: 'revolver', commitment: { amount: U }, pricing: { kind: 'floating', base_rate: U, spread: U, floor: U },
            commitment_fee: U, maturity_years: U, drawn_at_close: 0,
          } as RevolverAssumption)}>+ revolver</SmallButton>}
        </div>
        {termCount > 0 && <NumField path="structure.sweep.base_pct" label="Cash sweep (% of cash above the minimum)" unit="pct" value={a.structure.sweep.base_pct} />}
        {(() => {
          // §11 previews through the SAME pure helpers the engine uses (never re-derived here):
          // GROSS total leverage across ALL term tranches, and each floating tranche's all-in rate.
          const terms = tranches.filter((t): t is CashPayTrancheAssumption | PikNoteAssumption => t.type !== 'revolver');
          const sizesSet = terms.every((t) => isSet(t.size.x_ebitda ?? t.size.amount));
          const lev = hasLtm && terms.length > 0 && sizesSet ? entryGrossLeverageFromAssumptions(facts, a) : null;
          return (
            <>
              {lev !== null && (
                <p className="text-[10px] mb-1 text-right" style={labelStyle}>
                  Total leverage (gross, x {sizingBasisLabel(facts.sizing_basis)} EBITDA): {multiple(lev)}
                </p>
              )}
              {terms.map((t, i) => {
                if (t.type === 'pik_note' || t.pricing.kind !== 'floating') return null;
                const p = t.pricing;
                if (!isSet(p.base_rate) || !isSet(p.floor) || !isSet(p.spread)) return null;
                return <p key={i} className="text-[10px] mb-1 text-right" style={labelStyle}>{t.name}: all-in rate {toPctInput(allInRate(p))}%</p>;
              })}
            </>
          );
        })()}
      </Section>

      {/* ═══ 3. Operating forecast ═══ */}
      <Section title="3 · Operating forecast" note="Each line is a driver, or entered exactly as the case states it (by year, or a year-1 amount plus growth).">
        {/* Revenue */}
        <LineMode label="Revenue" value={lines?.revenue ? lines.revenue.mode : 'driver'}
          options={[...(facts.fy_revenue !== null ? [{ value: 'driver', label: 'grow historical revenue' }] : []), { value: 'explicit', label: 'by year' }, { value: 'grown', label: 'year 1 + growth' }, { value: 'not_modelled', label: 'not modelled' }]}
          onChoose={(m) => setLine('revenue', m === 'driver' ? null : m === 'not_modelled' ? { mode: 'not_modelled' } : spec(m as 'explicit' | 'grown'))} />
        {!lines?.revenue && facts.fy_revenue !== null && <YearGrid path="operations.growth" label="Revenue growth" unit="pct" values={a.operations.growth} />}
        {lines?.revenue && lines.revenue.mode !== 'not_modelled' && <LineValues k="revenue" s={lines.revenue} label="Revenue" />}

        {/* EBITDA */}
        <LineMode label="EBITDA" value={lines?.ebitda ? `${lines.ebitda.measure}_${lines.ebitda.mode}` : 'driver'}
          options={[...(marginDriverOk ? [{ value: 'driver', label: 'margin path on revenue' }] : []),
            { value: 'ebitda_explicit', label: 'EBITDA by year' }, { value: 'ebitda_grown', label: 'EBITDA year 1 + growth' },
            { value: 'ebit_explicit', label: 'EBIT by year (+ D&A)' }, { value: 'ebit_grown', label: 'EBIT year 1 + growth (+ D&A)' }]}
          onChoose={(m) => {
            if (m === 'driver') return setLine('ebitda', null);
            const [measure, mode] = m.split('_') as ['ebitda' | 'ebit', 'explicit' | 'grown'];
            setLine('ebitda', { ...spec(mode), measure });
          }} />
        {!lines?.ebitda && marginDriverOk && (
          <>
            <NumField path="operations.target_margin" label="Target EBITDA margin (final hold year)" unit="pct" value={a.operations.target_margin} />
            <ChoiceField path="operations.margin_path" label="Margin path to target" value={a.operations.margin_path}
              options={[{ value: 'linear', label: 'linear' }, { value: 'front_loaded', label: 'front-loaded (√t)' }, { value: 'back_loaded', label: 'back-loaded (t²)' }]} />
          </>
        )}
        {lines?.ebitda && <LineValues k="ebitda" s={lines.ebitda} label={lines.ebitda.measure === 'ebit' ? 'EBIT' : 'EBITDA'} />}

        {/* D&A */}
        <LineMode label="D&A" value={lines?.da ? lines.da.mode : 'driver'}
          options={[...(revenueAvailable ? [{ value: 'driver', label: '% of revenue' }] : []), { value: 'explicit', label: 'by year' }, { value: 'grown', label: 'year 1 + growth' }]}
          onChoose={(m) => setLine('da', m === 'driver' ? null : spec(m as 'explicit' | 'grown'))} />
        {!lines?.da ? revenueAvailable && <NumField path="operations.da_pct_revenue" label="D&A (% of revenue)" unit="pct" value={a.operations.da_pct_revenue} /> : <LineValues k="da" s={lines.da} label="D&A" />}

        {/* Capex */}
        <LineMode label="Capex" value={lines?.capex ? lines.capex.mode : 'driver'}
          options={[...(revenueAvailable ? [{ value: 'driver', label: 'maintenance % + growth capex' }] : []), { value: 'explicit', label: 'by year' }, { value: 'grown', label: 'year 1 + growth' }, { value: 'pct_of_da', label: 'multiple of D&A' }]}
          onChoose={(m) => setLine('capex', m === 'driver' ? null : m === 'pct_of_da' ? { mode: 'pct_of_da', pct: U } : spec(m as 'explicit' | 'grown'))} />
        {!lines?.capex && revenueAvailable && (
          <>
            <NumField path="operations.maint_capex_pct_revenue" label="Maintenance capex (% of revenue)" unit="pct" value={a.operations.maint_capex_pct_revenue} />
            <YearGrid path="operations.growth_capex" label="Growth capex" unit="money" values={a.operations.growth_capex} />
          </>
        )}
        {lines?.capex && lines.capex.mode === 'pct_of_da' && <NumField path="operations.lines.capex.pct" label="Capex ÷ D&A (1.00 = equals depreciation)" unit="ratio" value={lines.capex.pct} />}
        {lines?.capex && lines.capex.mode !== 'pct_of_da' && <LineValues k="capex" s={lines.capex} label="Capex" />}

        {/* NWC */}
        <LineMode label="Working capital" value={lines?.delta_nwc ? lines.delta_nwc.mode : 'driver'}
          options={[...(nwcDriverOk ? [{ value: 'driver', label: 'balance (days or % revenue)' }] : []), { value: 'explicit', label: 'increase by year' }, { value: 'grown', label: 'increase: year 1 + growth' }]}
          onChoose={(m) => setLine('delta_nwc', m === 'driver' ? null : spec(m as 'explicit' | 'grown'))} />
        {!lines?.delta_nwc && nwcDriverOk && (
          <>
            <ChoiceField path="operations.nwc.method" label="NWC method" value={a.operations.nwc.method}
              options={[{ value: 'pct', label: '% of revenue' }, { value: 'days', label: 'days (DSO / DIO / DPO)' }]}
              onChoose={(mth) => set({ ...a, operations: { ...a.operations, nwc: mth === 'pct' ? { method: 'pct', pct_revenue: U } : { method: 'days', dso: U, dio: U, dpo: U } } }, ['operations.nwc.method', 'operations.nwc'])} />
            <SuggestionChips path="operations.nwc" render={(x) => ((x as { method: string }).method === 'days' ? 'filing days' : 'filing % of revenue')} />
            {a.operations.nwc.method === 'pct'
              ? <NumField path="operations.nwc.pct_revenue" label="Operating NWC (% of revenue)" unit="pct" value={a.operations.nwc.pct_revenue} />
              : <>
                  <NumField path="operations.nwc.dso" label="DSO" unit="days" value={a.operations.nwc.dso} />
                  <NumField path="operations.nwc.dio" label="DIO (on COGS proxy)" unit="days" value={a.operations.nwc.dio} />
                  <NumField path="operations.nwc.dpo" label="DPO (on COGS proxy)" unit="days" value={a.operations.nwc.dpo} />
                </>}
          </>
        )}
        {lines?.delta_nwc && <LineValues k="delta_nwc" s={lines.delta_nwc} label="Increase in NWC" />}

        {lines && (
          <NumField path="operations.lines.year_n_plus_1_growth" label="Growth into year N+1 (NTM exit, terminal value)" unit="pct"
            value={lines.year_n_plus_1_growth} hint="Every line in year N+1 = year N × (1 + this). Needed for an NTM exit and for the flow-to-equity terminal value." />
        )}
      </Section>

      {/* ═══ 4. Tax ═══ */}
      <Section title="4 · Tax">
        <NumField path="tax.rate" label="Tax rate" unit="pct" value={a.tax.rate} />
        <ChoiceField path="tax.interest_deductible" label="Interest tax-deductible?" value={a.tax.interest_deductible} options={[{ value: true, label: 'yes' }, { value: false, label: 'no' }]} />
        {a.tax.interest_deductible && (
          <ChoiceField path="tax.s163j.applies" label="Interest-deduction cap (e.g. US §163(j))?" value={a.tax.s163j.applies} options={[{ value: true, label: 'applies' }, { value: false, label: 'does not apply' }]} />
        )}
        <SuggestionChips path="tax.s163j" render={() => '§163(j) 30% of EBITDA'} />
        {a.tax.interest_deductible && a.tax.s163j.applies && (
          <>
            <NumField path="tax.s163j.ati_pct" label="Cap (% of adjusted taxable income)" unit="pct" value={a.tax.s163j.ati_pct} />
            <ChoiceField path="tax.s163j.ati_basis" label="ATI basis" value={a.tax.s163j.ati_basis} options={[{ value: 'ebitda', label: 'EBITDA' }, { value: 'ebit', label: 'EBIT' }]} />
          </>
        )}
        <NumField path="tax.nol.acquired_opening" label="Acquired NOLs at close (0 if none)" unit="money" value={a.tax.nol.acquired_opening} />
        {isSet(a.tax.nol.acquired_opening) && a.tax.nol.acquired_opening > 0 && (
          <>
            <ChoiceField path="tax.nol.acquired_usable" label="Acquired NOLs usable after the deal?" value={a.tax.nol.acquired_usable} options={[{ value: true, label: 'yes' }, { value: false, label: 'no' }]}
              onChoose={(u) => editWithChoices({ ...a, tax: { ...a.tax, nol: { ...a.tax.nol, acquired_usable: u } } }, ['tax.nol.acquired_usable'], u ? ['tax.nol.arose_pre_2018'] : [], u ? [] : ['tax.nol.arose_pre_2018'])} />
            {a.tax.nol.acquired_usable && (
              <>
                <ChoiceField path="tax.nol.arose_pre_2018" label="Arose before 2018 (100% cap, not 80%)?" value={a.tax.nol.arose_pre_2018} options={[{ value: true, label: 'yes' }, { value: false, label: 'no' }]} />
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label>§382 annual limit</Label>
                  <span className="flex items-center gap-1">
                    <label className="text-[9px]" style={labelStyle}>
                      <input type="checkbox" checked={a.tax.nol.s382_annual_limit === null}
                        onChange={(e) => set(at('tax.nol.s382_annual_limit', e.target.checked ? null : U), ['tax.nol.s382_annual_limit'])} /> none
                    </label>
                    {a.tax.nol.s382_annual_limit !== null && (
                      <NumBox value={a.tax.nol.s382_annual_limit} unit="money" ariaLabel="§382 annual limit" onCommit={(x) => set(at('tax.nol.s382_annual_limit', x), ['tax.nol.s382_annual_limit'])} />
                    )}
                  </span>
                </div>
              </>
            )}
          </>
        )}
        <NumField path="tax.minimum_rate" label="Minimum tax rate (0 = none)" unit="pct" value={a.tax.minimum_rate} />
      </Section>

      {/* ═══ 5. Valuation (flow to equity) ═══ */}
      <Section title="5 · Valuation — flow to equity" note="Values the equity by discounting its own cash flows at a cost of equity re-levered every year (CAPM), and reconciles it with the LBO IRR.">
        <Toggle on={v !== null} label="Value the equity (flow to equity)"
          onOn={() => editWithChoices({ ...a, valuation: { risk_free: U, mrp: U, asset_beta: U, debt_beta: U, long_run_growth: U, leverage_timing: 'end_of_year' } }, ['valuation'], ['valuation.leverage_timing'])}
          onOff={() => editWithChoices({ ...a, valuation: null }, ['valuation'], [], ['valuation'])} />
        {v && (
          <>
            <NumField path="valuation.risk_free" label="Risk-free rate" unit="pct" value={v.risk_free} />
            <NumField path="valuation.mrp" label="Market risk premium" unit="pct" value={v.mrp} />
            <NumField path="valuation.asset_beta" label="Asset (unlevered) beta" unit="beta" value={v.asset_beta} />
            <NumField path="valuation.debt_beta" label="Debt beta (0 = riskless debt)" unit="beta" value={v.debt_beta} />
            <NumField path="valuation.long_run_growth" label="Long-run growth after exit" unit="pct" value={v.long_run_growth} />
            <ChoiceField path="valuation.leverage_timing" label="Leverage for year t's cost of equity" value={v.leverage_timing}
              options={[{ value: 'end_of_year', label: 'end of year t (no circularity)' }, { value: 'start_of_year', label: 'start of year t (closed form)' }]} />
          </>
        )}
      </Section>

      {/* ═══ 6. Management & equity instruments ═══ */}
      <Section title="6 · Management & equity instruments">
        <Toggle on={a.mip !== null} label="Management promote (MIP)"
          onOn={() => set({ ...a, mip: { pool_pct: U, hurdle_moic: U, ratchet: null }, sweet_equity: null }, ['mip', ...(a.sweet_equity ? ['sweet_equity'] : [])])}
          onOff={() => set({ ...a, mip: null }, ['mip'])} hint="A promote and a sweet-equity strip may not coexist (§22.3)." />
        {a.mip && (
          <>
            <SuggestionChips path="mip" render={() => 'cited pool / hurdle'} />
            <NumField path="mip.pool_pct" label="Promote pool (% above hurdle)" unit="pct" value={a.mip.pool_pct} />
            <NumField path="mip.hurdle_moic" label="Hurdle (× invested equity)" unit="mult" value={a.mip.hurdle_moic} />
            {(a.mip.ratchet ?? []).map((r, j) => (
              <div key={j}>
                <NumField path={`mip.ratchet.${j}.hurdle_moic`} label={`Ratchet tier ${j + 1}: hurdle`} unit="mult" value={r.hurdle_moic} />
                <NumField path={`mip.ratchet.${j}.share_pct`} label={`Ratchet tier ${j + 1}: share above it`} unit="pct" value={r.share_pct} />
              </div>
            ))}
            <div className="flex justify-end gap-1 mb-2">
              <SmallButton onClick={() => set({ ...a, mip: { ...a.mip!, ratchet: [...(a.mip!.ratchet ?? []), { hurdle_moic: U, share_pct: U }] } }, ['mip.ratchet'])}>+ ratchet tier</SmallButton>
              {(a.mip.ratchet ?? []).length > 0 && <SmallButton danger onClick={() => set({ ...a, mip: { ...a.mip!, ratchet: (a.mip!.ratchet ?? []).slice(0, -1).length ? (a.mip!.ratchet ?? []).slice(0, -1) : null } }, ['mip.ratchet'])}>− tier</SmallButton>}
            </div>
          </>
        )}
        <Toggle on={a.sweet_equity !== null} label="Sweet-equity strip (loan notes + ordinaries)"
          onOn={() => set({ ...a, sweet_equity: { sponsor_ordinary_pct: U, loan_note_rate: U, management_subscription: U, management_ordinary_pct: U, ratchet: null }, mip: null }, ['sweet_equity', ...(a.mip ? ['mip'] : [])])}
          onOff={() => set({ ...a, sweet_equity: null }, ['sweet_equity'])} hint="Replaces the promote; rollover must be 0 (§22.3)." />
        {a.sweet_equity && (
          <>
            <NumField path="sweet_equity.sponsor_ordinary_pct" label="Institution's strip in ordinaries" unit="pct" value={a.sweet_equity.sponsor_ordinary_pct} />
            <NumField path="sweet_equity.loan_note_rate" label="Loan-note rate (accruing)" unit="pct" value={a.sweet_equity.loan_note_rate} />
            <NumField path="sweet_equity.management_subscription" label="Management subscription" unit="money" value={a.sweet_equity.management_subscription} />
            <NumField path="sweet_equity.management_ordinary_pct" label="Management share of ordinaries" unit="pct" value={a.sweet_equity.management_ordinary_pct} />
          </>
        )}
        <Toggle on={a.warrant !== null} label="Warrant / equity kicker"
          onOn={() => set({ ...a, warrant: { holder_label: 'Warrant', pct_of_ordinary: U, strike_total: U } }, ['warrant'])}
          onOff={() => set({ ...a, warrant: null }, ['warrant'])} />
        {a.warrant && (
          <>
            <NumField path="warrant.pct_of_ordinary" label="Warrant (% of ordinary, fully diluted)" unit="pct" value={a.warrant.pct_of_ordinary} />
            <NumField path="warrant.strike_total" label="Total strike" unit="money" value={a.warrant.strike_total} />
          </>
        )}
      </Section>

      {/* ═══ 7. Cash policy, covenants, fees ═══ */}
      <Section title="7 · Distributions, covenants, monitoring fee">
        <Toggle on={a.structure.distributions !== null} label="Interim distributions to equity"
          onOn={() => set(at('structure.distributions', blanks(N)), ['structure.distributions'])}
          onOff={() => set(at('structure.distributions', null), ['structure.distributions'])} />
        {a.structure.distributions && <YearGrid path="structure.distributions" label="Requested distribution" unit="money" values={a.structure.distributions} />}
        <Toggle on={a.covenants.rp_trap !== null} label="Restricted-payment cash trap"
          onOn={() => set(at('covenants.rp_trap', { metric: 'net_leverage', level: U }), ['covenants.rp_trap'])}
          onOff={() => set(at('covenants.rp_trap', null), ['covenants.rp_trap'])} />
        {a.covenants.rp_trap && <NumField path="covenants.rp_trap.level" label="Distributions blocked above net leverage" unit="mult" value={a.covenants.rp_trap.level} />}
        {(['leverage_max', 'dscr_min', 'fccr_min'] as const).map((k) => {
          const val = a.covenants[k];
          const label = k === 'leverage_max' ? 'Max net leverage covenant' : k === 'dscr_min' ? 'Min DSCR covenant' : 'Min FCCR covenant';
          return (
            <div key={k}>
              <Toggle on={val !== null} label={label} onOn={() => set(at(`covenants.${k}`, U), [`covenants.${k}`])} onOff={() => set(at(`covenants.${k}`, null), [`covenants.${k}`])} />
              {val !== null && !Array.isArray(val) && <NumField path={`covenants.${k}`} label={`${label} level`} unit="mult" value={val} />}
            </div>
          );
        })}
        <Toggle on={a.fees.monitoring !== null} label="Sponsor monitoring fee"
          onOn={() => set(at('fees.monitoring', { annual: U, termination_years: U, discount_rate: U }), ['fees.monitoring'])}
          onOff={() => set(at('fees.monitoring', null), ['fees.monitoring'])} />
        {a.fees.monitoring && (
          <>
            <NumField path="fees.monitoring.annual" label="Annual monitoring fee" unit="money" value={a.fees.monitoring.annual} />
            <NumField path="fees.monitoring.termination_years" label="Termination: years accelerated" unit="years" value={a.fees.monitoring.termination_years} />
            <NumField path="fees.monitoring.discount_rate" label="Termination discount rate" unit="pct" value={a.fees.monitoring.discount_rate} />
          </>
        )}
      </Section>

      {/* ═══ 8. Refinancing & PIK toggle ═══ */}
      {tranches.some((t) => t.type !== 'revolver') && (
        <Section title="8 · Refinancing & PIK elections">
          {tranches.map((t, i) => {
            if (t.type === 'revolver') return null;
            if (t.type === 'pik_note') {
              const el = t.elections;
              return (
                <div key={i}>
                  <Toggle on={el !== null} label={`${t.name}: per-year cash / PIK election`}
                    onOn={() => editWithChoices(at(`structure.tranches.${i}.elections`, Array.from({ length: N }, () => 'pik')), [`structure.tranches.${i}.elections`], Array.from({ length: N }, (_, y) => `structure.tranches.${i}.elections.${y}`))}
                    onOff={() => editWithChoices(at(`structure.tranches.${i}.elections`, null), [`structure.tranches.${i}.elections`], [], [`structure.tranches.${i}.elections`])} />
                  {el && el.map((e, y) => (
                    <ChoiceField key={y} path={`structure.tranches.${i}.elections.${y}`} label={`${t.name}: year ${y + 1}`} value={e}
                      options={[{ value: 'cash', label: 'pay cash' }, { value: 'pik', label: 'PIK' }]} />
                  ))}
                </div>
              );
            }
            const refi = (a.structure.refinancing ?? []).find((r) => r.tranche_name === t.name) ?? null;
            const ri = (a.structure.refinancing ?? []).findIndex((r) => r.tranche_name === t.name);
            const blankRefi = (): RefinancingEvent => ({
              tranche_name: t.name, year: U,
              new_pricing: t.pricing.kind === 'fixed' ? { kind: 'fixed', rate: U } : { kind: 'floating', base_rate: U, spread: U, floor: U },
              call_premium_pct: U, new_maturity_years: U, new_oid_pct: U, new_financing_fee_pct: U, new_amort_pct_of_face: U,
            });
            return (
              <div key={i}>
                <Toggle on={refi !== null} label={`Refinance ${t.name}`}
                  onOn={() => set(at('structure.refinancing', [...(a.structure.refinancing ?? []), blankRefi()]), ['structure.refinancing'])}
                  onOff={() => { const rest = (a.structure.refinancing ?? []).filter((r) => r.tranche_name !== t.name); set(at('structure.refinancing', rest.length ? rest : null), ['structure.refinancing']); }} />
                {refi && (
                  <>
                    <NumField path={`structure.refinancing.${ri}.year`} label={`${t.name}: refinancing year (1…${N - 1})`} unit="years" value={refi.year} />
                    {pricingFields(`structure.refinancing.${ri}.new_pricing`, refi.new_pricing, `${t.name} new`)}
                    <NumField path={`structure.refinancing.${ri}.call_premium_pct`} label="Call premium (% of balance)" unit="pct" value={refi.call_premium_pct} />
                    <NumField path={`structure.refinancing.${ri}.new_maturity_years`} label="New maturity (from the refi year)" unit="years" value={refi.new_maturity_years} />
                    <NumField path={`structure.refinancing.${ri}.new_oid_pct`} label="New OID (%)" unit="pct" value={refi.new_oid_pct} />
                    <NumField path={`structure.refinancing.${ri}.new_financing_fee_pct`} label="New financing fee (%)" unit="pct" value={refi.new_financing_fee_pct} />
                    <NumField path={`structure.refinancing.${ri}.new_amort_pct_of_face`} label="New amortization (% of new face / yr)" unit="pct" value={refi.new_amort_pct_of_face} />
                  </>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* ═══ 9. Fund overlay ═══ */}
      <Section title="9 · Fund / LP overlay">
        <Toggle on={fund !== null} label="Net-to-LP returns (fees and carry)"
          onOn={() => editWithChoices({ ...a, fund: { committed_capital: U, mgmt_fee_pct: U, fee_basis: 'invested', carry_pct: U, pref_rate: U, catchup_pct: U, waterfall: 'european', fee_offset_pct: U } as FundOverlayAssumption }, ['fund'], ['fund.fee_basis', 'fund.waterfall'])}
          onOff={() => editWithChoices({ ...a, fund: null }, ['fund'], [], ['fund'])} />
        {fund && (
          <>
            <NumField path="fund.committed_capital" label="Committed capital" unit="money" value={fund.committed_capital} />
            <NumField path="fund.mgmt_fee_pct" label="Management fee" unit="pct" value={fund.mgmt_fee_pct} />
            <ChoiceField path="fund.fee_basis" label="Fee basis" value={fund.fee_basis} options={[{ value: 'committed', label: 'committed' }, { value: 'invested', label: 'invested' }]} />
            <NumField path="fund.carry_pct" label="Carried interest" unit="pct" value={fund.carry_pct} />
            <NumField path="fund.pref_rate" label="Preferred return (compounded)" unit="pct" value={fund.pref_rate} />
            <NumField path="fund.catchup_pct" label="GP catch-up (0 = hard hurdle)" unit="pct" value={fund.catchup_pct} />
            <ChoiceField path="fund.waterfall" label="Waterfall" value={fund.waterfall} options={[{ value: 'european', label: 'European (whole fund)' }, { value: 'american', label: 'American (deal by deal)' }]} />
            <NumField path="fund.fee_offset_pct" label="Fee offset (% of deal fees)" unit="pct" value={fund.fee_offset_pct} />
          </>
        )}
      </Section>

      {/* ═══ Display ═══ */}
      <Section title="Display">
        <Toggle on={a.mid_year_irr} label="Headline the mid-year IRR (both are always computed)"
          onOn={() => set({ ...a, mid_year_irr: true }, ['mid_year_irr'])} onOff={() => set({ ...a, mid_year_irr: false }, ['mid_year_irr'])} />
      </Section>
    </div>
  );
};

/** The mode selector for one forecast line. */
const LineMode: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChoose: (m: string) => void }> = ({ label, value, options, onChoose }) => {
  // a driver the facts cannot support is never displayed as if chosen — "choose…" until a valid mode is picked
  const valid = options.some((o) => o.value === value);
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5 mt-2">
      <span className="text-[10px] tracking-wider uppercase font-semibold" style={{ ...labelStyle, color: '#111' }}>{label}</span>
      <select aria-label={`${label} input mode`} value={valid ? value : ''} onChange={(e) => e.target.value && onChoose(e.target.value)} className="px-1 py-1 text-[11px]"
        style={{ fontFamily: mono, border: valid ? '1px solid rgba(17,17,17,0.14)' : '1px solid rgba(204,0,0,0.55)', background: valid ? '#fff' : 'rgba(204,0,0,0.03)' }}>
        {!valid && <option value="">choose…</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
};

export default AssumptionsPanel;
