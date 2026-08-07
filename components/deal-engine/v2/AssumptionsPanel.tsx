/**
 * v2 AssumptionsPanel (PHASE_E §E1): Class B ONLY. The core-8 tier is always visible
 * (entry multiple + trading anchor line, leverage, blended rate, growth, target margin,
 * capex %, exit multiple, hold); Advanced groups collapse; every field wears its basis
 * badge; growth renders as (start, terminal) with an edit-by-year expander; derived
 * values are read-only and visually distinct. All display via lib/format; edits go
 * through the store's editAssumptions (path-marked YOU) and percent fields cross the
 * boundary EXACTLY once (fromPctInput).
 */
import React, { useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { bps, fromPctInput, multiple, num, toPctInput } from '../../../lib/format';
import BasisBadge from './BasisBadge';
import type { DealAssumptions, CashPayTrancheAssumption, RefinancingEvent } from '../../../lib/engine2/types';
import { entryGrossLeverageFromAssumptions, rescaleTermTranchesToLeverage } from '../../../lib/engine2/sourcesUses';
import { allInRate } from '../../../lib/engine2/kernel/rates';
import { sizingBasisLabel } from '../../../lib/engine2/display';

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const labelStyle = { color: 'rgba(17,17,17,0.45)', fontFamily: mono } as const;
const inputStyle = { background: '#fff', border: '1px solid rgba(17,17,17,0.12)', color: '#111', fontFamily: mono, outline: 'none' } as const;

interface RowProps {
  label: string;
  path: string;
  children: React.ReactNode;
}

const Row: React.FC<RowProps> = ({ label, path, children }) => {
  const basis = useEngine2Model((s) => s.basis[path]);
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-[10px] tracking-wider uppercase shrink-0" style={labelStyle}>{label}</label>
      <div className="flex items-center gap-1.5">
        {basis && <BasisBadge kind={basis.kind} detail={basis.detail} />}
        {children}
      </div>
    </div>
  );
};

/** Numeric input crossing the format boundary once; commits on blur/Enter. */
const NumInput: React.FC<{
  value: string;
  onCommit: (text: string) => void;
  width?: string;
  suffix?: string;
  readOnly?: boolean;
}> = ({ value, onCommit, width = 'w-20', suffix, readOnly }) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <input
        value={draft ?? value}
        readOnly={readOnly}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={`${width} px-1.5 py-1 text-[11px] text-right`}
        style={readOnly ? { ...inputStyle, background: 'rgba(17,17,17,0.04)', color: 'rgba(17,17,17,0.55)' } : inputStyle}
      />
      {suffix && <span className="text-[10px]" style={labelStyle}>{suffix}</span>}
    </span>
  );
};

