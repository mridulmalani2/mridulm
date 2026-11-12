/**
 * The trace panel: where a number comes from. It shows the row of the Excel model that produces
 * the figure, its formula with every reference named, and the rows that feed it; each of those
 * can be opened in place or stepped into, down to the typed inputs. Everything is read from the
 * workbook's own formula graph (lib/trace), so what is shown here is what a reviewer finds in the
 * exported file. No figure is calculated here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useDealUi } from '../../../store/dealUi';
import type { TraceGroup, TraceIndex, TraceNode } from '../../../lib/trace';
import { CopyButton, Drawer, Skeleton, Tag, cx } from '../ui/kit';

type TraceModule = typeof import('../../../lib/trace');
type Fmt = (n: TraceNode) => string;

const Caret: React.FC<{ open?: boolean }> = ({ open }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={cx('shrink-0 transition-transform duration-150', open && 'rotate-90')}><path d="M3.5 2 6.5 5l-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Arrow: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0"><path d="M2.5 6h7M6.5 3 9.5 6l-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const Section: React.FC<{ title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, count, aside, children }) => (
  <section>
    <header className="flex items-center justify-between gap-3 mb-2">
      <h4 className="text-[12px] font-medium text-[color:var(--de-ink-3)]">{title}{count !== undefined && <span className="de-num ml-1.5">{count}</span>}</h4>
      {aside}
    </header>
    {children}
  </section>
);

/** One row of the model that feeds the figure: a single cell, or the same row across years. */
const Feed: React.FC<{ group: TraceGroup; index: TraceIndex; fmt: Fmt; open: (key: string) => void; hot: string | null; setHot: (k: string | null) => void; depth: number }> = ({ group, index, fmt, open, hot, setHot, depth }) => {
  const [expanded, setExpanded] = useState(false);
  const first = group.cells[0];
  const many = group.cells.length > 1;
  const isHot = hot !== null && group.cells.some((c) => c.key === hot);
  const canExpand = !many && first.precedents.length > 0 && depth < 3;
  const inner = expanded ? index.groups(first) : [];
  return (
    <li>
      <div onMouseEnter={() => setHot(first.key)} onMouseLeave={() => setHot(null)}
        className={cx('rounded-[var(--de-r-sm)] transition-colors', isHot && 'bg-[var(--de-sunken)]')}>
        {many ? (
          <div className="px-2 py-2">
            <p className="text-[13px] leading-snug">{group.label}</p>
            <div className="de-scroll-x mt-1.5">
              <div className="inline-flex gap-px rounded-[var(--de-r-sm)] overflow-hidden border border-[color:var(--de-rule)] bg-[var(--de-rule)]">
                {group.cells.map((c) => (
                  <button key={c.key} type="button" onClick={() => open(c.key)} title={`${c.sheet}!${c.addr}`}
                    className="group/cell flex flex-col items-end min-w-[4.25rem] px-2 py-1.5 bg-[var(--de-surface)] hover:bg-[var(--de-hover)] text-right">
                    <span className="text-[10.5px] text-[color:var(--de-ink-3)] whitespace-nowrap">{c.period ?? c.addr}</span>
                    <span className={cx('de-num text-[12.5px] font-medium whitespace-nowrap', c.is_input && 'text-[color:var(--de-input)]')}>{fmt(c)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-stretch">
            {canExpand ? (
              <button type="button" aria-expanded={expanded} aria-label={expanded ? `Hide what feeds ${first.label}` : `Show what feeds ${first.label}`} onClick={() => setExpanded((e) => !e)}
                className="flex items-center justify-center w-6 shrink-0 rounded-l-[var(--de-r-sm)] text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)]"><Caret open={expanded} /></button>
            ) : <span className="w-6 shrink-0 flex items-center justify-center" aria-hidden="true"><span className={cx('w-1 h-1 rounded-full', first.is_input ? 'bg-[var(--de-input)]' : 'bg-[var(--de-rule-strong)]')} /></span>}
            <button type="button" onClick={() => open(first.key)}
              className="group/row flex-1 min-w-0 flex items-baseline justify-between gap-4 pl-0.5 pr-2 py-2 text-left">
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug">{first.label}</span>
                <span className="block text-[11px] text-[color:var(--de-ink-3)]">{[first.period, first.is_input ? 'typed input' : null].filter(Boolean).join(' · ') || `${first.sheet} sheet`}</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap">
                <span className={cx('de-num text-[13px] font-medium', first.is_input && 'text-[color:var(--de-input)]')}>{fmt(first)}</span>
                <span className="text-[color:var(--de-ink-3)] opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 transition-opacity"><Arrow /></span>
              </span>
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <ul className="de-enter ml-3 pl-2 border-l border-[color:var(--de-rule)]">
          {inner.map((g) => <Feed key={g.cells[0].key} group={g} index={index} fmt={fmt} open={open} hot={hot} setHot={setHot} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
};

const Loading: React.FC = () => (
  <div className="space-y-6" aria-label="Reading the model" role="status">
    <div><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-48 mt-2" /><Skeleton className="h-9 w-32 mt-4" /></div>
    <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-16 w-full" /></div>
    <div className="space-y-2"><Skeleton className="h-3 w-20" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
  </div>
);

const TraceDrawer: React.FC = () => {
  const target = useDealUi((s) => s.trace);
  const setTrace = useDealUi((s) => s.setTrace);
  const output = useEngine2Model((s) => s.output);
  const [trail, setTrail] = useState<string[]>([]);
  const [hot, setHot] = useState<string | null>(null);
  const [showExcel, setShowExcel] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  // the trace reads the Excel model, so the workbook builder is loaded only when a figure is first traced
  const [lib, setLib] = useState<TraceModule | null>(null);
  useEffect(() => { if (target && !lib) void import('../../../lib/trace').then(setLib); }, [target, lib]);

  const index: TraceIndex | null = useMemo(() => {
    if (!target || !output || !lib) return null;
    try { return lib.traceIndexFor(output); } catch { return null; }
  }, [target, output, lib]);
  const root = useMemo(() => (index && target ? index.find(target.label, target.year, target.sheet) : null), [index, target]);
  useEffect(() => { setTrail(root ? [root.key] : []); }, [root]);

  const current = trail[trail.length - 1];
  useEffect(() => { setHot(null); setShowInputs(false); }, [current]);
  const back = trail.length > 1 ? () => setTrail((t) => t.slice(0, -1)) : null;
  // Alt + Left steps back, as in a browser
  useEffect(() => {
    if (!target || trail.length < 2) return;
    const onKey = (e: KeyboardEvent) => { if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); setTrail((t) => t.slice(0, -1)); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, trail.length]);

  const node: TraceNode | null = index && current ? index.node(current) : null;
  const groups = useMemo(() => (node && index ? index.groups(node) : []), [node, index]);
  const parts = useMemo(() => (node && index ? index.parts(node) : []), [node, index]);
  const behind = useMemo(() => (node && index && !node.is_input ? index.inputsBehind(node) : null), [node, index]);

  if (!target) return null;
  const close = () => setTrace(null);
  const fmt: Fmt = lib ? lib.formatTraced : () => '';
  const open = (key: string) => setTrail((t) => (t[t.length - 1] === key ? t : [...t, key]));
  const shown = node ? fmt(node) : '';

  return (
    <Drawer open onClose={close} title="Where this comes from" width="w-[32rem]">
      {!lib && output ? <Loading /> : !output ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">Build the model to trace its figures.</p>
      ) : !node || !index ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">This figure is not a row of the Excel model, so there is no formula to show for it.</p>
      ) : (
        <div className="space-y-7">
          {back && (
            <nav aria-label="Trail" className="flex items-center gap-1 text-[12px] -mt-1 min-w-0">
              <button type="button" onClick={back} aria-label="Back one step" title="Back one step (Alt + Left)"
                className="inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-[var(--de-r-sm)] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)] rotate-180"><Arrow /></button>
              <ol className="flex items-center gap-1 min-w-0 overflow-hidden">
                {trail.slice(0, -1).slice(-3).map((k, i, visible) => {
                  const at = trail.length - 1 - visible.length + i;
                  return (
                    <li key={k + at} className="flex items-center gap-1 min-w-0">
                      {i === 0 && at > 0 && <span className="text-[color:var(--de-ink-3)]">…</span>}
                      <button type="button" onClick={() => setTrail(trail.slice(0, at + 1))}
                        className="px-1.5 py-0.5 rounded max-w-[9rem] truncate text-[color:var(--de-ink-3)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]">{index.node(k)?.label ?? k}</button>
                      <span className="text-[color:var(--de-ink-3)]" aria-hidden="true">›</span>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <div key={node.key} className="de-swap space-y-7">
            <div>
              <p className="text-[12px] font-medium text-[color:var(--de-ink-3)]">{node.period ?? (node.is_input ? 'Input' : 'Result')}</p>
              <h3 className="text-[18px] font-semibold leading-snug mt-0.5">{node.label}</h3>
              <p className={cx('de-num text-[36px] font-semibold leading-none mt-3 tracking-[-0.02em]', node.is_input && 'text-[color:var(--de-input)]')}>
                {shown}{node.unit && !/%|x/.test(shown) && typeof node.value === 'number' ? <span className="text-[13px] font-normal text-[color:var(--de-ink-3)] ml-2 tracking-normal">{node.unit}</span> : null}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Tag tone={node.is_input ? 'input' : 'neutral'}>{node.is_input ? 'typed input' : 'calculated'}</Tag>
                <span className="inline-flex items-center gap-0.5 de-num text-[12px] text-[color:var(--de-ink-3)]">
                  {node.sheet} sheet, cell {node.addr}
                  <CopyButton text={`${node.sheet}!${node.addr}`} said="Cell reference copied" label="Copy the cell reference" />
                </span>
              </p>
            </div>

            {node.formula ? (
              <Section title="How it is calculated">
                {node.rule && <p className="text-[14px] leading-relaxed mb-2.5">{node.label} = {node.rule}</p>}
                <p className="font-mono text-[12px] leading-[1.9] text-[color:var(--de-ink-3)] px-3 py-2.5 rounded-[var(--de-r-sm)] border border-[color:var(--de-rule)] break-words">
                  <span aria-hidden="true">= </span>
                  {parts.map((p, i) => p.kind === 'text' ? <span key={i}>{p.text}</span> : (
                    <button key={i} type="button" className="de-ref" data-input={index.node(p.keys[0])?.is_input || undefined} data-hot={hot !== null && p.keys.includes(hot) ? true : undefined}
                      onMouseEnter={() => setHot(p.keys[0])} onMouseLeave={() => setHot(null)} onClick={() => open(p.keys[0])}>
                      {p.label}{p.span ? `, ${p.span}` : ''}
                    </button>
                  ))}
                </p>
                <div className="mt-2">
                  <button type="button" aria-expanded={showExcel} onClick={() => setShowExcel((s) => !s)}
                    className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)]"><Caret open={showExcel} />As written in Excel</button>
                  {showExcel && (
                    <div className="de-enter mt-1.5 flex items-start gap-1 pl-3 pr-1 py-1.5 rounded-[var(--de-r-sm)] bg-[var(--de-sunken)]">
                      <code className="flex-1 font-mono text-[12px] leading-relaxed text-[color:var(--de-ink-2)] break-all py-0.5">={node.formula}</code>
                      <CopyButton text={`=${node.formula}`} said="Formula copied" label="Copy the formula" />
                    </div>
                  )}
                </div>
              </Section>
            ) : (
              <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)]">
                {node.is_input ? 'This is a number entered on the Inputs sheet. Nothing feeds it: it is where the chain starts.' : 'This cell holds a value with no formula.'}
              </p>
            )}

            {groups.length > 0 && (
              <Section title="Fed by" count={groups.length}>
                <ul className="-mx-2">
                  {groups.map((g) => <Feed key={g.cells[0].key} group={g} index={index} fmt={fmt} open={open} hot={hot} setHot={setHot} depth={0} />)}
                </ul>
              </Section>
            )}

            {behind && behind.inputs.length > 0 && (
              <Section title="Typed inputs behind this figure" count={behind.inputs.length}
                aside={<button type="button" aria-expanded={showInputs} onClick={() => setShowInputs((s) => !s)} className="text-[12px] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)] underline underline-offset-2 decoration-dotted">{showInputs ? 'Hide' : 'Show'}</button>}>
                {showInputs ? (
                  <ul className="de-enter -mx-2">
                    {behind.inputs.map((n) => (
                      <li key={n.key}>
                        <button type="button" onClick={() => open(n.key)} className="w-full flex items-baseline justify-between gap-4 px-2 py-1.5 rounded-[var(--de-r-sm)] text-left hover:bg-[var(--de-sunken)]">
                          <span className="min-w-0 text-[13px] leading-snug">{n.label}{n.period && <span className="text-[color:var(--de-ink-3)]">, {n.period}</span>}</span>
                          <span className="de-num text-[13px] font-medium text-[color:var(--de-input)] whitespace-nowrap">{fmt(n)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)]">Every number someone typed that this figure rests on, however many steps back{behind.complete ? '' : ' (the nearest ones; the chain runs further)'}.</p>
                )}
              </Section>
            )}
          </div>

          <p className="text-[12px] text-[color:var(--de-ink-3)] leading-relaxed border-t border-[color:var(--de-rule)] pt-4">
            These are the formulas of the Excel model you can export. The app and the workbook are held to the same numbers by a recalculation test, so either can be checked against the other.
          </p>
        </div>
      )}
    </Drawer>
  );
};

export default TraceDrawer;
