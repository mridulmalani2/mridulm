/**
 * The deal-engine shell: one header for every step (where you are, which deal, search, the guide
 * and the deal menu) and the panels that open over any step: the command palette, the guide, the
 * trace panel, cases, build history, the deal library and tools. The assistant is not an overlay:
 * it is docked beside the page (AssistantDock) so the analyst keeps working while it is open.
 * AI is never a gate: every step, and the assistant itself, works with no key.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEngine2Model } from '../../../store/engine2Model';
import { useWorkspace } from '../../../store/workspace';
import { useDealUi, type Overlay } from '../../../store/dealUi';
import { labelFor } from '../../../lib/engine2/draft';
import { SECTIONS, plainLabel } from '../v2/sections';
import { RESULT_VIEWS } from '../results/views';
import { exportExcelModel } from '../results/exportModel';
import CommandPalette, { type Command } from './CommandPalette';
import InfoDrawer from './InfoDrawer';
import TraceDrawer from './TraceDrawer';
import { CasesDrawer, HistoryDrawer, LibraryDrawer } from './WorkspaceDrawers';
import { ToolsDrawer } from './ToolsDrawer';
import AssistantDock from './AssistantDock';
import type { AssistStep } from '../../../lib/assistant/types';
import { IconButton, Stepper, ToastHost, cx, type StepItem } from '../ui/kit';

/** Every input on the sheet as a dotted path; a per-year line is one entry, not one per year. */
function inputPaths(node: unknown, prefix = '', out: string[] = []): string[] {
  if (node === null || typeof node !== 'object') { if (prefix) out.push(prefix); return out; }
  if (Array.isArray(node)) {
    if (node.every((v) => v === null || typeof v !== 'object')) { out.push(prefix); return out; }
    node.forEach((v, i) => inputPaths(v, `${prefix}.${i}`, out));
    return out;
  }
  for (const [k, v] of Object.entries(node)) inputPaths(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

const DealShell: React.FC<{
  steps: StepItem[];
  step: string;
  onGo: (id: string) => void;
  entity: string | null;
  currency: string | null;
  onNewDeal: () => void;
  children: React.ReactNode;
}> = ({ steps, step, onGo, entity, currency, onNewDeal, children }) => {
  const overlay = useDealUi((s) => s.overlay);
  const setOverlay = useDealUi((s) => s.setOverlay);
  const jumpTo = useDealUi((s) => s.jumpTo);
  const setResultsView = useDealUi((s) => s.setResultsView);
  const assistant = useDealUi((s) => s.assistant);
  const setAssistant = useDealUi((s) => s.setAssistant);
  const docked = assistant.open && entity !== null && step !== 'source';
  const assumptions = useEngine2Model((s) => s.assumptions);
  const output = useEngine2Model((s) => s.output);
  const build = useEngine2Model((s) => s.buildWithExhibits);
  const notes = useWorkspace((s) => s.notes);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOverlay(null);
  const reachable = (id: string) => steps.find((s) => s.id === id)?.state !== 'locked';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input,textarea,[contenteditable="true"]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOverlay(overlay === 'palette' ? null : 'palette'); }
      else if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOverlay('info'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, setOverlay]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    for (const s of steps) list.push({ id: `step-${s.id}`, group: 'Steps', label: s.label, hint: s.state === 'locked' ? 'locked' : undefined, disabled: s.state === 'locked', run: () => onGo(s.id) });
    const open = (o: Overlay) => () => setOverlay(o);
    list.push(
      { id: 'a-guide', group: 'Actions', label: 'Guide to this page', hint: '?', keywords: 'help info how', run: open('info') },
      { id: 'a-library', group: 'Actions', label: 'Deal library', keywords: 'open save file load deals', run: open('library') },
    );
    if (entity) {
      list.push(
        { id: 'a-cases', group: 'Actions', label: 'Cases: save or compare', keywords: 'scenario management base downside lender', run: open('cases') },
        { id: 'a-history', group: 'Actions', label: 'Build history', keywords: 'versions changes walk', run: open('history') },
        { id: 'a-tools', group: 'Actions', label: 'Tools: solve for a return, memo, AI', keywords: 'goal seek redline memo key', run: open('tools') },
        { id: 'a-assist', group: 'Actions', label: 'Assistant: what to do next', keywords: 'assistant guide suggestions next help recommend', run: () => setAssistant({ open: true, tab: 'guide' }) },
        { id: 'a-ask', group: 'Actions', label: 'Ask about this deal', keywords: 'chat assistant question', run: () => setAssistant({ open: true, tab: 'ask' }) },
        { id: 'a-new', group: 'Actions', label: 'New deal', keywords: 'reset start over', run: onNewDeal },
      );
    }
    if (assumptions && reachable('assumptions')) {
      list.push({ id: 'a-build', group: 'Actions', label: 'Build model', keywords: 'run calculate', run: () => { onGo('assumptions'); build(); } });
      for (const s of SECTIONS) list.push({ id: `sec-${s.id}`, group: 'Sections', label: s.title, hint: 'Assumptions', run: () => { onGo('assumptions'); jumpTo(`section:${s.id}`); } });
      const seen = new Set<string>();
      for (const path of inputPaths(assumptions)) {
        const label = plainLabel(labelFor(path));
        if (label === path || seen.has(label) || path === 'deal_name') continue;
        seen.add(label);
        list.push({ id: `in-${path}`, group: 'Inputs', label, keywords: path.replace(/[._]/g, ' '), run: () => { onGo('assumptions'); jumpTo(path); } });
      }
    }
    if (output) {
      for (const v of RESULT_VIEWS) list.push({ id: `view-${v.id}`, group: 'Results', label: v.label, keywords: v.keywords, run: () => { setResultsView(v.id); onGo('results'); } });
      list.push(
        { id: 'a-excel', group: 'Actions', label: 'Export the Excel model', keywords: 'download xlsx workbook', run: () => { void exportExcelModel(output, notes); } },
        { id: 'a-print', group: 'Actions', label: 'One-page summary (print or PDF)', keywords: 'ic one pager pdf', run: () => { setResultsView('onepager'); onGo('results'); } },
        { id: 'a-review', group: 'Actions', label: 'Review view', keywords: 'partner read only summary', run: () => { setResultsView('review'); onGo('results'); } },
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, entity, assumptions, output, notes]);

  const menuItem = (label: string, run: () => void, danger = false) => (
    <li>
      <button type="button" onClick={() => { setMenu(false); run(); }}
        className={cx('w-full text-left px-3 h-9 rounded-[var(--de-r-sm)] text-[13px] hover:bg-[var(--de-sunken)]', danger && 'text-[color:var(--de-accent)]')}>{label}</button>
    </li>
  );

  return (
    <div className="de-root min-h-screen">
      <header className="de-no-print sticky top-0 z-30 bg-[color-mix(in_srgb,var(--de-paper)_88%,transparent)] backdrop-blur border-b border-[color:var(--de-rule)]">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 shrink">
            <Link to="/" aria-label="Back to mridulmalani.com" title="Back to mridulmalani.com" className="text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)] no-underline shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <span className="de-display text-[19px] whitespace-nowrap">Deal Engine</span>
            {entity && (
              <span className="hidden md:inline-flex items-baseline gap-2 min-w-0 pl-3 border-l border-[color:var(--de-rule)]">
                <span className="text-[14px] font-medium truncate">{entity}</span>
                {currency && <span className="text-[12px] text-[color:var(--de-ink-3)] whitespace-nowrap">{currency} m</span>}
              </span>
            )}
          </div>
          <div className="hidden sm:block shrink-0"><Stepper steps={steps} onGo={onGo} /></div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setOverlay('palette')} aria-label="Search and jump"
              className="hidden lg:inline-flex items-center gap-6 h-9 pl-3 pr-2 rounded-[var(--de-r-sm)] border border-[color:var(--de-rule)] bg-[var(--de-surface)] text-[13px] text-[color:var(--de-ink-3)] hover:border-[color:var(--de-rule-strong)]">
              Search or jump
              <span className="de-kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
            </button>
            {entity && (
              <IconButton label={docked ? 'Hide the assistant' : 'Assistant'} active={docked} aria-pressed={docked} disabled={step === 'source'} onClick={() => setAssistant({ open: !assistant.open })}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.75" width="12" height="10.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10 3v10" stroke="currentColor" strokeWidth="1.4" /><path d="M11.4 6h1.2M11.4 8h1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              </IconButton>
            )}
            <IconButton label="Guide to this page" onClick={() => setOverlay('info')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="4.9" r=".9" fill="currentColor" /></svg>
            </IconButton>
            <div ref={menuRef} className="relative">
              <IconButton label="Deal menu" tipSide="end" active={menu} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </IconButton>
              {menu && (
                <ul className="de-pop absolute right-0 top-full mt-2 w-60 p-1.5 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] shadow-[var(--de-shadow-pop)]">
                  {entity && menuItem('Cases', () => setOverlay('cases'))}
                  {entity && menuItem('Build history', () => setOverlay('history'))}
                  {entity && menuItem('Tools', () => setOverlay('tools'))}
                  {entity && step !== 'source' && menuItem(docked ? 'Hide the assistant' : 'Assistant', () => setAssistant({ open: !assistant.open }))}
                  {menuItem('Deal library', () => setOverlay('library'))}
                  {!entity && menuItem('AI key', () => setOverlay('tools'))}
                  {entity && <li aria-hidden="true" className="my-1 border-t border-[color:var(--de-rule)]" />}
                  {entity && menuItem('New deal', onNewDeal)}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="sm:hidden px-4 pb-2 overflow-x-auto"><Stepper steps={steps} onGo={onGo} /></div>
      </header>
      {/* where there is room the assistant sits beside the page and the page makes way for it;
          on a narrower window it lies over the right edge and the page keeps its width */}
      <main id="main-content" key={step} className={cx('de-enter', docked && '2xl:pr-[22rem]')}>{children}</main>
      <AssistantDock step={step as AssistStep} onGo={(s) => onGo(s)} />

      <CommandPalette open={overlay === 'palette'} onClose={close} commands={commands} />
      <InfoDrawer open={overlay === 'info'} onClose={close} step={step} />
      <CasesDrawer open={overlay === 'cases'} onClose={close} />
      <HistoryDrawer open={overlay === 'history'} onClose={close} />
      <LibraryDrawer open={overlay === 'library'} onClose={close} onOpened={() => onGo('assumptions')} />
      <ToolsDrawer open={overlay === 'tools'} onClose={close} />
      <TraceDrawer />
      <ToastHost />
    </div>
  );
};

export default DealShell;
