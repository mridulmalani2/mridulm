/**
 * The assistant: a panel docked beside the page on Clean, Assumptions and Results. It follows the
 * step and the field the analyst is in, says what the next move is, lists the sourced values on
 * offer, and opens how any of them was reached. It also answers questions in the analyst's words.
 *
 * It suggests and explains; it never changes the model. Every action here is a click the analyst
 * makes. Everything on the Guide side is worked out from the model by plain rules, with no AI
 * call. An AI key adds one thing: answers and explanations phrased in plain English from the same
 * notes. The page works in full without it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useDealEngineStore } from '../../../store/dealEngine';
import { useCleaning, useCleaningStore } from '../../../store/cleaning';
import { useWorkspace, workspaceStore } from '../../../store/workspace';
import { dealUiStore, useDealUi } from '../../../store/dealUi';
import { tryRun } from '../../../lib/analysis';
import type { Engine2Currency } from '../../../lib/format';
import { acceptCandidate, setLeaseChoice, updateAdjustment } from '../../../lib/cleaning/ops';
import { PROVIDER_DEFAULTS } from '../../../lib/ai2/gateway/providers';
import { adviseAssumptions, adviseClean, adviseResults } from '../../../lib/assistant/advisor';
import { buildNotes, starters } from '../../../lib/assistant/brief';
import type { Answer as AskAnswer } from '../../../lib/assistant/ask';
import type { Advice, AssistAction, AssistItem, AssistStep } from '../../../lib/assistant/types';
import { SECTIONS, sectionOf } from '../v2/sections';
import { exportExcelModel } from '../results/exportModel';
import ApiKeyInline from '../start/ApiKeyInline';
import { Button, CopyButton, IconButton, Segmented, cx } from '../ui/kit';

// ── answers as text ──────────────────────────────────────────────────────────────────────────

/** Bold and inline code inside one line of an answer. Plain text otherwise: nothing is treated as markup. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t)) return <strong key={i} className="font-semibold">{t.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(t)) return <code key={i} className="de-num px-1 py-px rounded bg-[var(--de-sunken)] text-[13px]">{t.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{t}</React.Fragment>;
  });
}

export type AnswerBlock = { kind: 'p' | 'h'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

/** An answer as paragraphs, short headings and lists, read from the plain text the model returns. */
export function answerBlocks(text: string): AnswerBlock[] {
  const out: AnswerBlock[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (line === '') { out.push({ kind: 'p', text: '' }); continue; }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line) ?? /^\*\*([^*]+)\*\*:?$/.exec(line);
    const last = out[out.length - 1];
    if (bullet) { if (last?.kind === 'ul') last.items.push(bullet[1]); else out.push({ kind: 'ul', items: [bullet[1]] }); }
    else if (numbered) { if (last?.kind === 'ol') last.items.push(numbered[1]); else out.push({ kind: 'ol', items: [numbered[1]] }); }
    else if (heading) out.push({ kind: 'h', text: heading[1] });
    else if (last?.kind === 'p' && last.text !== '') last.text += ` ${line}`;
    else out.push({ kind: 'p', text: line });
  }
  return out.filter((b) => b.kind !== 'p' || b.text !== '');
}

const AnswerText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-2 text-[13.5px] leading-relaxed">
    {answerBlocks(text).map((b, i) => {
      if ('text' in b) return <p key={i} className={b.kind === 'h' ? 'font-semibold pt-1' : undefined}>{inline(b.text)}</p>;
      const items = b.items.map((it, j) => <li key={j} className="pl-1">{inline(it)}</li>);
      return b.kind === 'ul' ? <ul key={i} className="list-disc pl-5 space-y-1 marker:text-[color:var(--de-ink-3)]">{items}</ul> : <ol key={i} className="list-decimal pl-5 space-y-1 marker:text-[color:var(--de-ink-3)]">{items}</ol>;
    })}
  </div>
);

// ── pieces of the guide ──────────────────────────────────────────────────────────────────────

const Chevron: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={cx('shrink-0', className)}><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--de-ink-3)]">{children}</p>
);

