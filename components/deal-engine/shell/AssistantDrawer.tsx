/**
 * Questions about the deal on screen, answered from its own figures. The panel is a conversation:
 * starter questions when it is empty, the analyst's questions on the right, answers on the left
 * with a copy control, a composer that grows with the text. It needs an AI key; the model is told
 * to use only the figures of this deal and to say what is missing rather than invent a number.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useDealEngineStore } from '../../../store/dealEngine';
import type { Engine2Currency } from '../../../lib/format';
import ApiKeyInline from '../start/ApiKeyInline';
import { CopyButton, Drawer, cx } from '../ui/kit';

export interface Turn { who: 'you' | 'ai'; text: string; failed?: boolean }

const STARTERS = [
  'What drives the return in this deal?',
  'Where is the structure most exposed?',
  'How much of the return comes from paying down debt?',
  'Which year is tightest on cash, and why?',
  'Summarise the deal in three sentences.',
];

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
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (bullet) { if (last?.kind === 'ul') last.items.push(bullet[1]); else out.push({ kind: 'ul', items: [bullet[1]] }); }
    else if (numbered) { if (last?.kind === 'ol') last.items.push(numbered[1]); else out.push({ kind: 'ol', items: [numbered[1]] }); }
    else if (heading) out.push({ kind: 'h', text: heading[1] });
    else if (last?.kind === 'p' && last.text !== '') last.text += ` ${line}`;
    else out.push({ kind: 'p', text: line });
  }
  return out.filter((b) => b.kind !== 'p' || b.text !== '');
}

const Answer: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-2.5 text-[14px] leading-relaxed">
    {answerBlocks(text).map((b, i) => {
      if ('text' in b) return <p key={i} className={b.kind === 'h' ? 'font-semibold' : undefined}>{inline(b.text)}</p>;
      const items = b.items.map((it, j) => <li key={j} className="pl-1">{inline(it)}</li>);
      return b.kind === 'ul' ? <ul key={i} className="list-disc pl-5 space-y-1 marker:text-[color:var(--de-ink-3)]">{items}</ul> : <ol key={i} className="list-decimal pl-5 space-y-1 marker:text-[color:var(--de-ink-3)]">{items}</ol>;
    })}
  </div>
);

const AssistantDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // a conversation belongs to one deal: it starts again when another company is opened
  const deal = facts?.entity_name ?? null;
  useEffect(() => { setTurns([]); setQ(''); }, [deal]);
  // the newest turn stays in view
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [open, turns.length, busy]);
  // the composer grows with the question, up to a few lines
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }, [q, open]);
  useEffect(() => { if (open && apiKey) box.current?.focus(); }, [open, apiKey]);

  const send = async (history: Turn[]) => {
    if (!facts) return;
    setTurns(history);
    setBusy(true);
    try {
      const { makeAiText, savedAiConfig } = await import('../../../lib/ai2/textCall');
      const cfg = savedAiConfig();
      if (!cfg) throw new Error('Add an AI key first.');
      const { memoSkeleton } = await import('../../../lib/ai2/memo');
      const context = output ? memoSkeleton(output, facts.currency as Engine2Currency) : `The model has not been built. Inputs entered so far: ${JSON.stringify(assumptions)}`;
      const system = `You answer questions about ONE leveraged buyout model for ${facts.entity_name}. Use ONLY the figures below; never invent a number. If the answer is not in them, say what is missing. Be brief and specific, and name the figure you rely on.\n\n${context}`;
      const user = history.map((t) => `${t.who === 'you' ? 'Analyst' : 'You'}: ${t.text}`).join('\n\n');
      const text = await makeAiText(cfg.provider, cfg.apiKey)(system, user);
      setTurns([...history, { who: 'ai', text: text.trim() }]);
    } catch (e: unknown) {
      setTurns([...history, { who: 'ai', text: (e as Error).message, failed: true }]);
    } finally { setBusy(false); }
  };
  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ('');
    void send([...turns.filter((t) => !t.failed), { who: 'you', text: question }]);
  };
  const retry = () => { if (!busy) void send(turns.filter((t) => !t.failed)); };

  return (
    <Drawer open={open} onClose={onClose} title="Ask about this deal" width="w-[32rem]"
      aside={turns.length > 0 ? <button type="button" disabled={busy} onClick={() => setTurns([])} className="h-8 px-2.5 rounded-[var(--de-r-sm)] text-[13px] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)] disabled:opacity-40">New conversation</button> : undefined}>
      {!apiKey ? (
        <div className="max-w-[44ch]">
          <p className="de-display text-[22px] leading-snug">Ask in plain words.</p>
          <p className="text-[14px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">Answers are drawn from this model's own figures. It needs an AI key, which stays in your browser and goes straight to the provider.</p>
          <ApiKeyInline />
        </div>
      ) : (
        <div className="flex flex-col min-h-full">
          <div className="flex-1 space-y-5 pb-4">
            {turns.length === 0 && (
              <div className="de-enter">
                <p className="de-display text-[22px] leading-snug">What would you like to know?</p>
                <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-2">
                  Answers use only the figures of {facts ? `the ${facts.entity_name} model` : 'this model'}{output ? '' : '. It is not built yet, so they can draw on the inputs alone'}.
                </p>
                <ul className="mt-5 border-t border-[color:var(--de-rule)]">
                  {STARTERS.map((s) => (
                    <li key={s} className="border-b border-[color:var(--de-rule)]">
                      <button type="button" onClick={() => ask(s)} className="group w-full flex items-center justify-between gap-3 py-3 text-left text-[14px] text-[color:var(--de-ink)] hover:text-[color:var(--de-input)]">
                        {s}
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-[color:var(--de-ink-3)] group-hover:text-[color:var(--de-input)] group-hover:translate-x-0.5 transition-transform"><path d="M2.5 6h7M6.5 3 9.5 6l-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((t, i) => t.who === 'you' ? (
              <div key={i} className="de-enter flex justify-end">
                <p className="max-w-[85%] px-3.5 py-2 rounded-[14px] rounded-br-[4px] bg-[var(--de-ink)] text-white text-[14px] leading-relaxed whitespace-pre-wrap">{t.text}</p>
              </div>
            ) : t.failed ? (
              <div key={i} className="de-enter px-4 py-3 rounded-[var(--de-r-sm)] bg-[var(--de-accent-soft)] text-[13px] leading-relaxed">
                <p className="font-semibold text-[color:var(--de-accent)]">No answer came back</p>
                <p className="text-[color:var(--de-ink-2)] mt-0.5 break-words">{t.text}</p>
                <button type="button" onClick={retry} className="mt-2 underline underline-offset-2 decoration-dotted text-[color:var(--de-ink)]">Try again</button>
              </div>
            ) : (
              <div key={i} className="de-enter group/answer">
                <Answer text={t.text} />
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[color:var(--de-ink-3)]">
                  <CopyButton text={t.text} said="Answer copied" label="Copy the answer" className="-ml-1.5" />
                  From this model's figures. Check a figure by clicking it on the page.
                </p>
              </div>
            ))}
            {busy && <p role="status" className="flex items-center gap-2 text-[13px] text-[color:var(--de-ink-3)]"><span className="de-dots" aria-hidden="true"><span /><span /><span /></span>Reading the model</p>}
            <div ref={end} />
          </div>
          <div className="sticky bottom-0 -mx-5 -mb-5 px-5 pt-3 pb-4 bg-[var(--de-surface)] border-t border-[color:var(--de-rule)]">
            <div className="de-control !h-auto flex items-end gap-2 pl-3 pr-1.5 py-1.5">
              <textarea ref={box} rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" aria-label="Question"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(q); } }}
                className="flex-1 min-w-0 max-h-36 resize-none bg-transparent outline-none text-[14px] leading-relaxed py-1 placeholder:text-[color:var(--de-ink-3)]" />
              <button type="button" aria-label="Send" disabled={!q.trim() || busy} onClick={() => ask(q)}
                className={cx('inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-[var(--de-r-sm)] transition-colors', q.trim() && !busy ? 'bg-[var(--de-ink)] text-white hover:bg-[var(--de-ink-hover)]' : 'bg-[var(--de-sunken)] text-[color:var(--de-ink-3)] cursor-not-allowed')}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11.5v-9M3.5 6 7 2.5 10.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[color:var(--de-ink-3)]"><span className="de-kbd">Enter</span> to send, <span className="de-kbd">Shift</span> <span className="de-kbd">Enter</span> for a new line</p>
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default AssistantDrawer;
