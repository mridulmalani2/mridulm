/**
 * v2 Workbench (PHASE_E §E1 shell): facts strip (staleness + history table + MISSING
 * confirm bar) → AssumptionsPanel → Build (gated exactly like today) → the E1 output
 * smoke (hero IRR/MOIC + coherence banner; the full tab set is E2). Reads ONLY the
 * engine2 store — the old ModelState cannot reach this tree.
 */
import React, { useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { money, multiple, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import AssumptionsPanel from './AssumptionsPanel';
import HistoryTable from './HistoryTable';
import BasisBadge from './BasisBadge';
import OutputTabs from './OutputTabs';
import { headlineNotMeaningful } from '../../../lib/engine2/display';
import { factLabel } from '../ui/labels';

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const labelStyle = { color: 'rgba(17,17,17,0.62)', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' } as const;

export const MissingBar: React.FC = () => {
  const missing = useEngine2Model((s) => s.missingFacts);
  const confirm = useEngine2Model((s) => s.confirmFact);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!missing.length) return null;
  return (
    <div className="p-3 mb-4" style={{ border: '1px solid rgba(204,0,0,0.35)', background: 'rgba(204,0,0,0.04)' }}>
      <p className="text-[12px] tracking-widest uppercase mb-2" style={{ color: '#b91c1c', fontFamily: mono }}>
        The filing lacks these facts — confirm to build
      </p>
      {missing.filter((p) => p !== 'currency_unsupported').map((path) => (
        <div key={path} className="flex items-center gap-2 mb-1.5">
          <BasisBadge kind="required" />
          <span className="text-[13px]" style={{ fontFamily: mono, color: '#111' }}>{factLabel(path)}</span>
          <input
            value={drafts[path] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
            placeholder="enter to confirm"
            className="w-28 px-1.5 py-1 text-[13px] text-right ml-auto"
            style={{ background: '#fff', border: '1px solid rgba(204,0,0,0.35)', fontFamily: mono, outline: 'none' }}
          />
          <button
            onClick={() => { const v = Number((drafts[path] ?? '').replace(/[,\s]/g, '')); if (Number.isFinite(v)) confirm(path, v); }}
            className="px-2 py-1 text-[12px] uppercase tracking-widest"
            style={{ background: '#111', color: '#fff', fontFamily: mono }}
          >
            Confirm
          </button>
        </div>
      ))}
      {missing.includes('currency_unsupported') && (
        <p className="text-[13px]" style={{ color: '#b91c1c', fontFamily: mono }}>
          Reporting currency not supported — the engine models USD, EUR, GBP, JPY, INR.
        </p>
      )}
    </div>
  );
};

/** E4 toolbar: AI-suggest, Redline, Memo download, and the PURE goal-seek. When no key
 *  is saved the AI buttons stay visibly OFF (the phase rule) — goal-seek always works. */
export const AiToolbar: React.FC = () => {
  const facts = useEngine2Model((s) => s.facts);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const output = useEngine2Model((s) => s.output);
  const aiBusy = useEngine2Model((s) => s.aiBusy);
  const aiSuggest = useEngine2Model((s) => s.aiSuggest);
  const runRedlineAction = useEngine2Model((s) => s.runRedlineAction);
  const [target, setTarget] = useState('20');
  const [lever, setLever] = useState<'entry_multiple' | 'exit_multiple' | 'leverage' | 'growth_shift'>('entry_multiple');
  const [seek, setSeek] = useState<string | null>(null);
  const hasKey = typeof window !== 'undefined' && !!localStorage.getItem('deal-engine-api-key');
  if (!facts || !assumptions) return null;

  const btn = { border: '1px solid rgba(17,17,17,0.2)', color: '#111', fontFamily: mono } as const;
  const downloadMemo = async () => {
    if (!output) return;
    const { memoSkeleton } = await import('../../../lib/ai2/memo');
    const md = memoSkeleton(output, facts.currency as Engine2Currency);
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${facts.entity_name.replace(/[^\w-]+/g, '_')}_memo.md`; a.click();
    URL.revokeObjectURL(url);
  };
  const runSeek = async () => {
    const { solveForIrr } = await import('../../../lib/ai2/goalseek');
    const t = Number(target) / 100;
    if (!Number.isFinite(t)) { setSeek('enter a target IRR %'); return; }
    const r = solveForIrr(facts, assumptions, lever, t);
    if (!r) { setSeek(`target ${target}% is outside what ${lever} can reach — N/A`); return; }
    setSeek(`${lever} = ${r.value.toFixed(3)} ⇒ IRR ${pct(r.achieved_irr)}`);
  };

  return (
    <span className="flex items-center gap-1.5 flex-wrap justify-end">
      <select value={lever} onChange={(e) => setLever(e.target.value as typeof lever)}
        className="px-1 py-1 text-[12px] uppercase" style={btn}>
        <option value="entry_multiple">entry ×</option>
        <option value="exit_multiple">exit ×</option>
        <option value="leverage">leverage</option>
        <option value="growth_shift">growth Δ</option>
      </select>
      <input value={target} onChange={(e) => setTarget(e.target.value)} className="w-10 px-1 py-1 text-[12px] text-right" style={btn} />
      <span className="text-[12px]" style={labelStyle}>%</span>
      <button onClick={runSeek} className="px-2 py-1 text-[12px] uppercase tracking-widest" style={btn}>Goal-seek</button>
      {seek && <span className="text-[12px]" style={labelStyle}>{seek}</span>}
      {output && <button onClick={downloadMemo} className="px-2 py-1 text-[12px] uppercase tracking-widest" style={btn}>Memo ↓</button>}
      {hasKey ? (
        <>
          <button onClick={aiSuggest} disabled={aiBusy} className="px-2 py-1 text-[12px] uppercase tracking-widest" style={btn}>
            {aiBusy ? 'AI…' : 'AI suggest'}
          </button>
          <button onClick={runRedlineAction} disabled={aiBusy} className="px-2 py-1 text-[12px] uppercase tracking-widest" style={btn}>Redline</button>
        </>
      ) : (
        <span className="text-[12px] uppercase tracking-widest" style={labelStyle}>AI suggest · redline — OFF (no API key)</span>
      )}
    </span>
  );
};

/** AI outcomes strip: what AI-suggest applied/dropped (auditable) + redline challenges. */
export const AiResults: React.FC = () => {
  const aiNotes = useEngine2Model((s) => s.aiNotes);
  const redlineItems = useEngine2Model((s) => s.redlineItems);
  if (!aiNotes.length && !redlineItems) return null;
  return (
    <div className="mt-2 p-2.5" style={{ border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.04)' }}>
      {aiNotes.map((n, i) => (
        <p key={`n${i}`} className="text-[12px] mb-0.5" style={{ color: '#6d28d9', fontFamily: mono }}>{n}</p>
      ))}
      {redlineItems?.map((r, i) => (
        <p key={`r${i}`} className="text-[12px] mb-0.5" style={{ color: '#6d28d9', fontFamily: mono }}>
          ✎ {r.path}: {r.challenge}
        </p>
      ))}
    </div>
  );
};

/**
 * `view="assumptions"` is step 3 of the flow (inputs and the Build button only — results live on
 * their own screen); the default renders inputs and outputs together.
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
  const reset = useEngine2Model((s) => s.reset);
  // the Build gate (v2.0.0): every input the model will read must be entered
  useEngine2Model((s) => s.assumptions);
  useEngine2Model((s) => s.pending);
  const blankInputs = useEngine2Model.getState().missing();
  if (!facts) {
    return <p className="text-[13px] p-6" style={labelStyle}>Import a company first (Screen 1) — the v2 workbench reads the engine2 store.</p>;
  }
  const ccy = facts.currency as Engine2Currency;
  const blocked = missing.length > 0 || blankInputs.length > 0 || useEngine2Model.getState().assumptions === null;
  return (
    // the v2 tree inks in near-black; it must supply its own paper (the site shell is
    // dark — verified visually in the browser pane, 2026-07-24)
    <div className={inputsOnly ? 'min-h-screen' : 'min-h-screen overflow-y-auto'} style={{ background: '#F9F9F7' }}>
    <div className={`${inputsOnly ? 'max-w-4xl' : 'max-w-3xl'} mx-auto p-6`}>
      {inputsOnly && (
        <div className="mb-5">
          <h1 className="font-playfair text-[30px] font-bold leading-tight" style={{ color: '#111' }}>Assumptions</h1>
          <p className="text-[14px] mt-2 leading-relaxed" style={{ ...labelStyle, color: 'rgba(17,17,17,0.72)' }}>
            Every input starts blank — nothing is assumed for you. Where the filing or a cited market source supports a value, a blue “use” chip offers it with its basis; it is applied only when you click it.
          </p>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm tracking-widest uppercase" style={{ fontFamily: mono, color: '#111' }}>{inputsOnly ? 'Figures the model reads' : facts.entity_name}</h2>
        <span className="flex items-center gap-1.5">
          {/* F2: the workbench is the default screen — this is the way back to Screen 1
              (engine2 reset only; the page re-renders the source screen on empty facts). */}
          {!inputsOnly && (
            <button onClick={reset} className="px-2.5 py-1 text-[12px] uppercase tracking-widest"
              style={{ border: '1px solid rgba(17,17,17,0.2)', color: 'rgba(17,17,17,0.55)', fontFamily: mono }}>
              ← New import
            </button>
          )}
        </span>
      </div>
      <div className="mb-4">
        <HistoryTable
          facts={facts}
          isoOverride={missing.includes('currency_unsupported') ? sourceCurrency : null}
        />
        {/* honest-degradation notes from extraction (currency, days gating, ROU inclusion,
            FPI history) — computed since D2/D6 but only now SHOWN (review 2026-07-24) */}
        {factNotes.map((n) => (
          <p key={n} className="text-[12px] mt-1" style={labelStyle}>◦ {n}</p>
        ))}
      </div>
      <MissingBar />
      <AssumptionsPanel />
      {blankInputs.length > 0 && (
        <div className="mt-3 p-2.5" style={{ border: '1px solid rgba(204,0,0,0.25)', background: 'rgba(204,0,0,0.03)' }}>
          <p className="text-[12px] uppercase tracking-widest mb-1" style={{ color: '#CC0000', fontFamily: mono }}>
            {blankInputs.length} input{blankInputs.length === 1 ? '' : 's'} still blank — nothing is assumed for you
          </p>
          {blankInputs.slice(0, 12).map((m) => (
            <p key={m.path} className="text-[12px]" style={labelStyle}>◦ {m.label}</p>
          ))}
          {blankInputs.length > 12 && <p className="text-[12px]" style={labelStyle}>◦ … and {blankInputs.length - 12} more</p>}
        </div>
      )}
      {error && <p className="text-[13px] mt-3" style={{ color: '#b91c1c', fontFamily: mono }}>{error}</p>}
      <div className={inputsOnly ? 'sticky bottom-0 -mx-6 px-6 py-3 mt-4 flex items-center justify-between' : 'mt-4 flex items-center justify-between'}
        style={inputsOnly ? { background: '#fff', borderTop: '1px solid rgba(17,17,17,0.82)' } : undefined}>
        <div className="text-[13px]" style={{ color: 'rgba(17,17,17,0.6)', fontFamily: mono }}>
          {output ? (
            <>
              Sponsor IRR {headlineNotMeaningful(output) ? 'N/M' : pct(output.returns.sponsor_net.irr)} · MOIC {headlineNotMeaningful(output) ? 'N/M' : multiple(output.returns.sponsor_net.moic)} ·
              Equity {money(output.sources_uses.sponsor_equity, ccy, 0)}
            </>
          ) : (
            'Build to compute — outputs never render stale.'
          )}
        </div>
        <button onClick={build} disabled={blocked}
          className="px-8 py-2.5 text-sm tracking-widest uppercase"
          style={{ background: blocked ? 'rgba(17,17,17,0.15)' : '#CC0000', color: '#fff', fontFamily: mono, cursor: blocked ? 'not-allowed' : 'pointer' }}>
          Build →
        </button>
      </div>
      {output && !inputsOnly && (
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={async () => {
              // SPEC §26: a live formula model. Unsupported features BLOCK the export by name.
              const { buildFormulaWorkbook, formulaCoverageBlockers } = await import('../../../lib/engine2/workbook');
              const blockers = formulaCoverageBlockers(output);
              if (blockers.length) {
                alert(`The Excel model does not yet implement: ${blockers.join(', ')}. Export is blocked rather than exporting pasted values.`);
                return;
              }
              const buf = await buildFormulaWorkbook(output, { cachedResults: true }).wb.xlsx.writeBuffer();
              const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `${facts.entity_name.replace(/[^\w-]+/g, '_')}_LBO_model.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2.5 py-1 text-[12px] uppercase tracking-widest"
            style={{ border: '1px solid rgba(17,17,17,0.2)', color: '#111', fontFamily: mono }}
          >
            Export Excel
          </button>
          <AiToolbar />
        </div>
      )}
      {!inputsOnly && <AiResults />}
      {output && !inputsOnly && output.coherence.length > 0 && (
        <div className="mt-3 p-2.5" style={{ border: '1px solid rgba(180,120,0,0.4)', background: 'rgba(180,120,0,0.05)' }}>
          {output.coherence.map((f) => (
            <p key={f.code + f.message} className="text-[12px] mb-0.5" style={{ color: f.severity === 'block' ? '#b91c1c' : '#92600a', fontFamily: mono }}>
              {f.severity === 'block' ? '■' : '▲'} {f.message}
            </p>
          ))}
        </div>
      )}
      {output && !inputsOnly && <OutputTabs output={output} currency={ccy} />}
    </div>
    </div>
  );
};

export default Workbench;
