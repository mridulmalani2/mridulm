/**
 * The command palette (Ctrl/Cmd + K): type a few letters to jump to a step, a section, any input
 * on the sheet, a results view or an action. Arrow keys move, Enter runs, Esc closes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../ui/kit';

export interface Command { id: string; group: string; label: string; hint?: string; keywords?: string; run: () => void; disabled?: boolean }

const score = (c: Command, q: string): number => {
  if (!q) return 1;
  const hay = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((w) => hay.includes(w))) return 0;
  const label = c.label.toLowerCase();
  return (label.startsWith(words[0]) ? 4 : label.includes(words[0]) ? 2 : 1) + 1 / (1 + label.length);
};

const CommandPalette: React.FC<{ open: boolean; onClose: () => void; commands: Command[] }> = ({ open, onClose, commands }) => {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const shown = useMemo(() => {
    const live = commands.filter((c) => !c.disabled);
    if (!q.trim()) return live.filter((c) => c.group !== 'Inputs').slice(0, 40);
    return live.map((c) => ({ c, s: score(c, q.trim()) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.c);
  }, [commands, q]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  let lastGroup = '';
  return (
    <div className="de-no-print fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Search and commands">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--de-scrim)] cursor-default" onClick={onClose} />
      <div className="de-pop relative w-full max-w-[36rem] bg-[var(--de-surface)] rounded-[14px] shadow-[var(--de-shadow-pop)] overflow-hidden">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to an input, a view or an action"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i < shown.length - 1 ? i + 1 : i)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i > 0 ? i - 1 : 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(shown[active]); }
          }}
          className="w-full h-14 px-5 text-[16px] bg-transparent outline-none border-b border-[color:var(--de-rule)] placeholder:text-[color:var(--de-ink-3)]" />
        <ul ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {shown.length === 0 && <li className="px-3 py-6 text-[14px] text-[color:var(--de-ink-3)] text-center">Nothing matches “{q}”.</li>}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {head && <li aria-hidden="true" className="px-3 pt-3 pb-1 text-[11px] font-medium text-[color:var(--de-ink-3)]">{c.group}</li>}
                <li>
                  <button type="button" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(c)}
                    className={cx('w-full flex items-center justify-between gap-4 px-3 h-10 rounded-[var(--de-r-sm)] text-left text-[14px]', i === active && 'bg-[var(--de-sunken)]')}>
                    <span className="truncate">{c.label}</span>
                    {c.hint && <span className="text-[12px] text-[color:var(--de-ink-3)] whitespace-nowrap">{c.hint}</span>}
                  </button>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <p className="flex items-center gap-3 px-5 h-10 border-t border-[color:var(--de-rule)] text-[12px] text-[color:var(--de-ink-3)]">
          <span><span className="de-kbd">↑</span> <span className="de-kbd">↓</span> move</span>
          <span><span className="de-kbd">Enter</span> open</span>
          <span><span className="de-kbd">Esc</span> close</span>
        </p>
      </div>
    </div>
  );
};

export default CommandPalette;
