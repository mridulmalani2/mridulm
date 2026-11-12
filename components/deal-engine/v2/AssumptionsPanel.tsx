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
import { ChoiceField, Derived, Line, NumBox, NumField, PlainChoice, Section, SectionCounts, SmallButton, SubHead, SuggestionChips, Toggle, YearGrid, isSet } from './fields';
import { Segmented } from '../ui/kit';
import { sectionOf } from './sections';
import { entryGrossLeverageFromAssumptions } from '../../../lib/engine2/sourcesUses';
import DebtTable from './DebtTable';
import { multiple } from '../../../lib/format';
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
  // the Build gate, read here so each section can say how many inputs it still needs
  const missing = useEngine2Model.getState().missing();
  if (!facts) return null;

  if (!a) {
    return (
      <div className="bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] px-6">
        <Section title="Start" note="The holding period sizes every per-year input, so it comes first.">
          <Line label="Holding period">
            <NumBox value={null} unit="years" ariaLabel="Holding period" onCommit={(v) => setHold(v)} />
          </Line>
        </Section>
      </div>
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
  // A plain render helper, NOT a component: a component declared inside this render gets a new
  // identity on every store edit, which remounts its inputs and drops focus mid-entry.
  const lineValues = (k: LineKey, s: LineSpec, label: string) =>
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
  const fund = a.fund;
  const v = a.valuation;
  // which §7 drivers the facts can support (§24.3 R1–R3) — an unsupported driver is never offered
  const revenueAvailable = lines?.revenue ? lines.revenue.mode !== 'not_modelled' : facts.fy_revenue !== null;
  const marginDriverOk = facts.fy_ebitda_margin !== null && revenueAvailable;
  const nwcDriverOk = facts.fy_revenue !== null && revenueAvailable;

  const counts: Record<string, number> = {};
  for (const m of missing) counts[sectionOf(m.path)] = (counts[sectionOf(m.path)] ?? 0) + 1;

  return (
    <SectionCounts.Provider value={counts}>
    <div className="bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] px-6">
      {/* ═══ Transaction ═══ */}
      <Section id="transaction" title="Transaction">
        <NumField path="entry.hold_years" label="Holding period" unit="years" value={N} onCommit={(x) => setHold(x)} />
        <ChoiceField path="entry.driver" label="Entry priced by" value={a.entry.driver}
          options={[{ value: 'multiple', label: 'multiple × EBITDA' }, { value: 'ev', label: 'purchase price (EV)' }]}
          onChoose={(d) => set({ ...a, entry: { ...a.entry, driver: d, entry_multiple: d === 'multiple' ? U : null, enterprise_value: d === 'ev' ? U : null } }, ['entry.driver'])} />
        {a.entry.driver === 'multiple'
          ? <NumField path="entry.entry_multiple" label="Entry multiple" unit="mult" value={a.entry.entry_multiple} />
          : <NumField path="entry.enterprise_value" label="Purchase price (enterprise value)" unit="money" value={a.entry.enterprise_value} />}
        {facts.implied_trading_ev_ebitda !== null && (
          <p className="text-[12px] text-[color:var(--de-ink-3)] text-right pb-1">
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

      {/* ═══ Debt ═══ */}
      <Section id="debt" title="Debt" note="Each facility is a column, entered as the term sheet states it.">
        {pending.includes('structure.tranches') && (
          <Line path="structure.tranches" label={<span className="text-[color:var(--de-accent)]">Add facilities, or confirm the deal has no debt</span>}>
            <SuggestionChips path="structure.tranches" render={() => 'the cited tranche template'} />
            <SmallButton onClick={() => editWithChoices({ ...a, structure: { ...a.structure, tranches: [] } }, ['structure.tranches'], [])}>No debt</SmallButton>
          </Line>
        )}
        {!pending.includes('structure.tranches') && <div className="flex justify-end"><SuggestionChips path="structure.tranches" render={() => 'the cited tranche template'} /></div>}
        {tranches.length > 0 && (
          <DebtTable tranches={tranches} hasLtm={hasLtm} pending={pending} onSet={(path, value) => set(at(path, value), [path])} onRemove={removeTranche} />
        )}
        <div className="flex flex-wrap gap-2 mt-3 mb-2">
          <SmallButton onClick={() => addTranche(newTerm('senior', true))}>+ Floating term loan</SmallButton>
          <SmallButton onClick={() => addTranche(newTerm('senior', false))}>+ Fixed-rate debt</SmallButton>
          <SmallButton onClick={() => addTranche({
            name: `PIK note ${termCount + 1}`, type: 'pik_note', size: { amount: U }, cash_coupon: U, pik_coupon: U,
            amort_pct_of_face: U, maturity_years: U, oid_pct: U, sweep: { participates: false, priority: U }, elections: null,
          } as PikNoteAssumption)}>+ PIK note</SmallButton>
          {!hasRevolver && <SmallButton onClick={() => addTranche({
            name: 'Revolver', type: 'revolver', commitment: { amount: U }, pricing: { kind: 'floating', base_rate: U, spread: U, floor: U },
            commitment_fee: U, maturity_years: U, drawn_at_close: 0,
          } as RevolverAssumption)}>+ Revolver</SmallButton>}
        </div>
        {termCount > 0 && (() => {
          const grid = a.structure.sweep.grid;
          return (
            <>
              <PlainChoice label="Cash sweep" ariaLabel="Cash sweep basis" value={grid ? 'grid' : 'flat'}
                hint="Excess-cash sweeps commonly step down as leverage falls (for example 75% above 4.5x, 50% above 3.5x, nil below)."
                options={[{ value: 'flat', label: 'one % every year' }, { value: 'grid', label: 'steps down with opening net leverage' }]}
                onChange={(v) => set(at('structure.sweep.grid', v === 'grid' ? { tiers: [{ above_net_leverage: U, pct: U }], else_pct: U } : null), ['structure.sweep.grid'])} />
              {!grid && <NumField path="structure.sweep.base_pct" label="Cash sweep (% of cash above the minimum)" unit="pct" value={a.structure.sweep.base_pct} />}
              {grid && (
                <>
                  {grid.tiers.map((tier, j) => (
                    <div key={j}>
                      <NumField path={`structure.sweep.grid.tiers.${j}.above_net_leverage`} label={`Sweep step ${j + 1}: when opening net leverage is above`} unit="mult" value={tier.above_net_leverage} />
                      <NumField path={`structure.sweep.grid.tiers.${j}.pct`} label={`Sweep step ${j + 1}: sweep %`} unit="pct" value={tier.pct} />
                    </div>
                  ))}
                  <NumField path="structure.sweep.grid.else_pct" label="Sweep % below every threshold" unit="pct" value={grid.else_pct} />
                  <div className="flex justify-end gap-2 my-1">
                    <SmallButton onClick={() => set(at('structure.sweep.grid.tiers', [...grid.tiers, { above_net_leverage: U, pct: U }]), ['structure.sweep.grid.tiers'])}>+ Step</SmallButton>
                    {grid.tiers.length > 1 && <SmallButton danger onClick={() => set(at('structure.sweep.grid.tiers', grid.tiers.slice(0, -1)), ['structure.sweep.grid.tiers'])}>Remove step</SmallButton>}
                  </div>
                </>
              )}
            </>
          );
        })()}
        {(() => {
          // §11 preview through the SAME pure helper the engine uses (never re-derived here):
          // GROSS total leverage across ALL term tranches.
          const terms = tranches.filter((t): t is CashPayTrancheAssumption | PikNoteAssumption => t.type !== 'revolver');
          const sizesSet = terms.every((t) => isSet(t.size.x_ebitda ?? t.size.amount));
          const lev = hasLtm && terms.length > 0 && sizesSet ? entryGrossLeverageFromAssumptions(facts, a) : null;
          return lev !== null ? <Derived label={`Total leverage (gross, x ${sizingBasisLabel(facts.sizing_basis)} EBITDA)`} value={multiple(lev)} /> : null;
        })()}
      </Section>

      {/* ═══ Operating forecast ═══ */}
      <Section id="operating" title="Operating forecast" note="Each line is driven from history, or entered exactly as the case states it.">
        {/* Revenue */}
        <LineMode label="Revenue" value={lines?.revenue ? lines.revenue.mode : 'driver'}
          options={[...(facts.fy_revenue !== null ? [{ value: 'driver', label: 'grow historical revenue' }] : []), { value: 'explicit', label: 'by year' }, { value: 'grown', label: 'year 1 + growth' }, { value: 'not_modelled', label: 'not modelled' }]}
          onChoose={(m) => setLine('revenue', m === 'driver' ? null : m === 'not_modelled' ? { mode: 'not_modelled' } : spec(m as 'explicit' | 'grown'))} />
        {!lines?.revenue && facts.fy_revenue !== null && <YearGrid path="operations.growth" label="Revenue growth" unit="pct" values={a.operations.growth} />}
        {lines?.revenue && lines.revenue.mode !== 'not_modelled' && lineValues('revenue', lines.revenue, 'Revenue')}

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
        {lines?.ebitda && lineValues('ebitda', lines.ebitda, lines.ebitda.measure === 'ebit' ? 'EBIT' : 'EBITDA')}

        {/* D&A */}
        <LineMode label="D&A" value={lines?.da ? lines.da.mode : 'driver'}
          options={[...(revenueAvailable ? [{ value: 'driver', label: '% of revenue' }] : []), { value: 'explicit', label: 'by year' }, { value: 'grown', label: 'year 1 + growth' }]}
          onChoose={(m) => setLine('da', m === 'driver' ? null : spec(m as 'explicit' | 'grown'))} />
        {!lines?.da ? revenueAvailable && <NumField path="operations.da_pct_revenue" label="D&A (% of revenue)" unit="pct" value={a.operations.da_pct_revenue} /> : lineValues('da', lines.da, 'D&A')}

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
        {lines?.capex && lines.capex.mode !== 'pct_of_da' && lineValues('capex', lines.capex, 'Capex')}

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
        {lines?.delta_nwc && lineValues('delta_nwc', lines.delta_nwc, 'Increase in NWC')}

        {lines && (
          <NumField path="operations.lines.year_n_plus_1_growth" label="Growth into year N+1 (NTM exit, terminal value)" unit="pct"
            value={lines.year_n_plus_1_growth} hint="Every line in year N+1 = year N × (1 + this). Needed for an NTM exit and for the flow-to-equity terminal value." />
        )}
      </Section>

      {/* ═══ 4. Tax ═══ */}
      <Section id="tax" title="Tax">
        <NumField path="tax.rate" label="Tax rate" unit="pct" value={a.tax.rate} />
        <ChoiceField path="tax.interest_deductible" label="Interest tax-deductible?" value={a.tax.interest_deductible} options={[{ value: true, label: 'yes' }, { value: false, label: 'no' }]}
          onChoose={(d) => (d
            ? set(at('tax.interest_deductible', true), ['tax.interest_deductible'])
            // not deductible ⇒ the cap question is moot: clear it, and ask again if this is switched back
            : editWithChoices({ ...a, tax: { ...a.tax, interest_deductible: false, s163j: { applies: false, ati_basis: 'ebitda', ati_pct: U } } },
              ['tax.interest_deductible'], ['tax.s163j.applies'], ['tax.s163j']))} />
        {a.tax.interest_deductible && (
          <ChoiceField path="tax.s163j.applies" label="Interest-deduction cap (e.g. US §163(j))?" value={a.tax.s163j.applies} options={[{ value: true, label: 'applies' }, { value: false, label: 'does not apply' }]}
            // the ATI basis is the analyst's choice too: it stays open (gating Build) until made, never a silent EBITDA
            onChoose={(ap) => editWithChoices(at('tax.s163j.applies', ap), ['tax.s163j.applies'], ap ? ['tax.s163j.ati_basis'] : [], ['tax.s163j.ati_basis'])} />
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
                <Line path="tax.nol.s382_annual_limit" label="§382 annual limit">
                  <Segmented ariaLabel="§382 annual limit" value={a.tax.nol.s382_annual_limit === null ? 'none' : 'limit'}
                    options={[{ value: 'none', label: 'none' }, { value: 'limit', label: 'limited to' }]}
                    onChange={(v) => set(at('tax.nol.s382_annual_limit', v === 'none' ? null : U), ['tax.nol.s382_annual_limit'])} />
                  {a.tax.nol.s382_annual_limit !== null && (
                    <NumBox value={a.tax.nol.s382_annual_limit} unit="money" ariaLabel="§382 annual limit" onCommit={(x) => set(at('tax.nol.s382_annual_limit', x), ['tax.nol.s382_annual_limit'])} />
                  )}
                </Line>
              </>
            )}
          </>
        )}
        <NumField path="tax.minimum_rate" label="Minimum tax rate (0 = none)" unit="pct" value={a.tax.minimum_rate} />
      </Section>

      {/* ═══ 5. Valuation (flow to equity) ═══ */}
      <Section id="valuation" optional title="Valuation" note="Values the equity by discounting its own cash flows at a cost of equity re-levered every year, and reconciles it with the LBO return.">
        <Toggle on={v !== null} label="Value the equity (flow to equity)"
          onOn={() => editWithChoices({ ...a, valuation: { risk_free: U, mrp: U, asset_beta: U, debt_beta: U, long_run_growth: U, leverage_timing: 'end_of_year', terminal: null } }, ['valuation'], ['valuation.leverage_timing', 'valuation.terminal'])}
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
            {/* §28: the terminal value capitalises year N+1 for ever, so the analyst says what that year is —
                the final forecast year carried forward, or a stated steady state. An open choice until made. */}
            <ChoiceField path="valuation.terminal" label="Terminal year (N+1) capex and working capital" value={v.terminal ? 'stated' : 'carried'}
              hint="The fundamentals exit values year N+1's cash flow in perpetuity. A forecast year often runs capex below D&A or releases working capital, which cannot last for ever."
              options={[{ value: 'carried', label: 'as in the final forecast year' }, { value: 'stated', label: 'stated for a steady state' }]}
              onChoose={(c) => set(at('valuation.terminal', c === 'stated' ? { capex_pct_of_da: U, delta_nwc_before_growth: U } : null), ['valuation.terminal'])} />
            {v.terminal && (
              <>
                <NumField path="valuation.terminal.capex_pct_of_da" label="Terminal capex ÷ D&A (1.00 = spend what wears out)" unit="ratio" value={v.terminal.capex_pct_of_da} />
                <NumField path="valuation.terminal.delta_nwc_before_growth" label="Terminal increase in NWC, before growth (negative = inflow)" unit="money" value={v.terminal.delta_nwc_before_growth}
                  hint="In final-forecast-year terms; it is grown into year N+1 with every other line." />
              </>
            )}
          </>
        )}
      </Section>

      {/* ═══ 6. Management & equity instruments ═══ */}
      <Section id="equity" optional title="Management and equity">
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
            <div className="flex justify-end gap-2 my-1">
              <SmallButton onClick={() => set({ ...a, mip: { ...a.mip!, ratchet: [...(a.mip!.ratchet ?? []), { hurdle_moic: U, share_pct: U }] } }, ['mip.ratchet'])}>+ Ratchet tier</SmallButton>
              {(a.mip.ratchet ?? []).length > 0 && <SmallButton danger onClick={() => set({ ...a, mip: { ...a.mip!, ratchet: (a.mip!.ratchet ?? []).slice(0, -1).length ? (a.mip!.ratchet ?? []).slice(0, -1) : null } }, ['mip.ratchet'])}>Remove tier</SmallButton>}
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
            {(a.sweet_equity.ratchet ?? []).map((r, j) => (
              <div key={j}>
                <NumField path={`sweet_equity.ratchet.${j}.hurdle_moic`} label={`Sweet ratchet tier ${j + 1}: institution MOIC above`} unit="mult" value={r.hurdle_moic} />
                <NumField path={`sweet_equity.ratchet.${j}.share_pct`} label={`Sweet ratchet tier ${j + 1}: management share of ordinaries`} unit="pct" value={r.share_pct} />
              </div>
            ))}
            <div className="flex justify-end gap-2 my-1">
              <SmallButton onClick={() => set({ ...a, sweet_equity: { ...a.sweet_equity!, ratchet: [...(a.sweet_equity!.ratchet ?? []), { hurdle_moic: U, share_pct: U }] } }, ['sweet_equity.ratchet'])}>+ Ratchet tier</SmallButton>
              {(a.sweet_equity.ratchet ?? []).length > 0 && <SmallButton danger onClick={() => set({ ...a, sweet_equity: { ...a.sweet_equity!, ratchet: (a.sweet_equity!.ratchet ?? []).slice(0, -1).length ? (a.sweet_equity!.ratchet ?? []).slice(0, -1) : null } }, ['sweet_equity.ratchet'])}>Remove tier</SmallButton>}
            </div>
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
        {/* §23: a SECONDARY selldown — the sponsor sells part of its stake before the exit; the
            company is untouched. Rejected beside a rollover or a strip (§23.3), so the toggle says
            why it is unavailable instead of letting the Build fail. */}
        {(() => {
          const blockedBy = a.rollover_equity > 0 ? 'rollover equity' : a.sweet_equity ? 'a sweet-equity strip' : null;
          const sd = a.structure.selldown;
          return (
            <>
              <Toggle on={sd !== null} label="Partial exit before the final exit (secondary selldown)"
                hint={blockedBy ? `Not available beside ${blockedBy} (SPEC §23.3): how the buyer ranks is negotiated.` : 'The sponsor sells part of its stake at the end of a year before the exit, at a multiple of that year’s EBITDA less net debt. The company itself is unaffected.'}
                onOn={() => { if (!blockedBy) set(at('structure.selldown', { year: U, fraction: U, event_multiple: U }), ['structure.selldown']); }}
                onOff={() => set(at('structure.selldown', null), ['structure.selldown'])} />
              {blockedBy && sd === null && (
                <p className="text-[12px] text-[color:var(--de-ink-3)] pb-1">Unavailable while the deal has {blockedBy}.</p>
              )}
              {sd && (
                <>
                  <NumField path="structure.selldown.year" label={`Partial exit: year of the sale (1–${N - 1})`} unit="years" value={sd.year} />
                  <NumField path="structure.selldown.fraction" label="Partial exit: share of the sponsor’s stake sold" unit="pct" value={sd.fraction} />
                  <NumField path="structure.selldown.event_multiple" label="Partial exit: sale multiple (× that year’s EBITDA)" unit="mult" value={sd.event_multiple} />
                </>
              )}
            </>
          );
        })()}
      </Section>

      {/* ═══ 7. Cash policy, covenants, fees ═══ */}
      <Section id="policy" optional title="Distributions and covenants">
        {/* §3.8: ONE distribution policy per deal — none (cash builds), a requested schedule, or
            the surplus-cash policy. Every policy pays only from cash above the minimum, after
            debt service and the sweep, and is still subject to the restricted-payment trap. */}
        <PlainChoice label="Distributions to equity during the hold" ariaLabel="Distribution policy"
          value={a.structure.surplus_distribution ? 'surplus' : a.structure.distributions ? 'scheduled' : 'none'}
          options={[{ value: 'none', label: 'none: cash stays in the business' }, { value: 'scheduled', label: 'fixed amounts by year' }, { value: 'surplus', label: 'surplus cash (a % of cash above the minimum)' }]}
          onChange={(p) => {
            const structure = {
              ...a.structure,
              distributions: p === 'scheduled' ? blanks(N) : null,
              // blank until entered, like every other input: the payout share is unset and the
              // timing is an open choice (both gate Build); no "common case" is assumed
              surplus_distribution: p === 'surplus' ? { payout_pct: U, start: 'immediately' as const } : null,
            };
            editWithChoices({ ...a, structure }, ['structure.distributions', 'structure.surplus_distribution'],
              p === 'surplus' ? ['structure.surplus_distribution.start'] : [], ['structure.surplus_distribution']);
          }} />
        {a.structure.distributions && <YearGrid path="structure.distributions" label="Requested distribution" unit="money" values={a.structure.distributions} />}
        {a.structure.surplus_distribution && (
          <>
            <NumField path="structure.surplus_distribution.payout_pct" label="Share of surplus cash paid out" unit="pct" value={a.structure.surplus_distribution.payout_pct}
              hint="Cash above the minimum after interest, amortization, the revolver and the sweep. Below 100%, the rest stays on the balance sheet." />
            <ChoiceField path="structure.surplus_distribution.start" label="Pay surplus out" value={a.structure.surplus_distribution.start}
              options={[{ value: 'immediately', label: 'every year (what the sweep leaves)' }, { value: 'after_debt_repaid', label: 'only once all debt is repaid' }]} />
          </>
        )}
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
              {val !== null && (
                <PlainChoice label={`${label}: level`} ariaLabel={`${label} schedule`} value={Array.isArray(val) ? 'year' : 'flat'}
                  hint="Leverage covenants usually step down over the life of the loan."
                  options={[{ value: 'flat', label: 'same every year' }, { value: 'year', label: 'set by year' }]}
                  onChange={(v) => set(at(`covenants.${k}`, v === 'year' ? blanks(N) : U), [`covenants.${k}`])} />
              )}
              {val !== null && !Array.isArray(val) && <NumField path={`covenants.${k}`} label={`${label} level`} unit="mult" value={val} />}
              {val !== null && Array.isArray(val) && <YearGrid path={`covenants.${k}`} label={`${label} by year`} unit="mult" values={val} />}
            </div>
          );
        })}
        {hasRevolver && (
          <>
            <Toggle on={a.covenants.springing !== null} label="Springing leverage test (revolver)"
              hint="Tested only in years when the revolver is drawn above the trigger, the usual covenant-lite revolver protection."
              onOn={() => set(at('covenants.springing', { metric: 'leverage', max: U, revolver_draw_trigger_pct: U }), ['covenants.springing'])}
              onOff={() => set(at('covenants.springing', null), ['covenants.springing'])} />
            {a.covenants.springing && !Array.isArray(a.covenants.springing.max) && (
              <NumField path="covenants.springing.max" label="Springing test: maximum net leverage" unit="mult" value={a.covenants.springing.max} />
            )}
            {a.covenants.springing && Array.isArray(a.covenants.springing.max) && (
              <YearGrid path="covenants.springing.max" label="Springing test: maximum net leverage by year" unit="mult" values={a.covenants.springing.max} />
            )}
            {a.covenants.springing && (
              <NumField path="covenants.springing.revolver_draw_trigger_pct" label="Springing test applies when drawn ÷ commitment exceeds" unit="pct" value={a.covenants.springing.revolver_draw_trigger_pct} />
            )}
          </>
        )}
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
        <Section id="refinancing" optional title="Refinancing and PIK">
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
      <Section id="fund" optional title="Fund overlay">
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
      <Section id="display" optional title="Display">
        <Toggle on={a.mid_year_irr} label="Headline the mid-year IRR (both are always computed)"
          onOn={() => set({ ...a, mid_year_irr: true }, ['mid_year_irr'])} onOff={() => set({ ...a, mid_year_irr: false }, ['mid_year_irr'])} />
      </Section>
    </div>
    </SectionCounts.Provider>
  );
};

/** The mode selector for one forecast line. */
const LineMode: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChoose: (m: string) => void }> = ({ label, value, options, onChoose }) => {
  // a driver the facts cannot support is never displayed as if chosen: it stays open until a valid mode is picked
  const valid = options.some((o) => o.value === value);
  return (
    <>
      <SubHead>{label}</SubHead>
      <PlainChoice label="Entered as" ariaLabel={`${label} input mode`} value={value} blank={!valid} options={options} onChange={onChoose} />
    </>
  );
};

export default AssumptionsPanel;
