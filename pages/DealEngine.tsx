import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Workbench from '../components/deal-engine/v2/Workbench';
import { useEngine2Model } from '../store/engine2Model';
import { useDealEngineStore } from '../store/dealEngine';
import { useCleaning } from '../store/cleaning';
import SourceScreen from '../components/deal-engine/start/SourceScreen';
import ManualFactsScreen from '../components/deal-engine/start/ManualFactsScreen';
import DealShell from '../components/deal-engine/shell/DealShell';
import CleanScreen from '../components/deal-engine/clean/CleanScreen';
import ResultsScreen from '../components/deal-engine/results/ResultsScreen';
import { blockers } from '../lib/cleaning/checks';
import { startSessionPersistence } from '../store/session';
import { startWorkspacePersistence, workspaceStore } from '../store/workspace';
import { dealUiStore } from '../store/dealUi';
import type { StepItem } from '../components/deal-engine/ui/kit';

/**
 * /deal-engine — the LBO flow: Source → Clean → Assumptions → Results
 * (rebuild/CLEANING_AND_SUITE_PLAN.md §6.1). One engine (engine2) behind all four steps.
 *
 * The URL names the step (/deal-engine/lbo/<step>), and the deal's state decides whether that
 * step can be shown: a later step is never opened before the one in front of it is complete,
 * and going back is always allowed. `resolveStep` is that rule, pure and tested.
 */
export const STEPS = ['source', 'clean', 'assumptions', 'results'] as const;
export type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = { source: 'Source', clean: 'Clean', assumptions: 'Assumptions', results: 'Results' };
export const stepPath = (s: Step) => `/deal-engine/lbo/${s}`;

export function stepFromPath(pathname: string): Step | null {
  const m = /^\/deal-engine\/lbo\/([a-z]+)\/?$/.exec(pathname);
  return m && (STEPS as readonly string[]).includes(m[1]) ? (m[1] as Step) : null;
}

export interface FlowState { hasFacts: boolean; cleanDone: boolean; hasOutput: boolean }

/** The step to show for a requested one (null = no step in the URL: resume where the deal is). */
export function resolveStep(requested: Step | null, s: FlowState): Step {
  if (!s.hasFacts) return 'source';
  const furthest: Step = !s.cleanDone ? 'clean' : s.hasOutput ? 'results' : 'assumptions';
  if (requested === null) return furthest;
  return STEPS.indexOf(requested) <= STEPS.indexOf(furthest) ? requested : furthest;
}