/** The item the panel leads with: what it is, the value on offer, why, and the one thing to click. */
const Lead: React.FC<{ label: string; item: AssistItem; run: (a: AssistAction) => void; onWhy: () => void }> = ({ label, item, run, onWhy }) => (
  <section className="de-enter">
    <Label>{label}</Label>
    {/* a flag's title is its own opening words: said once, as the text */}
    <h3 className="text-[15px] font-semibold leading-snug mt-1.5">{item.body.startsWith(item.title.replace(/…$/, '')) ? 'To check' : item.title}</h3>
    {item.value && <p className="de-num text-[26px] font-semibold leading-none tracking-[-0.01em] mt-2.5 text-[color:var(--de-input)]">{item.value}</p>}
    <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">{item.body}</p>
    {(item.actions.length > 0 || item.why) && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
        {item.actions[0] && <Button size="sm" variant="primary" onClick={() => run(item.actions[0])}>{item.actions[0].label}</Button>}
        {item.actions.slice(1).map((a) => (
          <button key={a.label} type="button" onClick={() => run(a)} className="text-[13px] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]">{a.label}</button>
        ))}
        {item.why && (
          <button type="button" onClick={onWhy} className="inline-flex items-center gap-1 text-[13px] text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">
            {item.value ? 'Why this value' : 'More on this'}
          </button>
        )}
      </div>
    )}
  </section>
);

/** One further item: a line that opens its explanation. */
const Row: React.FC<{ item: AssistItem; onOpen: () => void }> = ({ item, onOpen }) => (
  <li className="border-b border-[color:var(--de-rule)]">
    <button type="button" onClick={onOpen} className="group w-full flex items-center gap-3 py-2.5 text-left">
      <span aria-hidden="true" className={cx('w-1.5 h-1.5 rounded-full shrink-0', item.tone === 'check' ? 'bg-[var(--de-accent)]' : item.tone === 'offer' ? 'bg-[var(--de-input)]' : 'bg-[var(--de-rule-strong)]')} />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-[color:var(--de-ink)] truncate">{item.title}</span>
      {item.value && <span className="de-num text-[13px] font-medium text-[color:var(--de-input)] shrink-0 max-w-[45%] truncate">{item.value}</span>}
      <Chevron className="text-[color:var(--de-ink-3)] group-hover:text-[color:var(--de-ink)] group-hover:translate-x-0.5 transition-transform" />
    </button>
  </li>
);

