/**
 * Tools: solve for a target return, draft the memo, and the two optional AI helpers. Each tool
 * says what it gives and what it needs. The solver and the memo need no key; the AI helpers
 * propose and challenge, and never change an input themselves. Questions about the deal have
 * their own panel (AssistantDrawer) rather than sitting among the tools.
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
import { Button, Drawer, Dropdown, Tag, TextInput } from '../ui/kit';
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
  const aiSuggest = useEngine2Model((s) => s.aiSuggest);
  const runRedline = useEngine2Model((s) => s.runRedlineAction);
  const aiNotes = useEngine2Model((s) => s.aiNotes);
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
      <Tool title="AI proposals for blank inputs" gives="Asks the model you have connected to propose values for inputs the filing cannot support. Proposals appear as purple links beside the fields. Nothing is applied until you click one." needs={keyTag}>
        <Button size="sm" disabled={!apiKey || aiBusy} onClick={aiSuggest}>{aiBusy ? 'Working' : 'Get proposals'}</Button>
        {aiNotes.length > 0 && <ul className="mt-3 space-y-1">{aiNotes.map((n, i) => <li key={i} className="text-[12px] text-[color:var(--de-ink-2)]">{n}</li>)}</ul>}
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
        <p className="text-[13px] text-[color:var(--de-ink-2)] mt-1">Optional. Every step works without one.</p>
        <ApiKeyInline />
      </section>
    </Drawer>
  );
};

interface Turn { who: 'you' | 'ai'; text: string }

/** Questions about the deal on screen, answered from its own figures. Needs an AI key. */
export const AssistantDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const question = q.trim();
    if (!question || busy || !facts) return;
    setQ('');
    const next: Turn[] = [...turns, { who: 'you', text: question }];
    setTurns(next);
    setBusy(true);
    try {
      const { makeAiText, savedAiConfig } = await import('../../../lib/ai2/textCall');
      const cfg = savedAiConfig();
      if (!cfg) throw new Error('Add an AI key first.');
      const { memoSkeleton } = await import('../../../lib/ai2/memo');
      const context = output ? memoSkeleton(output, facts.currency as Engine2Currency) : `The model has not been built. Inputs entered so far: ${JSON.stringify(assumptions)}`;
      const system = `You answer questions about ONE leveraged buyout model for ${facts.entity_name}. Use ONLY the figures below; never invent a number. If the answer is not in them, say what is missing. Be brief and specific, and name the figure you rely on.\n\n${context}`;
      const user = next.map((t) => `${t.who === 'you' ? 'Analyst' : 'You'}: ${t.text}`).join('\n\n');
      const text = await makeAiText(cfg.provider, cfg.apiKey)(system, user);
      setTurns([...next, { who: 'ai', text: text.trim() }]);
    } catch (e: unknown) {
      setTurns([...next, { who: 'ai', text: `Could not answer: ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Ask about this deal" width="w-[30rem]">
      {!apiKey ? (
        <>
          <p className="text-[14px] text-[color:var(--de-ink-2)]">Ask questions in plain words and get answers drawn from this model's own figures. It needs an AI key, which stays in your browser and goes straight to the provider.</p>
          <ApiKeyInline />
        </>
      ) : (
        <div className="flex flex-col min-h-full">
          <div className="flex-1 space-y-3">
            {turns.length === 0 && (
              <div>
                <p className="text-[14px] text-[color:var(--de-ink-2)] mb-3">Answers come from the model's own figures{output ? '' : ' (build the model for fuller answers)'}.</p>
                <div className="flex flex-col items-start gap-1.5">
                  {['What drives the return in this deal?', 'Where is the structure most exposed?', 'Summarise the deal in three sentences.'].map((s) => (
                    <button key={s} type="button" onClick={() => setQ(s)} className="text-left text-[13px] px-3 py-2 rounded-[var(--de-r-sm)] bg-[var(--de-paper)] hover:bg-[var(--de-sunken)]">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.who === 'you' ? 'flex justify-end' : ''}>
                <p className={t.who === 'you' ? 'max-w-[85%] px-3 py-2 rounded-[var(--de-r)] bg-[var(--de-ink)] text-white text-[14px]' : 'text-[14px] leading-relaxed whitespace-pre-wrap'}>{t.text}</p>
              </div>
            ))}
            {busy && <p className="text-[13px] text-[color:var(--de-ink-3)]">Reading the model</p>}
          </div>
          <div className="sticky bottom-0 pt-4 pb-1 bg-[var(--de-surface)] flex gap-2">
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" aria-label="Question" onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} />
            <Button variant="primary" disabled={!q.trim() || busy} onClick={ask}>Ask</Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};
