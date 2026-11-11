/**
 * A horizontal waterfall: a start, signed steps, an end. Geometry comes from
 * lib/cleaning/view.waterfall — this component only draws it. A step whose amount is not
 * entered is drawn as text, never as a zero-width bar pretending to be nil.
 */
import React from 'react';
import type { WaterfallStep } from '../../../lib/cleaning/view';
import { acct, cx, delta } from './kit';

/** `debt`: the steps build a debt figure, so a step DOWN is the favourable one. */
const Waterfall: React.FC<{ steps: WaterfallStep[]; debt?: boolean }> = ({ steps, debt = false }) => (
  <div className="space-y-1.5">
    {steps.map((s) => (
      <div key={s.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.75rem] items-center gap-2">
        <span className={cx('font-sans text-[12px] truncate', s.kind === 'total' ? 'font-semibold' : 'text-[color:var(--de-ink-2)]')} title={s.label}>{s.label}</span>
        <span className="relative h-4 bg-[var(--de-sunken)]">
          {s.value !== null && (
            <span
              className={cx('absolute top-0 bottom-0', s.kind === 'total' ? 'bg-[var(--de-ink)]' : s.down !== debt ? 'bg-[var(--de-accent)]' : 'bg-[var(--de-pos)]')}
              style={{ left: `${s.left}%`, width: `max(${s.width}%, 2px)` }}
            />
          )}
        </span>
        <span className={cx('de-num text-[12px] text-right', s.kind === 'total' && 'font-semibold', s.value === null && 'text-[color:var(--de-accent)]')}>
          {s.value === null ? s.blank : s.kind === 'total' ? acct(s.value) : delta(s.value)}
        </span>
      </div>
    ))}
  </div>
);

export default Waterfall;