/** How a value was reached, and what the analyst can do with it. */
const Detail: React.FC<{ item: AssistItem; run: (a: AssistAction) => void; onBack: () => void; canReword: boolean }> = ({ item, run, onBack, canReword }) => {
  const [plain, setPlain] = useState<{ state: 'idle' | 'busy' } | { state: 'done'; text: string } | { state: 'kept'; why: string }>({ state: 'idle' });
  const why = item.why;
  const reword = async () => {
    if (!why) return;
    setPlain({ state: 'busy' });
    try {
      const [{ plainWords }, { makeAiChat, savedAiConfig }] = await Promise.all([import('../../../lib/assistant/ask'), import('../../../lib/ai2/textCall')]);
      const cfg = savedAiConfig();
      if (!cfg) { setPlain({ state: 'kept', why: 'No AI key is saved.' }); return; }
      const text = await plainWords(why, makeAiChat(cfg.provider, cfg.apiKey));
      setPlain(text ? { state: 'done', text } : { state: 'kept', why: 'The reworded version changed a figure, so the original stays.' });
    } catch (e: unknown) {
      setPlain({ state: 'kept', why: (e as Error).message });
    }
  };
  return (
    <div className="de-enter">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 -ml-1 px-1 h-7 rounded text-[13px] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </button>
      <h3 className="text-[15px] font-semibold leading-snug mt-3">{why?.subject ?? item.title}</h3>
      {(why?.value ?? item.value) && <p className="de-num text-[26px] font-semibold leading-none tracking-[-0.01em] mt-2.5 text-[color:var(--de-input)]">{why?.value ?? item.value}</p>}

      {why ? (
        <>
          <p className="text-[12px] text-[color:var(--de-ink-3)] mt-3">{why.basis}</p>
          {plain.state === 'done' ? (
            <p className="text-[13.5px] leading-relaxed mt-1.5">{plain.text}</p>
          ) : (
            <>
              <p className="text-[13.5px] leading-relaxed mt-1.5">{why.how}</p>
              {why.source && <p className="text-[12px] leading-relaxed text-[color:var(--de-ink-2)] mt-2"><span className="text-[color:var(--de-ink-3)]">Source </span>{why.source}</p>}
            </>
          )}
          {plain.state === 'kept' && <p role="status" className="text-[12px] text-[color:var(--de-ink-3)] mt-2">{plain.why}</p>}
          {plain.state !== 'done' && why.notes.length > 0 && (
            <dl className="mt-4 border-t border-[color:var(--de-rule)]">
              {why.notes.map((n) => (
                <div key={n.heading} className="py-3 border-b border-[color:var(--de-rule)]">
                  <dt className="text-[12px] font-medium text-[color:var(--de-ink-3)]">{n.heading}</dt>
                  <dd className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-1">{n.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      ) : (
        <p className="text-[13.5px] leading-relaxed mt-3">{item.body}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4">
        {item.actions[0] && <Button size="sm" variant="primary" onClick={() => { run(item.actions[0]); onBack(); }}>{item.actions[0].label}</Button>}
        {item.actions.slice(1).map((a) => (
          <button key={a.label} type="button" onClick={() => { run(a); if (a.kind !== 'jump') onBack(); }} className="text-[13px] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]">{a.label}</button>
        ))}
      </div>
      {why && canReword && (
        <p className="mt-4 text-[12px] text-[color:var(--de-ink-3)]">
          {plain.state === 'done'
            ? <button type="button" onClick={() => setPlain({ state: 'idle' })} className="underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Show the original note</button>
            : <button type="button" disabled={plain.state === 'busy'} onClick={reword} className="underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)] disabled:no-underline">{plain.state === 'busy' ? 'Rewording' : 'Put it in plain words'}</button>}
        </p>
      )}
      {item.actions.some((a) => a.kind === 'accept' || a.kind === 'candidate' || a.kind === 'lease' || a.kind === 'forecast') && <p className="mt-3 text-[12px] text-[color:var(--de-ink-3)]">Nothing is applied until you click.</p>}
    </div>
  );
};

// ── the panel ────────────────────────────────────────────────────────────────────────────────

type ChatTurn = { who: 'you'; text: string } | ({ who: 'assistant' } & AskAnswer);

const MORE_LABEL: Record<AssistStep, string> = { source: 'Also', clean: 'Also on this step', assumptions: 'Still to enter', results: 'Worth a look' };
const SHOWN = 7;

const SECTION_ORDER = SECTIONS.map((s) => s.id);
const sectionTitle = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

const AssistantDock: React.FC<{ step: AssistStep; onGo: (step: AssistStep) => void }> = ({ step, onGo }) => {
  const ui = useDealUi((s) => s.assistant);
  const setUi = useDealUi((s) => s.setAssistant);
  const facts = useEngine2Model((s) => s.facts);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const pending = useEngine2Model((s) => s.pending);
  const missingFacts = useEngine2Model((s) => s.missingFacts);
  const suggestions = useEngine2Model((s) => s.suggestions);
  const output = useEngine2Model((s) => s.output);
  const cleaningStore = useCleaningStore();
  const pack = useCleaning((s) => s.pack);
  const ledger = useCleaning((s) => s.ledger);
  const cleaned = useCleaning((s) => s.cleaned);
  const flags = useCleaning((s) => s.flags);
  const dismissed = useCleaning((s) => s.dismissed);
  const cases = useWorkspace((s) => s.cases);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const aiProvider = useDealEngineStore((s) => s.aiProvider);

  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyBox, setKeyBox] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);

  const deal = facts?.entity_name ?? null;
  const ccy = (facts?.currency ?? 'USD') as Engine2Currency;
  const provider = PROVIDER_DEFAULTS[aiProvider]?.displayName.replace(/\s*\(.*\)$/, '') ?? aiProvider;

  // the field the analyst is in: read from the sheet's own markers, never from the panel itself
  useEffect(() => {
    if (typeof document === 'undefined' || step !== 'assumptions') { setFocusPath(null); return; }
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || panel.current?.contains(el)) return;
      const path = el.closest<HTMLElement>('[data-path]')?.dataset.path ?? null;
      if (path) setFocusPath(path);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [step]);
  // a conversation and an open explanation belong to one deal and one step
  useEffect(() => { setTurns([]); setQ(''); }, [deal]);
  useEffect(() => { setDetail(null); setAll(false); }, [deal, step]);
  useEffect(() => { if (ui.open && ui.tab === 'ask') end.current?.scrollIntoView({ block: 'end' }); }, [ui.open, ui.tab, turns.length, busy]);
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }, [q, ui.open]);
  useEffect(() => {
    if (!ui.open || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && panel.current?.contains(document.activeElement)) { if (detail) setDetail(null); else setUi({ open: false }); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.open, detail, setUi]);

  const blanks = useMemo(() => (assumptions ? useEngine2Model.getState().missing() : []), [assumptions, pending, missingFacts]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useMemo(() => {
    if (step !== 'assumptions' || !facts || !assumptions || blanks.length > 0 || missingFacts.length > 0) return null;
    const r = tryRun(facts, assumptions, pending);
    return r.ok ? { ok: true as const, flags: r.output.coherence.map((f) => ({ severity: f.severity, message: f.message })) } : { ok: false as const, reason: r.reason };
  }, [step, facts, assumptions, pending, blanks.length, missingFacts.length]);

  const advice: Advice | null = useMemo(() => {
    if (!facts) return null;
    if (step === 'clean' && pack) return adviseClean({ pack, ledger, flags, dismissed });
    if (step === 'assumptions') return adviseAssumptions({ assumptions, blanks, missingFacts, suggestions, currency: ccy, focusPath, live, sectionOf, sectionTitle, sectionOrder: SECTION_ORDER });
    if (step === 'results' && output) return adviseResults({ output, currency: ccy, casesSaved: cases.length });
    return null;
  }, [facts, step, pack, ledger, flags, dismissed, assumptions, blanks, missingFacts, suggestions, ccy, focusPath, live, output, cases.length]);

  if (!facts || step === 'source' || !ui.open) return null;

  const run = (a: AssistAction) => {
    const model = useEngine2Model.getState();
    const cleaning = cleaningStore.getState();
    const dealUi = dealUiStore.getState();
    if (a.kind === 'accept') { model.acceptSuggestion(a.key); dealUi.notify('Applied. You can change it on the sheet.'); }
    else if (a.kind === 'jump') { onGo('assumptions'); dealUi.jumpTo(a.path); }
    else if (a.kind === 'candidate') { const c = cleaning.pack?.candidates.find((x) => x.id === a.id); if (c) { cleaning.edit((l) => acceptCandidate(l, c)); dealUi.notify('Added to the bridge. Check the amounts there.'); } }
    else if (a.kind === 'dismiss') cleaning.dismiss(a.id);
    else if (a.kind === 'lease') cleaning.edit((l) => setLeaseChoice(l, a.choice));
    else if (a.kind === 'forecast') cleaning.edit((l) => updateAdjustment(l, a.id, { forecast: a.choice }));
    else if (a.kind === 'continue') { if (cleaning.confirmAdjusted()) onGo('assumptions'); }
    else if (a.kind === 'go') onGo(a.step);
    else if (a.kind === 'build') model.buildWithExhibits();
    else if (a.kind === 'view') { dealUi.setResultsView(a.view); onGo('results'); }
    else if (a.kind === 'panel') dealUi.setOverlay(a.panel);
    else if (a.kind === 'export' && model.output) void exportExcelModel(model.output, workspaceStore.getState().notes);
  };

  const items: AssistItem[] = advice ? [advice.here, advice.next, ...advice.more].filter((x): x is AssistItem => x !== null) : [];
  const open = detail ? items.find((i) => i.id === detail) ?? null : null;

  const send = async (history: ChatTurn[]) => {
    setTurns(history);
    setBusy(true);
    const question = history[history.length - 1].text;
    const [{ ask }, { makeAiChat, savedAiConfig }] = await Promise.all([import('../../../lib/assistant/ask'), import('../../../lib/ai2/textCall')]);
    const cfg = savedAiConfig();
    const notes = buildNotes({ step, facts, assumptions, output, blanks, suggestions, advice, focusPath, clean: pack ? { pack, ledger, cleaned, flags } : null });
    const answer = await ask(question, history.slice(0, -1).map((t) => ({ who: t.who, text: t.text })), notes, step, facts.entity_name, cfg ? makeAiChat(cfg.provider, cfg.apiKey) : null);
    setTurns([...history, { who: 'assistant', ...answer }]);
    setBusy(false);
  };
  const askNow = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ('');
    setUi({ tab: 'ask' });
    void send([...turns, { who: 'you', text: question }]);
  };

  return (
    <aside ref={panel} aria-label="Assistant" tabIndex={-1}
      className="de-no-print de-drawer outline-none fixed z-40 inset-0 sm:z-20 sm:inset-auto sm:top-16 sm:right-0 sm:bottom-0 sm:w-[22rem] flex flex-col bg-[var(--de-surface)] sm:border-l border-[color:var(--de-rule)] max-2xl:sm:shadow-[var(--de-shadow-pop)]">
      <header className="flex items-center justify-between gap-2 pl-5 pr-3 h-12 shrink-0 border-b border-[color:var(--de-rule)]">
        <h2 className="text-[14px] font-semibold">Assistant</h2>
        <div className="flex items-center gap-1.5">
          <Segmented ariaLabel="Assistant view" size="sm" value={ui.tab} onChange={(tab) => setUi({ tab })} options={[{ value: 'guide', label: 'Guide' }, { value: 'ask', label: 'Ask' }]} />
          <IconButton label="Hide the assistant" tipSide="end" onClick={() => setUi({ open: false })}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4M11.5 2.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {ui.tab === 'guide' ? (
          !advice ? (
            <p className="text-[13px] text-[color:var(--de-ink-2)]">Nothing to suggest on this step yet.</p>
          ) : open ? (
            <Detail key={open.id} item={open} run={run} onBack={() => setDetail(null)} canReword={!!apiKey} />
          ) : (
            <div className="space-y-6">
              <p className="text-[12.5px] leading-relaxed text-[color:var(--de-ink-2)]">{advice.status}.</p>
              {advice.here && <Lead label="This field" item={advice.here} run={run} onWhy={() => setDetail(advice.here!.id)} />}
              {advice.next && <Lead label={advice.here ? 'After this' : 'Next'} item={advice.next} run={run} onWhy={() => setDetail(advice.next!.id)} />}
              {advice.more.length > 0 && (
                <section>
                  <Label>{advice.moreLabel ?? MORE_LABEL[step]}</Label>
                  <ul className="mt-2 border-t border-[color:var(--de-rule)]">
                    {(all ? advice.more : advice.more.slice(0, SHOWN)).map((it) => <Row key={it.id} item={it} onOpen={() => setDetail(it.id)} />)}
                  </ul>
                  {advice.more.length > SHOWN && (
                    <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[12px] text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">
                      {all ? 'Show fewer' : `Show all ${advice.more.length}`}
                    </button>
                  )}
                  {step === 'assumptions' && advice.more.some((m) => m.tone === 'offer') && (
                    <p className="mt-3 flex items-center gap-2 text-[11px] text-[color:var(--de-ink-3)]"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--de-input)]" />a sourced value is ready</p>
                  )}
                </section>
              )}
            </div>
          )
        ) : (
          <div className="space-y-5">
            {turns.length === 0 && (
              <div className="de-enter">
                <p className="de-display text-[20px] leading-snug">Ask about {facts.entity_name}</p>
                <p className="text-[12.5px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">
                  {apiKey
                    ? `Answers are phrased by ${provider} from this model's own notes. A figure that is not in the model is marked.`
                    : 'Answers come straight from this model’s own notes. With an AI key they are phrased in plain English and can follow a conversation.'}
                </p>
                {!apiKey && (
                  keyBox
                    ? <div className="mt-3"><ApiKeyInline /></div>
                    : <button type="button" onClick={() => setKeyBox(true)} className="mt-2 text-[12.5px] text-[color:var(--de-ink-2)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Add a key (optional, a free one is enough)</button>
                )}
                <ul className="mt-5 border-t border-[color:var(--de-rule)]">
                  {starters(step, output !== null).map((s) => (
                    <li key={s} className="border-b border-[color:var(--de-rule)]">
                      <button type="button" onClick={() => askNow(s)} className="group w-full flex items-center justify-between gap-3 py-2.5 text-left text-[13px] text-[color:var(--de-ink)] hover:text-[color:var(--de-input)]">
                        {s}
                        <Chevron className="text-[color:var(--de-ink-3)] group-hover:text-[color:var(--de-input)] group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((t, i) => t.who === 'you' ? (
              <div key={i} className="de-enter flex justify-end">
                <p className="max-w-[88%] px-3 py-2 rounded-[14px] rounded-br-[4px] bg-[var(--de-ink)] text-white text-[13.5px] leading-relaxed whitespace-pre-wrap">{t.text}</p>
              </div>
            ) : (
              <div key={i} className="de-enter">
                {t.fellBack && <p className="mb-2 px-3 py-2 rounded-[var(--de-r-sm)] bg-[var(--de-warn-soft)] text-[12px] leading-relaxed text-[color:var(--de-warn)]">{t.fellBack} Here is what the model itself holds.</p>}
                <AnswerText text={t.text} />
                {t.unverified.length > 0 && (
                  <p className="mt-2 px-3 py-2 rounded-[var(--de-r-sm)] bg-[var(--de-accent-soft)] text-[12px] leading-relaxed text-[color:var(--de-accent)]">
                    Not a figure in this model: <span className="de-num font-medium">{t.unverified.join(', ')}</span>. Check before relying on it.
                  </p>
                )}
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[color:var(--de-ink-3)]">
                  <CopyButton text={t.text} said="Answer copied" label="Copy the answer" className="-ml-1.5" />
                  {t.by === 'ai' ? `Phrased by ${provider} from this model's notes` : 'From this model’s own notes'}
                </p>
              </div>
            ))}
            {busy && <p role="status" className="flex items-center gap-2 text-[13px] text-[color:var(--de-ink-3)]"><span className="de-dots" aria-hidden="true"><span /><span /><span /></span>Reading the model</p>}
            {turns.length > 0 && !busy && (
              <button type="button" onClick={() => setTurns([])} className="text-[12px] text-[color:var(--de-ink-3)] underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">New conversation</button>
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pt-3 pb-3.5 border-t border-[color:var(--de-rule)]">
        <div className="de-control !h-auto flex items-end gap-2 pl-3 pr-1.5 py-1.5">
          <textarea ref={box} rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this deal" aria-label="Question"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); askNow(q); } }}
            className="flex-1 min-w-0 max-h-32 resize-none bg-transparent outline-none text-[13.5px] leading-relaxed py-1 placeholder:text-[color:var(--de-ink-3)]" />
          <button type="button" aria-label="Send" disabled={!q.trim() || busy} onClick={() => askNow(q)}
            className={cx('inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-[var(--de-r-sm)] transition-colors', q.trim() && !busy ? 'bg-[var(--de-ink)] text-white hover:bg-[var(--de-ink-hover)]' : 'bg-[var(--de-sunken)] text-[color:var(--de-ink-3)] cursor-not-allowed')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11.5v-9M3.5 6 7 2.5 10.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AssistantDock;
