/**
 * The analysis views of the Results step: what moves the return most (tornado), the return at any
 * two inputs (grid), how far an input can move before the deal stops working (break-evens), and
 * covenant headroom and liquidity by year.
 *
 * No arithmetic lives here. Every figure is a full run of the one engine through lib/analysis, or
 * a field of the model output. The step sizes and the hurdle are the analyst's: the steps start
 * at a visible, editable value; the hurdle starts blank.
 */
import React, { useMemo, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { breakEvens, customGrid, gridAxes, headlineOf, tornado, type FlexDriver, type FlexId } from '../../../lib/analysis';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { covenantEbitdaCushion } from '../../../lib/engine2/display';
import { money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import { Card, Dropdown, Segmented, cx } from '../ui/kit';
import { ChartFrame } from './charts';

/** A small typed number that belongs to the analysis (a step, a hurdle), not to the model. */
const MiniNum: React.FC<{ value: string; onChange: (v: string) => void; suffix: string; ariaLabel: string; width?: string }> = ({ value, onChange, suffix, ariaLabel, width = 'w-20' }) => (
  <span className={cx('de-control inline-flex items-center !h-7', width)}>
    <input aria-label={ariaLabel} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
      className="de-num min-w-0 w-full h-full bg-transparent outline-none text-right text-[13px] text-[color:var(--de-input)] pl-1.5 pr-1" />
    <span className="pr-1.5 text-[11px] text-[color:var(--de-ink-3)]">{suffix}</span>
  </span>
);

const scaleOf = (d: Pick<FlexDriver, 'unit'>) => (d.unit === 'x' ? 1 : 100);
const suffixOf = (d: Pick<FlexDriver, 'unit'>) => (d.unit === 'x' ? 'x' : d.unit === 'pts' ? 'pts' : '%');
const parseStep = (text: string, scale: number): number | null => {
  const t = text.trim();
  if (t === '' || /\s/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v / scale : null;
};

// ── tornado ─────────────────────────────────────────────────────────────────────────────────

export const TornadoCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const assumptions = useEngine2Model((s) => s.assumptions)!;
  const [drafts, setDrafts] = useState<Partial<Record<FlexId, string>>>({});
  const steps = useMemo(() => {
    const out: Partial<Record<FlexId, number>> = {};
    for (const [id, text] of Object.entries(drafts) as [FlexId, string][]) {
      const unit = id === 'entry_multiple' || id === 'exit_multiple' || id === 'leverage' ? 'x' : 'pts';
      const v = parseStep(text, scaleOf({ unit }));
      if (v !== null) out[id] = v;
    }
    return out;
  }, [drafts]);
  const bars = useMemo(() => tornado(o.facts, assumptions, o, steps), [o, assumptions, steps]);
  const base = headlineOf(o).irr;
  if (base === null) return <Card title="What moves the return"><p className="text-[14px] text-[color:var(--de-ink-2)]">The base case is not meaningful, so there is nothing to flex.</p></Card>;

  // the bars arrive widest first, so the first bar's swing is the scale of the chart
  const reach = bars[0] && bars[0].swing > 0 ? bars[0].swing : 1;
  // The chart is one SVG laid out in percentages, so it saves as a picture with its labels; the
  // step inputs sit in a column beside it on the same row height.
  const ROW = 36, C = 60, HALF = 21;
  const half = (irr: number | null) => (irr === null ? 0 : (Math.abs(irr - base) / reach) * HALF);
  return (
    <ChartFrame title="What moves the return" name="tornado" aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">sponsor IRR with one driver moved, the rest held · base {pct(base, 2)}</span>}>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-x-4 items-start">
        <svg width="100%" height={bars.length * ROW} role="img" aria-label="Tornado chart of sponsor IRR by driver">
          <line x1={`${C}%`} x2={`${C}%`} y1="0" y2={bars.length * ROW} stroke="var(--de-ink-3)" />
          {bars.map((b, i) => {
            const y = i * ROW;
            const bar = (p: typeof b.low, fill: string) => {
              if (p.irr === null) return null;
              const w = half(p.irr);
              return <rect x={`${p.irr < base ? C - w : C}%`} y={y + 7} width={`${w}%`} height={ROW - 14} rx="3" fill={fill} />;
            };
            return (
              <g key={b.driver.id}>
                <text x="0" y={y + ROW / 2 + 4} fontSize="13" fill="var(--de-ink)">{b.driver.label}</text>
                {bar(b.low, 'var(--de-rule-strong)')}
                {bar(b.high, 'var(--de-ink)')}
                <text x="100%" y={y + ROW / 2 + 4} textAnchor="end" fontSize="12" fill="var(--de-ink-2)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {b.low.irr === null ? 'N/A' : pct(b.low.irr, 1)} to {b.high.irr === null ? 'N/A' : pct(b.high.irr, 1)}
                </text>
              </g>
            );
          })}
        </svg>
        <div>
          {bars.map((b) => {
            const scale = scaleOf(b.driver);
            const shown = drafts[b.driver.id] ?? num(b.step * scale, b.driver.unit === 'x' ? 1 : 0);
            return (
              <div key={b.driver.id} className="flex items-center gap-1 text-[12px] text-[color:var(--de-ink-3)]" style={{ height: ROW }}>
                ±<MiniNum ariaLabel={`${b.driver.label} step`} value={shown} suffix={suffixOf(b.driver)} width="w-[5rem]" onChange={(v) => setDrafts((d) => ({ ...d, [b.driver.id]: v }))} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[12px] text-[color:var(--de-ink-3)] mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[var(--de-rule-strong)]" />driver one step down</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[var(--de-ink)]" />driver one step up</span>
        <span>Change a step to flex by a different amount. N/A: the structure does not hold at that point.</span>
      </p>
    </ChartFrame>
  );
};

// ── two-way grid ────────────────────────────────────────────────────────────────────────────

export const GridCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const assumptions = useEngine2Model((s) => s.assumptions)!;
  const axes = useMemo(() => gridAxes(o.facts, assumptions, o), [o, assumptions]);
  const [rowId, setRowId] = useState(axes[0].axis);
  const [colId, setColId] = useState(axes[1].axis);
  const [metric, setMetric] = useState<'irr' | 'moic'>('irr');
  const [rowStep, setRowStep] = useState('');
  const [colStep, setColStep] = useState('');
  const [hurdle, setHurdle] = useState('');
  const row = axes.find((a) => a.axis === rowId) ?? axes[0];
  const col = axes.find((a) => a.axis === colId && a.axis !== row.axis) ?? axes.find((a) => a.axis !== row.axis)!;
  const rs = parseStep(rowStep, row.unit === 'x' ? 1 : 100) ?? row.step;
  const cs = parseStep(colStep, col.unit === 'x' ? 1 : 100) ?? col.step;
  const grid = useMemo(() => customGrid(o.facts, assumptions, o, row, col, rs, cs), [o, assumptions, row, col, rs, cs]);
  const h = hurdle.trim() === '' || !Number.isFinite(Number(hurdle)) ? null : Number(hurdle) / 100;
  const head = (a: typeof row, v: number) => (a.unit === 'x' ? multiple(v, 1) : a.axis === 'growth' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v) * 100, 1)} pts` : pct(v, 1));
  const cells = grid ? (metric === 'irr' ? grid.irr : grid.moic) : null;
  const base = cells ? cells[2][2] : null;
  const opts = axes.map((a) => ({ value: a.axis, label: a.label }));
  return (
    <Card title="The return at any two inputs" aside={<Segmented size="sm" ariaLabel="Figure shown" value={metric} onChange={setMetric} options={[{ value: 'irr', label: 'IRR' }, { value: 'moic', label: 'Money multiple' }]} />}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-[13px] text-[color:var(--de-ink-2)]">
        <span className="flex flex-wrap items-center gap-2">Down
          <Dropdown ariaLabel="Rows" align="left" className="w-52 max-w-full" value={row.axis} options={opts.filter((x) => x.value !== col.axis)} onChange={(v) => { setRowId(v); setRowStep(''); }} />
          step <MiniNum ariaLabel="Row step" value={rowStep || num(row.step * (row.unit === 'x' ? 1 : 100), 1)} suffix={row.unit === 'x' ? 'x' : 'pts'} onChange={setRowStep} />
        </span>
        <span className="flex flex-wrap items-center gap-2">Across
          <Dropdown ariaLabel="Columns" align="left" className="w-52 max-w-full" value={col.axis} options={opts.filter((x) => x.value !== row.axis)} onChange={(v) => { setColId(v); setColStep(''); }} />
          step <MiniNum ariaLabel="Column step" value={colStep || num(col.step * (col.unit === 'x' ? 1 : 100), 1)} suffix={col.unit === 'x' ? 'x' : 'pts'} onChange={setColStep} />
        </span>
        {metric === 'irr' && <span className="inline-flex items-center gap-2">Your hurdle <MiniNum ariaLabel="Hurdle IRR" value={hurdle} suffix="%" onChange={setHurdle} /></span>}
      </div>
      {!cells || !grid ? <p className="text-[14px] text-[color:var(--de-ink-2)]">This pair of inputs cannot be flexed together on this deal.</p> : (
        <div className="de-scroll-x">
          <table className="w-full border-separate border-spacing-1 de-num">
            <thead>
              <tr>
                <th className="w-24" />
                {grid.col_values.map((v, c) => <th key={c} className={cx('text-[12px] font-medium text-right px-2 pb-1', c === 2 ? 'text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)]')}>{head(col, v)}</th>)}
              </tr>
            </thead>
            <tbody>
              {cells.map((line, r) => (
                <tr key={r}>
                  <th scope="row" className={cx('text-[12px] font-medium text-right pr-2 whitespace-nowrap', r === 2 ? 'text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)]')}>{head(row, grid.row_values[r])}</th>
                  {line.map((v, c) => {
                    const isBase = r === 2 && c === 2;
                    const below = metric === 'irr' && h !== null && v !== null && v < h;
                    return (
                      <td key={c} className={cx('text-[13px] text-right px-2 h-9 rounded-[5px]',
                        v === null ? 'bg-[var(--de-sunken)] text-[color:var(--de-ink-3)]'
                          : base !== null && v > base ? 'bg-[var(--de-pos-soft)]' : base !== null && v < base ? 'bg-[var(--de-accent-soft)]' : 'bg-[var(--de-sunken)]',
                        isBase && 'font-semibold shadow-[inset_0_0_0_1.5px_var(--de-ink)]',
                        below && 'text-[color:var(--de-accent)]')}>
                        {v === null ? 'N/A' : metric === 'irr' ? pct(v, 1) : multiple(v, 2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3 max-w-[80ch]">
        The outlined cell is the base case. Green is above it, red below{metric === 'irr' && h !== null ? '; red figures are below your hurdle' : ''}. Each cell is a full run of the model. When the entry multiple or the debt moves, entry is re-priced; operating inputs leave the purchase price and the debt as built. N/A: the structure does not hold there.
      </p>
    </Card>
  );
};

// ── break-evens ─────────────────────────────────────────────────────────────────────────────

export const BreakEvenCard: React.FC<{ o: Engine2ModelOutput }> = ({ o }) => {
  const assumptions = useEngine2Model((s) => s.assumptions)!;
  const [hurdle, setHurdle] = useState('');
  const h = hurdle.trim() === '' || !Number.isFinite(Number(hurdle)) ? null : Number(hurdle) / 100;
  const atZero = useMemo(() => breakEvens(o.facts, assumptions, o, 0), [o, assumptions]);
  const atHurdle = useMemo(() => (h === null ? null : breakEvens(o.facts, assumptions, o, h)), [o, assumptions, h]);
  const base = headlineOf(o).irr;
  const show = (lever: string, v: number | null) => (v === null ? 'out of reach' : lever === 'growth_shift' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v) * 100, 2)} pts` : multiple(v, 2));
  const room = (lever: string, b: number | null, v: number | null) => {
    if (b === null || v === null) return '–';
    const d = v - b;
    return lever === 'growth_shift' ? `${d > 0 ? '+' : '−'}${num(Math.abs(d) * 100, 2)} pts` : `${d > 0 ? '+' : '−'}${num(Math.abs(d), 2)}x`;
  };
  return (
    <Card title="How far it can bend" aside={
      <span className="inline-flex items-center gap-2 text-[13px] text-[color:var(--de-ink-2)]">Your hurdle IRR <MiniNum ariaLabel="Hurdle IRR" value={hurdle} suffix="%" onChange={setHurdle} /></span>}>
      <div className="de-scroll-x">
        <table className="de-table de-num">
          <thead>
            <tr>
              <th>One input moved, the rest held</th>
              <th>Base case</th>
              {atHurdle && <th>At your hurdle ({pct(h, 1)})</th>}
              {atHurdle && <th>Room to the hurdle</th>}
              <th>Money back (0% IRR)</th>
              <th>Room to money back</th>
            </tr>
          </thead>
          <tbody>
            {atZero.map((z, i) => (
              <tr key={z.lever}>
                <td>{z.label}</td>
                <td>{z.lever === 'growth_shift' ? 'as entered' : z.base === null ? '–' : multiple(z.base, 2)}</td>
                {atHurdle && <td className="font-medium">{show(z.lever, atHurdle[i].value)}</td>}
                {atHurdle && <td>{room(z.lever, z.base, atHurdle[i].value)}</td>}
                <td className="font-medium">{show(z.lever, z.value)}</td>
                <td>{room(z.lever, z.base, z.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3 max-w-[80ch]">
        {h === null ? 'Enter your hurdle to see how far each input can move before the return falls to it. ' : ''}
        Each figure is the value of that one input at which the sponsor IRR equals the target{base !== null ? ` (base case ${pct(base, 2)})` : ''}, found by re-running the model. “Out of reach” means no value in the input’s plausible range gets there.
      </p>
    </Card>
  );
};

// ── covenants and liquidity ─────────────────────────────────────────────────────────────────

const levelAt = (v: number | number[] | null, i: number): number | null => (v === null ? null : Array.isArray(v) ? v[i] ?? null : v);

/** A small line chart: one or two series over the years of the hold. */
const Lines: React.FC<{ series: { name: string; values: (number | null)[]; dashed?: boolean; color: string }[]; fmt: (v: number) => string }> = ({ series, fmt }) => {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (!all.length) return null;
  const n = series[0].values.length;
  const lo = Math.min(0, ...all); // y-axis extent: chart geometry
  const hi = Math.max(...all) * 1.12 || 1; // y-axis extent: chart geometry
  const W = 640, H = 200, L = 44, R = 12, T = 10, B = 26;
  const x = (i: number) => L + (n === 1 ? 0.5 : i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--de-rule)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--de-ink-3)">{fmt(t)}</text>
        </g>
      ))}
      {Array.from({ length: n }, (_, i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--de-ink-3)">Y{i + 1}</text>)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
        return (
          <g key={s.name}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />
            {!s.dashed && s.values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} />))}
          </g>
        );
      })}
    </svg>
  );
};

