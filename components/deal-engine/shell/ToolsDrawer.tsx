/**
 * Tools: solve for a target return, draft the memo, and the optional AI challenge. Each tool
 * says what it gives and what it needs. The solver and the memo need no key; the challenge asks
 * questions and never changes an input. Suggestions and questions about the deal live in the
 * assistant panel (AssistantDock), not among the tools.
 */
import React, { useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useDealEngineStore } from '../../../store/dealEngine';
import { useDealUi } from '../../../store/dealUi';
import { setPath } from '../../../lib/engine2/draft';
import { labelFor } from '../../../lib/engine2/draft';
import { plainLabel } from '../v2/sections';
import { multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import type { DealAssumptions } from '../../../lib/engine2/types';
import type { GoalSeekLever } from '../../../lib/ai2/goalseek';
import ApiKeyInline from '../start/ApiKeyInline';
import { Button, Drawer, Dropdown, Tag } from '../ui/kit';
import { download, fileStem } from '../results/exportModel';

const LEVERS: { value: GoalSeekLever; label: string; show: (v: number) => string }[] = [
  { value: 'entry_multiple', label: 'the entry multiple', show: (v) => multiple(v, 2) },
  { value: 'exit_multiple', label: 'the exit multiple', show: (v) => multiple(v, 2) },
  { value: 'leverage', label: 'debt at close (× EBITDA)', show: (v) => multiple(v, 2) },
  { value: 'growth_shift', label: 'revenue growth, every year', show: (v) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v) * 100, 2)} pts on every year` },
];

const Tool: React.FC<{ title: string; gives: string; needs?: React.ReactNode; children: React.ReactNode }> = ({ title, gives, needs, children }) => (
  <section className="py-6 border-t border-[color:var(--de-rule)] first:border-t-0 first:pt-0">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {needs}
    </div>
    <p className="text-[13px] text-[color:var(--de-ink-2)] mt-1 mb-3 max-w-[52ch]">{gives}</p>
    {children}
  </section>
);

const Solver: React.FC = () => {
  const facts = useEngine2Model((s) => s.facts);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const edit = useEngine2Model((s) => s.editAssumptions);
  const blank = useEngine2Model((s) => (s.assumptions ? s.missing().length : 1));
  const [target, setTarget] = useState('');
  const [lever, setLever] = useState<GoalSeekLever>('entry_multiple');
  const [result, setResult] = useState<{ lever: GoalSeekLever; value: number; irr: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!facts || !assumptions) return null;
  const solve = async () => {
    setResult(null);
    const t = Number(target) / 100;
    if (target.trim() === '' || !Number.isFinite(t)) { setMessage('Enter the return you are solving for.'); return; }
    if (blank > 0) { setMessage('Complete the input sheet first: the solver runs the model.'); return; }
    const { solveForIrr } = await import('../../../lib/ai2/goalseek');
    let r = null;
    try { r = solveForIrr(facts, assumptions, lever, t); } catch (e: unknown) { setMessage((e as Error).message); return; }
    if (!r) { setMessage(`No value of ${LEVERS.find((l) => l.value === lever)!.label} gives ${num(t * 100, 2)}%. The target is out of its reach.`); return; }
    setMessage(null);
    setResult({ lever, value: r.value, irr: r.achieved_irr });
  };
  const apply = () => {
    if (!result) return;
    if (result.lever === 'exit_multiple') edit(setPath<DealAssumptions>(assumptions, 'exit.multiple', result.value), ['exit.multiple']);
    if (result.lever === 'entry_multiple') edit({ ...assumptions, entry: { ...assumptions.entry, driver: 'multiple', entry_multiple: result.value, enterprise_value: null } }, ['entry.entry_multiple', 'entry.driver']);
    setResult(null);
    setMessage('Applied to the input sheet.');
  };
  const info = result ? LEVERS.find((l) => l.value === result.lever)! : null;
  return (
    <Tool title="Solve for a target return" gives="Finds the value of one input that produces the sponsor IRR you name, holding every other input as entered. For example, the highest price that still clears your hurdle.">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[color:var(--de-ink-2)]">Sponsor IRR of</span>
        <span className="de-control inline-flex items-center w-24">
          <input aria-label="Target IRR, percent" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') solve(); }}
            className="de-num min-w-0 w-full h-full bg-transparent outline-none text-right text-[14px] text-[color:var(--de-input)] pl-2 pr-1" />
          <span className="pr-2 text-[12px] text-[color:var(--de-ink-3)]">%</span>
        </span>
        <span className="text-[13px] text-[color:var(--de-ink-2)]">by changing</span>
        <Dropdown ariaLabel="Input to solve" value={lever} align="left" className="w-56" onChange={(v) => { setLever(v); setResult(null); }}
          options={LEVERS.filter((l) => (l.value !== 'leverage' || (facts.fy_ebitda ?? 0) > 0) && (l.value !== 'growth_shift' || (!assumptions.operations.lines?.revenue && facts.fy_revenue !== null))).map((l) => ({ value: l.value, label: l.label }))} />
        <Button variant="primary" size="sm" onClick={solve}>Solve</Button>
      </div>
      {result && info && (
        <div className="mt-3 px-4 py-3 rounded-[var(--de-r-sm)] bg-[var(--de-paper)] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]">Set {info.label} to <span className="de-num font-semibold">{info.show(result.value)}</span> for a sponsor IRR of <span className="de-num font-semibold">{pct(result.irr, 2)}</span>.</p>
          {(result.lever === 'entry_multiple' || result.lever === 'exit_multiple') && <Button size="sm" onClick={apply}>Use this value</Button>}
        </div>
      )}
      {message && <p className="text-[13px] text-[color:var(--de-ink-2)] mt-3">{message}</p>}
    </Tool>
  );
};

export const ToolsDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const aiBusy = useEngine2Model((s) => s.aiBusy);
  const runRedline = useEngine2Model((s) => s.runRedlineAction);
  const redline = useEngine2Model((s) => s.redlineItems);
  const error = useEngine2Model((s) => s.error);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const jumpTo = useDealUi((s) => s.jumpTo);
  const keyTag = apiKey ? <Tag tone="ai">AI on</Tag> : <Tag>needs an AI key</Tag>;
  const memo = async () => {
    if (!output || !facts) return;
    const { memoSkeleton } = await import('../../../lib/ai2/memo');
    download(`${fileStem(facts.entity_name)}_memo.md`, memoSkeleton(output, facts.currency as Engine2Currency), 'text/markdown');
  };
  return (
    <Drawer open={open} onClose={onClose} title="Tools" width="w-[34rem]">
      <Solver />
      <Tool title="Draft the memo" gives="A written summary of the built model: price, sources and uses, returns, capitalisation, credit and the points to check. A text file you can edit."
        needs={!output ? <Tag>build the model first</Tag> : undefined}>
        <Button size="sm" disabled={!output} onClick={memo}>Download the memo</Button>
      </Tool>
      <Tool title="Challenge my assumptions" gives="A hostile read of the inputs, as a sceptical committee member would give it: one hard question per weak assumption. It edits nothing." needs={keyTag}>
        <Button size="sm" disabled={!apiKey || aiBusy} onClick={runRedline}>{aiBusy ? 'Working' : 'Run the challenge'}</Button>
        {redline && redline.length > 0 && (
          <ul className="mt-3 space-y-2">
            {redline.map((r, i) => (
              <li key={i} className="px-3 py-2.5 rounded-[var(--de-r-sm)] bg-[var(--de-ai-soft)]">
                <button type="button" onClick={() => { onClose(); jumpTo(r.path); }} className="text-[12px] font-medium text-[color:var(--de-ai)] underline underline-offset-2 decoration-dotted">{plainLabel(labelFor(r.path))}</button>
                <p className="text-[13px] text-[color:var(--de-ink)] mt-0.5">{r.challenge}</p>
              </li>
            ))}
          </ul>
        )}
      </Tool>
      {error && <p className="text-[13px] text-[color:var(--de-accent)]">{error}</p>}
      <section className="pt-6 border-t border-[color:var(--de-rule)]">
        <h3 className="text-[15px] font-semibold">AI key</h3>
        <p className="text-[13px] text-[color:var(--de-ink-2)] mt-1 mb-3">Optional. Every step works without one. A key adds a suggested value for the inputs no filing or cited source covers, and answers to your own questions. A paid key gives fuller, company-specific suggestions than a free one.</p>
        <ApiKeyInline />
      </section>
    </Drawer>
  );
};
