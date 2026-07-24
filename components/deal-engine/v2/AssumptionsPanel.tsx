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
import type { DealAssumptions, CashPayTrancheAssumption } from '../../../lib/engine2/types';

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
  const termLeverage = term && term.size.x_ebitda !== undefined ? term.size.x_ebitda : null;
  const blendedRate = term
    ? term.pricing.kind === 'floating'
      ? Math.max(term.pricing.base_rate, term.pricing.floor) + term.pricing.spread
      : term.pricing.rate
    : null;
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
          trades at ~{multiple(facts.implied_trading_ev_ebitda)} FY EBITDA (read-only anchor)
        </p>
      )}
      <Row label="Total leverage" path="structure.tranches">
        <NumInput value={termLeverage === null ? 'n/a' : num(termLeverage, 1)} suffix="x" readOnly={termLeverage === null}
          onCommit={numCommit((v) => {
            const tranches = a.structure.tranches.map((t) => (t.type === 'revolver' || !('size' in t) || t.size.x_ebitda === undefined ? t : { ...t, size: { x_ebitda: v } }));
            return [{ ...a, structure: { ...a.structure, tranches } }, ['structure.tranches']];
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
          Advanced — tax · fees · sweep · MIP
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
          {term && term.pricing.kind === 'floating' && (
            <p className="text-[10px] text-right" style={labelStyle}>
              {term.name}: base {toPctInput(term.pricing.base_rate)}% + {bps(term.pricing.spread)} (floor {toPctInput(term.pricing.floor)}%)
            </p>
          )}
        </div>
      </details>
    </section>
  );
};

export default AssumptionsPanel;
