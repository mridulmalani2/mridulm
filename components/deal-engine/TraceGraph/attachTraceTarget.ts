/**
 * attachTraceTarget — wraps a value element with trace metadata and the
 * double-click handler that opens a TraceCard. Only fires when Trace Mode is
 * active. Returns props to spread onto the wrapping <span>.
 *
 * Usage:
 *   <span {...attachTraceTarget('returns.irr', traceModeActive, onOpenCard)}>
 *     {fmtPct(irr)}
 *   </span>
 */

import type { HTMLAttributes } from 'react';

export interface TraceTargetProps extends HTMLAttributes<HTMLSpanElement> {
  'data-trace-id': string;
  className: string;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
}

export function attachTraceTarget(
  fieldPath: string,
  traceModeActive: boolean,
  onOpenCard: (fieldPath: string) => void,
): TraceTargetProps {
  const base: TraceTargetProps = {
    'data-trace-id': fieldPath,
    className: traceModeActive ? 'traceable traceable--active' : 'traceable',
  };

  if (!traceModeActive) return base;

  return {
    ...base,
    onClick: (e) => {
      e.stopPropagation();
      onOpenCard(fieldPath);
    },
  };
}