const DealEngine: React.FC = () => {
  // a deal in progress is kept in this browser and comes back after a reload (store/session)
  if (typeof window !== 'undefined' && !import.meta.env.VITEST) { startSessionPersistence(); startWorkspacePersistence(); }
  const location = useLocation();
  const navigate = useNavigate();
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const resetModel = useEngine2Model((s) => s.reset);
  const missingFacts = useEngine2Model((s) => s.missingFacts);
  const sourced = useCleaning((s) => s.raw);
  const cleanDone = useCleaning((s) => s.done);
  const cleanFlags = useCleaning((s) => s.flags);
  const resetCleaning = useCleaning((s) => s.reset);
  const legacySaveNotice = useDealEngineStore((s) => s.legacySaveNotice);
  const dismissLegacySaveNotice = useDealEngineStore((s) => s.dismissLegacySaveNotice);
  const [manualEntry, setManualEntry] = useState(false);

  // Dev-only handles for driving the flow without the proxy (walkthroughs/tests);
  // stripped from production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    w.__engine2 = useEngine2Model;
    w.__cleaning = useCleaning;
    w.__dealEngine = useDealEngineStore;
  }

  // A deal that did not come through an import (a forecast-only case) has nothing to clean.
  const state: FlowState = { hasFacts: facts !== null, cleanDone: cleanDone || (facts !== null && sourced === null), hasOutput: output !== null };
  const requested = stepFromPath(location.pathname);
  const step = resolveStep(requested, state);

  // keep the URL honest about the step being shown
  useEffect(() => {
    if (location.pathname !== stepPath(step)) navigate(stepPath(step), { replace: true });
  }, [location.pathname, step, navigate]);

  // each step starts at its top
  useEffect(() => { if (typeof window !== 'undefined') window.scrollTo(0, 0); }, [step]);

  // a new import lands on Clean; a successful build lands on Results
  const lastSourced = useRef(sourced);
  useEffect(() => {
    if (sourced && sourced !== lastSourced.current) { setManualEntry(false); navigate(stepPath('clean')); }
    lastSourced.current = sourced;
  }, [sourced, navigate]);
  // a case entered directly (no sourced figures) has nothing to clean: it lands on Assumptions
  const hadFacts = useRef(facts !== null);
  useEffect(() => {
    if (facts && !hadFacts.current && sourced === null) { setManualEntry(false); navigate(stepPath('assumptions')); }
    hadFacts.current = facts !== null;
  }, [facts, sourced, navigate]);
  // every build produces a new output object, so a rebuild with unchanged inputs still opens Results
  const lastOutput = useRef(output);
  useEffect(() => {
    if (output && output !== lastOutput.current) {
      workspaceStore.getState().recordVersion(); // every build is kept, so a later one can be compared with it
      if (step === 'assumptions') { dealUiStore.getState().setResultsView('overview'); navigate(stepPath('results')); }
    }
    lastOutput.current = output;
  }, [output, step, navigate]);

  const openClean = blockers(cleanFlags).length;
  const stateOf = (s: Step): StepItem['state'] => {
    if (s === step) return 'current';
    const reachable = resolveStep(s, state) === s;
    if (!reachable) return 'locked';
    return STEPS.indexOf(s) < STEPS.indexOf(resolveStep(null, state)) ? 'done' : 'open';
  };
  const noteOf = (s: Step): string | undefined => {
    if (stateOf(s) !== 'locked') return undefined;
    if (!state.hasFacts) return 'Source a company first.';
    if (!state.cleanDone) return openClean ? `Finish the Clean step first: ${openClean} item${openClean === 1 ? '' : 's'} open.` : 'Finish the Clean step first.';
    return missingFacts.length ? 'Build the model first. Some inputs are still blank.' : 'Build the model first.';
  };
  const steps: StepItem[] = STEPS.map((s) => ({ id: s, label: STEP_LABEL[s], state: stateOf(s), note: noteOf(s) }));
  const newDeal = () => {
    // the deal on screen is kept in the library before it is cleared: starting another never loses work
    workspaceStore.getState().saveToLibrary();
    resetModel(); resetCleaning(); workspaceStore.getState().resetDeal(); setManualEntry(false); navigate(stepPath('source'));
  };

  return (
    <DealShell steps={steps} step={step} onGo={(id) => navigate(stepPath(id as Step))} entity={facts?.entity_name ?? null} currency={facts ? facts.currency : null} onNewDeal={newDeal}>
      {step === 'source' && (
        <div>
          {legacySaveNotice && (
            <div className="flex items-center justify-between px-6 py-2.5 bg-[var(--de-warn-soft)]">
              <p className="text-[13px] text-[color:var(--de-warn)]">
                This file was saved by the previous engine, which has been retired. Source the company again to rebuild it here.
              </p>
              <button onClick={dismissLegacySaveNotice} className="text-[13px] underline text-[color:var(--de-warn)] px-2">Dismiss</button>
            </div>
          )}
          {facts && (
            <p className="px-6 py-2.5 text-[13px] text-[color:var(--de-ink-2)] bg-[var(--de-sunken)]">
              {facts.entity_name} is open. Sourcing another company here replaces it; save it to the deal library first if you want to keep it.
            </p>
          )}
          {manualEntry
            ? <ManualFactsScreen onBack={() => setManualEntry(false)} />
            : <SourceScreen onManual={() => setManualEntry(true)} />}
        </div>
      )}
      {step === 'clean' && <CleanScreen onContinue={() => navigate(stepPath('assumptions'))} />}
      {step === 'assumptions' && <Workbench view="assumptions" />}
      {step === 'results' && <ResultsScreen onEdit={() => navigate(stepPath('assumptions'))} />}
    </DealShell>
  );
};

export default DealEngine;