const AssumptionsPanel: React.FC = () => {
  const facts = useEngine2Model((s) => s.facts);
  const a = useEngine2Model((s) => s.assumptions);
  const edit = useEngine2Model((s) => s.editAssumptions);
  const [byYear, setByYear] = useState(false);
  if (!facts || !a) return null;

  const set = (next: DealAssumptions, paths: string[]) => edit(next, paths);
  const numCommit = (fn: (v: number) => [DealAssumptions, string[]]) => (text: string) => {
    const v = Number(text.replace(/[,\s]/g, ''));
    if (Number.isFinite(v)) set(...fn(v));
  };
  const pctCommit = (fn: (v: number) => [DealAssumptions, string[]]) => (text: string) => {
    const v = fromPctInput(text);
    if (v !== null) set(...fn(v));
  };

  const term = a.structure.tranches.find(
    (t): t is CashPayTrancheAssumption => t.type === 'senior' || t.type === 'unitranche',
  );
  // §11 [v1.1.2] GROSS entry leverage across ALL term tranches — the same quantity
  // ModelOutput reports as `derived.entry_gross_leverage_fy`, read through the one shared
  // definition rather than recomputed here. Previously this took `x_ebitda` off the FIRST
  // senior/unitranche tranche only, so a deal with a PIK note or mezz (golden G3: senior
  // 3.0x + PIK 1.5x) showed "3.0x" beside a 4.5x headline on the same screen.
  const termLeverage = entryGrossLeverageFromAssumptions(facts, a);
  // §4 all-in rate through the ONE engine primitive (debt.ts sizes interest with the same
  // call) — never re-implemented here. Inlining `max(base,floor)+spread` was a second
  // calculation path for an engine number: if §4's floor convention ever moved, this preview
  // would silently disagree with the interest the engine actually charges.
  const blendedRate = term ? allInRate(term.pricing) : null;
  const g = a.operations.growth;

  return (
    <section>
      {/* ── Core-8 tier (always visible) ── */}
      <Row label="Entry EBITDA multiple" path="entry.entry_multiple">
        <NumInput value={a.entry.entry_multiple === null ? '' : num(a.entry.entry_multiple, 1)} suffix="x"
          onCommit={numCommit((v) => [{ ...a, entry: { ...a.entry, driver: 'multiple', entry_multiple: v, enterprise_value: null } }, ['entry.entry_multiple']])} />
      </Row>
      {facts.implied_trading_ev_ebitda !== null && (
        <p className="text-[10px] mb-2 text-right" style={labelStyle}>
          trades at ~{multiple(facts.implied_trading_ev_ebitda)} {sizingBasisLabel(facts.sizing_basis)} EBITDA (read-only anchor)
        </p>
      )}
      <Row label={`Total leverage (gross, x ${sizingBasisLabel(facts.sizing_basis)} EBITDA)`} path="structure.tranches">
        <NumInput value={termLeverage === null ? 'n/a' : num(termLeverage, 1)} suffix="x" readOnly={termLeverage === null}
          onCommit={numCommit((v) => {
            // Rescale every term tranche PROPORTIONALLY so the total becomes v × FY EBITDA —
            // via the SAME implementation the §13 `leverage` sensitivity axis uses.
            // Writing v onto each tranche (the previous behaviour) MULTIPLIED leverage:
            // typing 4.0 on a two-tranche deal produced 8.0x under a field labelled "total".
            return [rescaleTermTranchesToLeverage(facts, a, v), ['structure.tranches']];
          })} />
      </Row>
      <Row label="Blended debt rate" path="structure.tranches">
        <NumInput value={blendedRate === null ? 'n/a' : toPctInput(blendedRate)} suffix="%" readOnly
          onCommit={() => undefined} />
      </Row>
      <Row label="Revenue growth" path="operations.growth">
        <span className="text-[10px] mr-1" style={labelStyle}>
          {toPctInput(g[0] ?? 0)}% → {toPctInput(g[g.length - 1] ?? 0)}%
        </span>
        <button onClick={() => setByYear((b) => !b)} className="px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
          style={{ border: '1px solid rgba(17,17,17,0.15)', color: 'rgba(17,17,17,0.55)', fontFamily: mono }}>
          {byYear ? 'hide years' : 'edit by year'}
        </button>
      </Row>
      {byYear && (
        <div className="flex gap-1 mb-2 justify-end">
          {g.map((gy, i) => (
            <NumInput key={i} width="w-14" value={toPctInput(gy)}
              onCommit={pctCommit((v) => {
                const growth = [...g]; growth[i] = v;
                return [{ ...a, operations: { ...a.operations, growth } }, ['operations.growth']];
              })} />
          ))}
        </div>
      )}
      <Row label="Target EBITDA margin" path="operations.target_margin">
        <NumInput value={toPctInput(a.operations.target_margin)} suffix="%"
          onCommit={pctCommit((v) => [{ ...a, operations: { ...a.operations, target_margin: v } }, ['operations.target_margin']])} />
      </Row>
      <Row label="Maintenance capex" path="operations.maint_capex_pct_revenue">
        <NumInput value={toPctInput(a.operations.maint_capex_pct_revenue)} suffix="% rev"
          onCommit={pctCommit((v) => [{ ...a, operations: { ...a.operations, maint_capex_pct_revenue: v } }, ['operations.maint_capex_pct_revenue']])} />
      </Row>
      <Row label="Exit multiple" path="exit.multiple">
        <NumInput value={num(a.exit.multiple, 1)} suffix="x"
          onCommit={numCommit((v) => [{ ...a, exit: { ...a.exit, multiple: v } }, ['exit.multiple']])} />
      </Row>
      <Row label="Holding period" path="entry.hold_years">
        <NumInput value={String(a.entry.hold_years)} suffix="yrs" readOnly onCommit={() => undefined} />
      </Row>

      {/* ── Advanced (collapsed) ── */}
      <details className="mt-3">
        <summary className="text-[10px] tracking-widest uppercase cursor-pointer" style={labelStyle}>
          Advanced — tax · fees · sweep · MIP · distributions
        </summary>
        <div className="mt-2">
          <Row label="Tax rate" path="tax.rate">
            <NumInput value={toPctInput(a.tax.rate)} suffix="%"
              onCommit={pctCommit((v) => [{ ...a, tax: { ...a.tax, rate: v } }, ['tax.rate']])} />
          </Row>
          <Row label="Cash sweep" path="structure.sweep">
            <NumInput value={toPctInput(a.structure.sweep.base_pct)} suffix="%"
              onCommit={pctCommit((v) => [{ ...a, structure: { ...a.structure, sweep: { ...a.structure.sweep, base_pct: v } } }, ['structure.sweep']])} />
          </Row>
          <Row label="Transaction fees" path="fees">
            <NumInput value={toPctInput(a.fees.transaction_pct_of_ev)} suffix="% EV"
              onCommit={pctCommit((v) => [{ ...a, fees: { ...a.fees, transaction_pct_of_ev: v } }, ['fees']])} />
          </Row>
          <Row label="MIP pool" path="mip">
            <NumInput value={a.mip ? toPctInput(a.mip.pool_pct) : ''} suffix="%"
              onCommit={pctCommit((v) => [{ ...a, mip: a.mip ? { ...a.mip, pool_pct: v } : { pool_pct: v, hurdle_moic: 2.0 } }, ['mip']])} />
          </Row>
          {/* ── §3 step 7 / §3.7 [v1.1.0] interim distributions ──────────────────────
              Class B, Advanced tier. The suggestion layer proposes NEITHER field (§16): a
              distribution policy is a sponsor decision with no history or convention basis,
              so both start OFF and wear YOU the moment they are touched. */}
          <Row label="Distributions / yr" path="structure.distributions">
            <NumInput
              value={a.structure.distributions === null ? '' : num(a.structure.distributions[0] ?? 0, 1)}
              suffix={`× ${a.entry.hold_years}y`}
              onCommit={numCommit((v) => [
                {
                  ...a,
                  // §16 gate: length ≡ hold_years, entries ≥ 0. Zero clears the schedule
                  // back to null so "off" stays a single representation.
                  structure: {
                    ...a.structure,
                    distributions: v > 0 ? Array.from({ length: a.entry.hold_years }, () => v) : null,
                  },
                },
                ['structure.distributions'],
              ])} />
          </Row>
          <Row label="RP trap (net lev)" path="covenants.rp_trap">
            <NumInput value={a.covenants.rp_trap === null ? '' : num(a.covenants.rp_trap.level, 2)} suffix="x"
              onCommit={numCommit((v) => [
                {
                  ...a,
                  covenants: { ...a.covenants, rp_trap: v > 0 ? { metric: 'net_leverage', level: v } : null },
                },
                ['covenants.rp_trap'],
              ])} />
          </Row>
          {a.structure.distributions !== null && (
            <p className="text-[10px] text-right" style={labelStyle}>
              requested per year; what is PAID is capped by cash above the {num(a.structure.min_cash, 1)} floor
              {a.covenants.rp_trap === null ? ' (no RP trap)' : ` and by the ${num(a.covenants.rp_trap.level, 2)}x pro-forma test`} — blocked capacity does not carry forward (§3.7)
            </p>
          )}
          {term && term.pricing.kind === 'floating' && (
            <p className="text-[10px] text-right" style={labelStyle}>
              {term.name}: base {toPctInput(term.pricing.base_rate)}% + {bps(term.pricing.spread)} (floor {toPctInput(term.pricing.floor)}%)
            </p>
          )}
          {/* ── §18 [v1.3.0] refinancing — Class B, Advanced tier ──────────────────────
              A scheduled repricing of the primary cash-pay term tranche: new spread + a call
              premium at year R, effective the whole of that year (§18.3). The suggestion layer
              proposes NONE (§16) — a refi is a sponsor decision, so the fields start OFF and wear
              YOU the moment touched. v1 UI models a repricing refi (par-for-par, new maturity
              extended past the hold, no new OID/fees); the full event schema (new OID/fee) is on
              the assumptions object for programmatic use. */}
          {term && term.pricing.kind === 'floating' && (() => {
            // THIS tranche's event only — a programmatic multi-tranche schedule (§18.11(vii))
            // must survive edits here; commits below preserve events on OTHER tranches.
            const refiEvents = a.structure.refinancing ?? [];
            const refi = refiEvents.find((e) => e.tranche_name === term.name) ?? null;
            const N = a.entry.hold_years;
            const base = term.pricing;
            const makeEvent = (over: Partial<RefinancingEvent>): RefinancingEvent => ({
              tranche_name: term.name,
              year: refi?.year ?? (N > 1 ? N - 1 : 1),
              // new maturity defaults PAST the hold so §18.3's no-balloon gate always passes.
              new_maturity_years: refi?.new_maturity_years ?? N + 1,
              new_pricing: refi?.new_pricing ?? { kind: 'floating', base_rate: base.base_rate, spread: base.spread, floor: base.floor },
              call_premium_pct: refi?.call_premium_pct ?? 0.01,
              new_oid_pct: refi?.new_oid_pct ?? 0,
              new_financing_fee_pct: refi?.new_financing_fee_pct ?? 0,
              new_amort_pct_of_face: refi?.new_amort_pct_of_face ?? term.amort_pct_of_face,
              ...over,
            });
            // Each commit fn RETURNS [next, paths] — the store's set() does the write (basis YOU).
            const otherEvents = refiEvents.filter((e) => e.tranche_name !== term.name);
            const withRefi = (over: Partial<RefinancingEvent>): [DealAssumptions, string[]] => [
              { ...a, structure: { ...a.structure, refinancing: [...otherEvents, makeEvent(over)] } },
              ['structure.refinancing'],
            ];
            const newSpread = refi && refi.new_pricing.kind === 'floating' ? refi.new_pricing.spread : base.spread;
            return (
              <>
                <Row label={`Refinance ${term.name} (year)`} path="structure.refinancing">
                  <NumInput value={refi === null ? '' : String(refi.year)} suffix={`of ${N}`}
                    onCommit={numCommit((v) => {
                      // §18.3 gate: 1 ≤ year ≤ hold−1. 0/blank/out-of-range clears the refi.
                      const yr = Math.round(v);
                      if (yr < 1 || yr > N - 1) return [{ ...a, structure: { ...a.structure, refinancing: otherEvents.length ? otherEvents : null } }, ['structure.refinancing']];
                      return withRefi({ year: yr });
                    })} />
                </Row>
                {refi !== null && (
                  <>
                    <Row label="↳ new spread" path="structure.refinancing">
                      <NumInput value={toPctInput(newSpread)} suffix="%"
                        onCommit={pctCommit((v) => withRefi({ new_pricing: { kind: 'floating', base_rate: base.base_rate, spread: v, floor: base.floor } }))} />
                    </Row>
                    <Row label="↳ call premium" path="structure.refinancing">
                      <NumInput value={toPctInput(refi.call_premium_pct)} suffix="%"
                        onCommit={pctCommit((v) => withRefi({ call_premium_pct: v }))} />
                    </Row>
                    <p className="text-[10px] text-right" style={labelStyle}>
                      {term.name} reprices to base {toPctInput(base.base_rate)}% + {bps(newSpread)} at year {refi.year};
                      a {toPctInput(refi.call_premium_pct)}% call premium is paid that year, the old unamortized
                      OID and fees write off (tax deduction the following year), maturity extends past the hold (§18).
                    </p>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </details>
    </section>
  );
};

export default AssumptionsPanel;