export const CovenantCards: React.FC<{ o: Engine2ModelOutput; ccy: Engine2Currency }> = ({ o, ccy }) => {
  const cov = o.assumptions.covenants;
  const years = o.credit.map((_, i) => i);
  const levLevels = years.map((i) => levelAt(cov.leverage_max, i));
  const hasLev = cov.leverage_max !== null;
  const tests: { name: string; actual: (number | null)[]; level: (number | null)[]; head: (number | null)[]; max: boolean }[] = [
    ...(hasLev ? [{ name: 'Net leverage (maximum)', actual: o.credit.map((c) => c.net_leverage), level: levLevels, head: o.credit.map((c) => c.leverage_headroom), max: true }] : []),
    ...(cov.dscr_min !== null ? [{ name: 'DSCR (minimum)', actual: o.credit.map((c) => c.dscr), level: years.map((i) => levelAt(cov.dscr_min, i)), head: o.credit.map((c) => c.dscr_headroom), max: false }] : []),
    ...(cov.fccr_min !== null ? [{ name: 'FCCR (minimum)', actual: o.credit.map((c) => c.fccr), level: years.map((i) => levelAt(cov.fccr_min, i)), head: o.credit.map((c) => c.fccr_headroom), max: false }] : []),
  ];
  const cash = o.waterfall.map((w) => w.closing_cash);
  const minCash = o.assumptions.structure.min_cash;
  const low = cash.indexOf(headlineOf(o).min_cash);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <ChartFrame title="Leverage against the covenant" name="leverage-covenant"
        aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">net debt ÷ EBITDA, year end</span>}>
        <Lines fmt={(v) => `${num(v, 1)}x`} series={[
          { name: 'Net leverage', values: o.credit.map((c) => c.net_leverage), color: 'var(--de-ink)' },
          ...(hasLev ? [{ name: 'Covenant', values: levLevels, dashed: true, color: 'var(--de-accent)' }] : []),
        ]} />
        <p className="text-[12px] text-[color:var(--de-ink-3)] mt-2">
          {hasLev ? 'Solid: the deal. Dashed: the maximum the covenant allows.' : 'No leverage covenant is set on this deal. Add one under Distributions and covenants to see headroom against it.'}
        </p>
      </ChartFrame>
      <ChartFrame title="Cash through the hold" name="cash" aside={<span className="text-[12px] text-[color:var(--de-ink-3)]">closing cash, year end</span>}>
        <Lines fmt={(v) => num(v, 0)} series={[
          { name: 'Closing cash', values: cash, color: 'var(--de-ink)' },
          { name: 'Minimum cash', values: cash.map(() => minCash), dashed: true, color: 'var(--de-accent)' },
        ]} />
        <p className="text-[12px] text-[color:var(--de-ink-3)] mt-2">
          Lowest in year {low + 1}: {money(cash[low], ccy, 1)} against a minimum of {money(minCash, ccy, 1)}.
          {o.revolver ? ` The revolver is drawn in ${o.revolver.filter((r) => r.ending_drawn > 0).length} of ${o.revolver.length} years.` : ''}
        </p>
      </ChartFrame>
      {tests.length > 0 && (
        <Card title="Covenant headroom by year" className="xl:col-span-2">
          <div className="de-scroll-x">
            <table className="de-table de-num">
              <thead><tr><th>Test</th><th />{years.map((i) => <th key={i}>Y{i + 1}</th>)}</tr></thead>
              <tbody>
                {tests.map((t) => (
                  <React.Fragment key={t.name}>
                    <tr><td rowSpan={t.max ? 4 : 3} className="align-top font-medium">{t.name}</td><td className="!text-left text-[color:var(--de-ink-3)]">deal</td>{t.actual.map((v, i) => <td key={i}>{v === null ? 'N/A' : `${num(v, 2)}x`}</td>)}</tr>
                    <tr><td className="!text-left text-[color:var(--de-ink-3)]">covenant</td>{t.level.map((v, i) => <td key={i}>{v === null ? '–' : `${num(v, 2)}x`}</td>)}</tr>
                    <tr><td className="!text-left text-[color:var(--de-ink-3)]">headroom</td>{t.head.map((v, i) => <td key={i} className={cx('font-medium', v !== null && v < 0 && 'text-[color:var(--de-accent)]')}>{v === null ? 'N/A' : `${num(v, 2)}x`}</td>)}</tr>
                    {t.max && (
                      <tr><td className="!text-left text-[color:var(--de-ink-3)]">EBITDA can fall by</td>{t.actual.map((v, i) => {
                        const cushion = covenantEbitdaCushion(v, t.level[i]);
                        return <td key={i} className={cx(cushion !== null && cushion < 0 && 'text-[color:var(--de-accent)]')}>{cushion === null ? 'N/A' : pct(cushion, 1)}</td>;
                      })}</tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3">Negative headroom is a breach. “EBITDA can fall by” holds net debt as modelled in that year.</p>
        </Card>
      )}
    </div>
  );
};
