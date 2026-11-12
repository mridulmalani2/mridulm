/**
 * v2 Workbench — step 3, Assumptions. Three columns: a rail of the sheet's sections (each saying
 * how many inputs it still needs), the input sheet, and a live panel that shows what the current
 * inputs return and what still blocks the build.
 *
 * The live figures are a run of the one engine on the inputs as they stand, recomputed on every
 * edit, so they are never stale; while any input is blank there is no run and the panel lists
 * the blanks instead. Reads ONLY the engine2 store.
 */
import React, { useEffect, useMemo } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useWorkspace } from '../../../store/workspace';
import { useDealEngineStore } from '../../../store/dealEngine';
import { dealUiStore, useDealUi } from '../../../store/dealUi';
import { money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import { headlineOf, tryRun, type Headline } from '../../../lib/analysis';
import { entryLeverageDisplay, headlineNotMeaningful } from '../../../lib/engine2/display';
import AssumptionsPanel from './AssumptionsPanel';
import HistoryTable from './HistoryTable';
import BasisBadge from './BasisBadge';
import OutputTabs from './OutputTabs';
import { SECTIONS, plainLabel, sectionOf } from './sections';
import { factLabel } from '../ui/labels';
import { Button, Callout, cx } from '../ui/kit';

/** Deals for which AI proposals have already been requested in this session (one request each). */
const aiAsked = new Set<string>();

export const MissingBar: React.FC = () => {
  const missing = useEngine2Model((s) => s.missingFacts);
  const confirm = useEngine2Model((s) => s.confirmFact);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  if (!missing.length) return null;
  return (
    <div className="mb-5 px-5 py-4 rounded-[var(--de-r)] bg-[var(--de-accent-soft)]">
      <p className="text-[14px] font-semibold text-[color:var(--de-accent)] mb-2">The source lacks these figures: confirm to build</p>
      {missing.filter((p) => p !== 'currency_unsupported').map((path) => (
        <div key={path} className="flex flex-wrap items-center gap-2 py-1">
          <BasisBadge kind="required" />
          <span className="text-[14px]">{factLabel(path)}</span>
          <input
            value={drafts[path] ?? ''}
            aria-label={factLabel(path)}
            onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
            placeholder="enter to confirm"
            className="de-control de-num w-36 px-2 text-[14px] text-right ml-auto text-[color:var(--de-input)]"
          />
          <Button size="sm" variant="primary"
            onClick={() => { const t = (drafts[path] ?? '').trim(); const v = Number(t.replace(/,/g, '')); if (t !== '' && !/\s/.test(t) && Number.isFinite(v)) confirm(path, v); }}>
            Confirm
          </Button>
        </div>
      ))}
      {missing.includes('currency_unsupported') && (
        <p className="text-[13px] text-[color:var(--de-accent)]">Reporting currency not supported. The engine models USD, EUR, GBP, JPY and INR.</p>
      )}
    </div>
  );
};

/** Scroll to an input, open its section, focus it and flash the line. */
function useJump(): void {
  const jump = useDealUi((s) => s.jump);
  useEffect(() => {
    if (!jump || typeof document === 'undefined') return;
    const ui = dealUiStore.getState();
    const section = jump.startsWith('section:') ? jump.slice(8) : sectionOf(jump);
    ui.toggleSection(section, true);
    const t = window.setTimeout(() => {
      let el: HTMLElement | null = null;
      if (jump.startsWith('section:')) el = document.getElementById(`sec-${section}`);
      else {
        // an array member (a year, a tranche term) may be drawn inside its parent's line
        for (let p = jump; p && !el; p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '') {
          el = document.querySelector<HTMLElement>(`[data-path="${p.replace(/"/g, '')}"]`);
        }
        el = el ?? document.getElementById(`sec-${section}`);
      }
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: jump.startsWith('section:') ? 'start' : 'center' });
        const line = el.closest<HTMLElement>('.de-row') ?? el;
        line.setAttribute('data-flash', 'true');
        window.setTimeout(() => line.removeAttribute('data-flash'), 1500);
        const focusable = el.matches('input,button') ? el : el.querySelector<HTMLElement>('input,[role="combobox"],[role="radio"],[role="switch"]');
        focusable?.focus({ preventScroll: true });
      }
      dealUiStore.getState().jumpTo(null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [jump]);
}

const Rail: React.FC<{ counts: Record<string, number>; started: boolean }> = ({ counts, started }) => {
  const jumpTo = useDealUi((s) => s.jumpTo);
  return (
    <nav aria-label="Sections" className="hidden lg:block sticky top-24 self-start">
      <p className="text-[12px] font-medium text-[color:var(--de-ink-3)] px-3 mb-2">Sections</p>
      <ul className="space-y-0.5">
        {SECTIONS.map((s) => {
          const n = counts[s.id] ?? 0;
          return (
            <li key={s.id}>
              <button type="button" disabled={!started} onClick={() => jumpTo(`section:${s.id}`)}
                className={cx('w-full flex items-center justify-between gap-2 h-9 px-3 rounded-[var(--de-r-sm)] text-left text-[13px] transition-colors',
                  started ? 'text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]' : 'text-[color:var(--de-ink-3)] cursor-not-allowed')}>
                <span className="truncate">{s.title}</span>
                {started && (n > 0
                  ? <span className="de-num text-[12px] font-medium text-[color:var(--de-accent)]">{n}</span>
                  : <span aria-label="complete" className="text-[12px] text-[color:var(--de-pos)]">✓</span>)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

const signed = (v: number, f: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`;

const LiveRow: React.FC<{ label: string; value: string; change?: string | null }> = ({ label, value, change }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="text-[13px] text-[color:var(--de-ink-2)]">{label}</span>
    <span className="text-right">
      <span className="de-num text-[14px] font-medium">{value}</span>
      {change && <span className="de-num block text-[11px] text-[color:var(--de-ink-3)]">{change}</span>}
    </span>
  </div>
);

/** What the inputs return right now, and what still blocks the build. */
const LivePanel: React.FC<{ blocked: boolean; onBuild: () => void }> = ({ blocked, onBuild }) => {
  const facts = useEngine2Model((s) => s.facts)!;
  const assumptions = useEngine2Model((s) => s.assumptions);
  const pending = useEngine2Model((s) => s.pending);
  const missingFacts = useEngine2Model((s) => s.missingFacts);
  const error = useEngine2Model((s) => s.error);
  const versions = useWorkspace((s) => s.versions);
  const jumpTo = useDealUi((s) => s.jumpTo);
  const setOverlay = useDealUi((s) => s.setOverlay);
  const ccy = facts.currency as Engine2Currency;
  const blank = assumptions ? useEngine2Model.getState().missing() : [];

  const live = useMemo(() => (assumptions && !missingFacts.length ? tryRun(facts, assumptions, pending) : null), [facts, assumptions, pending, missingFacts.length]);
  const last = versions[versions.length - 1];
  const lastHead: Headline | null = useMemo(() => {
    if (!last) return null;
    const r = tryRun(facts, last.assumptions, last.pending);
    return r.ok ? headlineOf(r.output) : null;
  }, [facts, last]);
  const head = live?.ok ? headlineOf(live.output) : null;
  const changed = head && lastHead && (head.irr !== lastHead.irr || head.equity !== lastHead.equity);

  return (
    <aside className="lg:sticky lg:top-24 self-start space-y-4">
      <div className="bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] p-5">
        {head && live?.ok ? (
          <>
            <p className="text-[12px] font-medium text-[color:var(--de-ink-3)]">Sponsor IRR, on the inputs as they stand</p>
            <p className={cx('de-num text-[40px] font-semibold leading-none mt-2 tracking-[-0.02em]', !head.meaningful && 'text-[color:var(--de-warn)]')}>{head.irr === null ? 'N/M' : pct(head.irr, 2)}</p>
            {changed && head.irr !== null && lastHead!.irr !== null && (
              <p className="de-num text-[12px] text-[color:var(--de-ink-3)] mt-1.5">{signed((head.irr - lastHead!.irr) * 100, (x) => num(x, 2))} pts since the last build</p>
            )}
            <div className="mt-4 divide-y divide-[color:var(--de-rule)]">
              <LiveRow label="Money multiple" value={head.moic === null ? 'N/M' : multiple(head.moic, 2)}
                change={changed && head.moic !== null && lastHead!.moic !== null ? signed(head.moic - lastHead!.moic, (x) => `${num(x, 2)}x`) : null} />
              <LiveRow label="Equity cheque" value={money(head.equity, ccy, 0)}
                change={changed && head.equity !== lastHead!.equity ? signed(head.equity - lastHead!.equity, (x) => num(x, 0)) : null} />
              <LiveRow label={`Debt at close, x ${entryLeverageDisplay(live.output).basis_label} EBITDA`} value={multiple(entryLeverageDisplay(live.output).value, 2)} />
              <LiveRow label="Lowest cash in the hold" value={money(head.min_cash, ccy, 0)} />
              {head.min_leverage_headroom !== null && <LiveRow label="Tightest leverage headroom" value={`${num(head.min_leverage_headroom, 2)}x`} />}
            </div>
            {!head.meaningful && <p className="text-[12px] text-[color:var(--de-warn)] mt-3">The structure does not hold on these inputs. Build to see why.</p>}
          </>
        ) : (
          <>
            <p className="text-[12px] font-medium text-[color:var(--de-ink-3)]">Live result</p>
            {!assumptions ? (
              <p className="text-[14px] text-[color:var(--de-ink-2)] mt-2">Enter the holding period to open the sheet.</p>
            ) : blank.length > 0 ? (
              <>
                <p className="mt-2"><span className="de-num text-[40px] font-semibold leading-none tracking-[-0.02em]">{blank.length}</span><span className="text-[14px] text-[color:var(--de-ink-2)] ml-2">input{blank.length === 1 ? '' : 's'} still blank</span></p>
                <p className="text-[12px] text-[color:var(--de-ink-3)] mt-1.5">The return appears here as soon as the last one is entered. Nothing is assumed for you.</p>
              </>
            ) : (
              <p className="text-[13px] text-[color:var(--de-accent)] mt-2">{live && !live.ok ? live.reason : 'Confirm the figures the source lacks.'}</p>
            )}
          </>
        )}
        <Button variant="primary" className="w-full mt-5" disabled={blocked} onClick={onBuild}>Build model</Button>
        {error && <p className="text-[12px] text-[color:var(--de-accent)] mt-2">{error}</p>}
        {assumptions && (
          <button type="button" onClick={() => setOverlay('cases')} className="w-full mt-2 h-8 rounded-[var(--de-r-sm)] text-[13px] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)]">Save or compare cases</button>
        )}
      </div>

      {blank.length > 0 && (
        <div className="bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] p-5">
          <p className="text-[13px] font-semibold mb-2">Still to enter</p>
          <ul className="space-y-0.5 -mx-2">
            {blank.slice(0, 9).map((m) => (
              <li key={m.path}>
                <button type="button" onClick={() => jumpTo(m.path)}
                  className="w-full text-left px-2 py-1.5 rounded-[var(--de-r-sm)] text-[13px] text-[color:var(--de-ink-2)] hover:bg-[var(--de-sunken)] hover:text-[color:var(--de-ink)] leading-snug">
                  {plainLabel(m.label)}
                </button>
              </li>
            ))}
          </ul>
          {blank.length > 9 && <p className="text-[12px] text-[color:var(--de-ink-3)] mt-2">and {blank.length - 9} more</p>}
        </div>
      )}
    </aside>
  );
};

/**
 * `view="assumptions"` is step 3 of the flow (inputs, the live panel and the Build button; the
 * results live on their own screen); the default renders inputs and outputs together.
 */
const Workbench: React.FC<{ view?: 'all' | 'assumptions' }> = ({ view = 'all' }) => {
  const inputsOnly = view === 'assumptions';
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const error = useEngine2Model((s) => s.error);
  const missing = useEngine2Model((s) => s.missingFacts);
  const sourceCurrency = useEngine2Model((s) => s.sourceCurrency);
  const factNotes = useEngine2Model((s) => s.factNotes);
  const build = useEngine2Model((s) => s.buildWithExhibits);
  // the Build gate (v2.0.0): every input the model will read must be entered
  const assumptions = useEngine2Model((s) => s.assumptions);
  useEngine2Model((s) => s.pending);
  useJump();
  // With a key saved, AI proposals for the blank inputs are fetched once per deal without being
  // asked for. They arrive as proposals beside the fields; nothing is applied (store: aiSuggest).
  const apiKey = useDealEngineStore((st) => st.apiKey);
  const dealKey = facts && assumptions ? `${facts.entity_name}|${assumptions.entry.hold_years}` : null;
  useEffect(() => {
    if (!inputsOnly || !apiKey || !dealKey || aiAsked.has(dealKey)) return;
    aiAsked.add(dealKey);
    void useEngine2Model.getState().aiSuggest();
  }, [inputsOnly, apiKey, dealKey]);
  const blankInputs = useEngine2Model.getState().missing();
  const blocked = missing.length > 0 || blankInputs.length > 0 || assumptions === null;

  // Ctrl/Cmd + Enter builds from anywhere on the sheet
  useEffect(() => {
    if (!inputsOnly || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !(e.target as HTMLElement)?.closest?.('[data-de-line]') && !blocked) build();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputsOnly, blocked, build]);

  if (!facts) {
    return <p className="text-[14px] p-6 text-[color:var(--de-ink-2)]">Source a company first. The workbench reads the figures it brings in.</p>;
  }
  const ccy = facts.currency as Engine2Currency;
  const counts: Record<string, number> = {};
  for (const m of blankInputs) counts[sectionOf(m.path)] = (counts[sectionOf(m.path)] ?? 0) + 1;

  const figures = (
    <div className="mb-5 px-6 py-5 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)]">
      <HistoryTable facts={facts} isoOverride={missing.includes('currency_unsupported') ? sourceCurrency : null} />
      {/* honest-degradation notes from extraction (currency, days gating, ROU inclusion, FPI history) */}
      {factNotes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {factNotes.map((n) => <li key={n} className="text-[12px] text-[color:var(--de-ink-3)]">{n}</li>)}
        </ul>
      )}
    </div>
  );

  if (inputsOnly) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 pt-8 pb-24 grid grid-cols-1 lg:grid-cols-[13.5rem_minmax(0,1fr)_19rem] gap-x-8 gap-y-6">
        <Rail counts={counts} started={assumptions !== null} />
        <div className="min-w-0">
          <header className="mb-6">
            <h1 className="de-display text-[34px] leading-tight">Assumptions</h1>
            <p className="text-[14px] text-[color:var(--de-ink-2)] mt-1.5 max-w-[62ch]">
              Every input starts blank. Where the source supports a value, a blue link offers it; nothing is applied until you click.
            </p>
          </header>
          {figures}
          <MissingBar />
          <AssumptionsPanel />
        </div>
        <LivePanel blocked={blocked} onBuild={build} />
        {/* on a narrow screen the live panel sits below the sheet, so the build stays in reach here */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-[var(--de-surface)] border-t border-[color:var(--de-rule)]">
          <span className="text-[13px] text-[color:var(--de-ink-2)]">{assumptions === null ? 'Enter the holding period' : blankInputs.length ? `${blankInputs.length} input${blankInputs.length === 1 ? '' : 's'} to go` : 'Ready to build'}</span>
          <Button variant="primary" size="sm" disabled={blocked} onClick={build}>Build model</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[var(--de-paper)]">
      <div className="max-w-4xl mx-auto p-6">
        <h2 className="text-[17px] font-semibold mb-3">{facts.entity_name}</h2>
        {figures}
        <MissingBar />
        <AssumptionsPanel />
        {blankInputs.length > 0 && (
          <Callout tone="block" title={`${blankInputs.length} input${blankInputs.length === 1 ? '' : 's'} still blank. Nothing is assumed for you.`}>
            <ul>
              {blankInputs.slice(0, 12).map((m) => <li key={m.path}>{plainLabel(m.label)}</li>)}
              {blankInputs.length > 12 && <li>and {blankInputs.length - 12} more</li>}
            </ul>
          </Callout>
        )}
        {error && <p className="text-[13px] mt-3 text-[color:var(--de-accent)]">{error}</p>}
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="de-num text-[13px] text-[color:var(--de-ink-2)]">
            {output ? (
              <>
                Sponsor IRR {headlineNotMeaningful(output) ? 'N/M' : pct(output.returns.sponsor_net.irr)} · MOIC {headlineNotMeaningful(output) ? 'N/M' : multiple(output.returns.sponsor_net.moic)} ·
                Equity {money(output.sources_uses.sponsor_equity, ccy, 0)}
              </>
            ) : 'Build to compute. Outputs never render stale.'}
          </div>
          <Button variant="primary" disabled={blocked} onClick={build}>Build model</Button>
        </div>
        {output && output.coherence.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {output.coherence.map((f) => (
              <Callout key={f.code + f.message} tone={f.severity === 'block' ? 'block' : 'warn'}>{f.severity === 'block' ? '■' : '▲'} {f.message}</Callout>
            ))}
          </div>
        )}
        {output && <OutputTabs output={output} currency={ccy} />}
      </div>
    </div>
  );
};

export default Workbench;
