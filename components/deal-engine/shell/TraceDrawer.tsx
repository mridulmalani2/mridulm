/**
 * The trace panel: where a number comes from. It shows the row of the Excel model that produces
 * the figure, its formula in words and as written, and the cells that feed it; each of those can
 * be opened in turn, down to the typed inputs. Everything is read from the workbook's own formula
 * graph (lib/trace), so what is shown here is what a reviewer finds in the exported file.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useDealUi } from '../../../store/dealUi';
import type { TraceIndex, TraceNode } from '../../../lib/trace';
import { Drawer, Tag, cx } from '../ui/kit';

type TraceModule = typeof import('../../../lib/trace');

const TraceDrawer: React.FC = () => {
  const target = useDealUi((s) => s.trace);
  const setTrace = useDealUi((s) => s.setTrace);
  const output = useEngine2Model((s) => s.output);
  const [trail, setTrail] = useState<string[]>([]);
  // the trace reads the Excel model, so the workbook builder is loaded only when a figure is first traced
  const [lib, setLib] = useState<TraceModule | null>(null);
  useEffect(() => { if (target && !lib) void import('../../../lib/trace').then(setLib); }, [target, lib]);

  const index: TraceIndex | null = useMemo(() => {
    if (!target || !output || !lib) return null;
    try { return lib.traceIndexFor(output); } catch { return null; }
  }, [target, output, lib]);
  const root = useMemo(() => (index && target ? index.find(target.label, target.year, target.sheet) : null), [index, target]);
  useEffect(() => { setTrail(root ? [root.key] : []); }, [root]);

  if (!target) return null;
  const close = () => setTrace(null);
  const formatTraced = lib ? lib.formatTraced : () => '';
  const node: TraceNode | null = index && trail.length ? index.node(trail[trail.length - 1]) : null;
  const feeds = node && index ? node.precedents.map((k) => index.node(k)).filter((n): n is TraceNode => n !== null) : [];
  const readable = node && index ? index.readable(node) : null;

  return (
    <Drawer open onClose={close} title="Where this comes from" width="w-[30rem]">
      {!lib && output ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">Reading the model</p>
      ) : !output ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">Build the model to trace its figures.</p>
      ) : !node ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">This figure is not a row of the Excel model, so there is no formula to show for it.</p>
      ) : (
        <div className="space-y-6">
          {trail.length > 1 && (
            <nav aria-label="Trail" className="flex flex-wrap items-center gap-1 text-[12px]">
              {trail.map((k, i) => {
                const n = index!.node(k);
                const last = i === trail.length - 1;
                return (
                  <React.Fragment key={k + i}>
                    {i > 0 && <span className="text-[color:var(--de-ink-3)]">›</span>}
                    <button type="button" disabled={last} onClick={() => setTrail(trail.slice(0, i + 1))}
                      className={cx('px-1.5 py-0.5 rounded max-w-[11rem] truncate', last ? 'font-medium' : 'text-[color:var(--de-ink-3)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]')}>
                      {n?.label ?? k}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
          )}

          <div>
            <p className="text-[13px] text-[color:var(--de-ink-3)]">{node.period ?? (node.is_input ? 'Input' : 'Result')}</p>
            <h3 className="text-[18px] font-semibold leading-snug mt-0.5">{node.label}</h3>
            <p className={cx('de-num text-[34px] font-semibold leading-none mt-3 tracking-[-0.02em]', node.is_input && 'text-[color:var(--de-input)]')}>
              {formatTraced(node)}{node.unit && !/%|x/.test(formatTraced(node)) && typeof node.value === 'number' ? <span className="text-[13px] font-normal text-[color:var(--de-ink-3)] ml-2">{node.unit}</span> : null}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <Tag tone={node.is_input ? 'input' : 'neutral'}>{node.is_input ? 'typed input' : 'calculated'}</Tag>
              <span className="de-num text-[12px] text-[color:var(--de-ink-3)]">Excel model: {node.sheet}!{node.addr}</span>
            </p>
          </div>

          {node.formula ? (
            <div>
              <p className="text-[13px] font-semibold mb-2">How it is calculated</p>
              {node.rule && <p className="text-[14px] text-[color:var(--de-ink)] mb-2">{node.rule}</p>}
              {readable && <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] break-words">{readable}</p>}
              <p className="font-mono text-[12px] leading-relaxed text-[color:var(--de-ink-3)] mt-2 px-3 py-2 rounded-[var(--de-r-sm)] bg-[var(--de-sunken)] break-all">={node.formula}</p>
            </div>
          ) : (
            <p className="text-[13px] text-[color:var(--de-ink-2)]">
              {node.is_input ? 'This is a number entered on the Inputs sheet. Nothing feeds it: it is where the chain starts.' : 'This cell holds a value with no formula.'}
            </p>
          )}

          {feeds.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold mb-1">Fed by</p>
              <ul className="-mx-2">
                {feeds.map((f) => (
                  <li key={f.key}>
                    <button type="button" onClick={() => setTrail([...trail, f.key])}
                      className="w-full flex items-baseline justify-between gap-4 px-2 py-2 rounded-[var(--de-r-sm)] text-left hover:bg-[var(--de-sunken)]">
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-snug">{f.label}</span>
                        <span className="de-num block text-[11px] text-[color:var(--de-ink-3)]">{[f.period, `${f.sheet}!${f.addr}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={cx('de-num text-[13px] font-medium whitespace-nowrap', f.is_input && 'text-[color:var(--de-input)]')}>{formatTraced(f)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-[color:var(--de-ink-3)] leading-relaxed border-t border-[color:var(--de-rule)] pt-4">
            These are the formulas of the Excel model you can export. The app and the workbook are held to the same numbers by a recalculation test, so either can be checked against the other.
          </p>
        </div>
      )}
    </Drawer>
  );
};

export default TraceDrawer;
