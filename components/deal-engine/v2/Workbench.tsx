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

const mono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
const labelStyle = { color: 'rgba(17,17,17,0.45)', fontFamily: mono } as const;

const MissingBar: React.FC = () => {
  const missing = useEngine2Model((s) => s.missingFacts);
  const confirm = useEngine2Model((s) => s.confirmFact);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!missing.length) return null;
  return (
    <div className="p-3 mb-4" style={{ border: '1px solid rgba(204,0,0,0.35)', background: 'rgba(204,0,0,0.04)' }}>
      <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: '#b91c1c', fontFamily: mono }}>
        The filing lacks these facts — confirm to build
      </p>
      {missing.filter((p) => p !== 'currency_unsupported').map((path) => (
        <div key={path} className="flex items-center gap-2 mb-1.5">
          <BasisBadge kind="required" />
          <span className="text-[11px]" style={{ fontFamily: mono, color: '#111' }}>{path}</span>
          <input
            value={drafts[path] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
            placeholder="enter to confirm"
            className="w-28 px-1.5 py-1 text-[11px] text-right ml-auto"
            style={{ background: '#fff', border: '1px solid rgba(204,0,0,0.35)', fontFamily: mono, outline: 'none' }}
          />
          <button
            onClick={() => { const v = Number((drafts[path] ?? '').replace(/[,\s]/g, '')); if (Number.isFinite(v)) confirm(path, v); }}
            className="px-2 py-1 text-[9px] uppercase tracking-widest"
            style={{ background: '#111', color: '#fff', fontFamily: mono }}
          >
            Confirm
          </button>
        </div>
      ))}
      {missing.includes('currency_unsupported') && (
        <p className="text-[11px]" style={{ color: '#b91c1c', fontFamily: mono }}>
          Reporting currency not supported — the engine models USD, EUR, GBP, JPY, INR.
        </p>
      )}
    </div>
  );
};

/** E4 toolbar: AI-suggest, Redline, Memo download, and the PURE goal-seek. When no key
 *  is saved the AI buttons stay visibly OFF (the phase rule) — goal-seek always works. */
const AiToolbar: React.FC = () => {
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
        className="px-1 py-1 text-[9px] uppercase" style={btn}>
        <option value="entry_multiple">entry ×</option>
        <option value="exit_multiple">exit ×</option>
        <option value="leverage">leverage</option>
        <option value="growth_shift">growth Δ</option>
      </select>
      <input value={target} onChange={(e) => setTarget(e.target.value)} className="w-10 px-1 py-1 text-[10px] text-right" style={btn} />
      <span className="text-[9px]" style={labelStyle}>%</span>
      <button onClick={runSeek} className="px-2 py-1 text-[9px] uppercase tracking-widest" style={btn}>Goal-seek</button>
      {seek && <span className="text-[9px]" style={labelStyle}>{seek}</span>}
      {output && <button onClick={downloadMemo} className="px-2 py-1 text-[9px] uppercase tracking-widest" style={btn}>Memo ↓</button>}
      {hasKey ? (
        <>
          <button onClick={aiSuggest} disabled={aiBusy} className="px-2 py-1 text-[9px] uppercase tracking-widest" style={btn}>
            {aiBusy ? 'AI…' : 'AI suggest'}
          </button>
          <button onClick={runRedlineAction} disabled={aiBusy} className="px-2 py-1 text-[9px] uppercase tracking-widest" style={btn}>Redline</button>
        </>
      ) : (
        <span className="text-[9px] uppercase tracking-widest" style={labelStyle}>AI suggest · redline — OFF (no API key)</span>
      )}
    </span>
  );
};

/** AI outcomes strip: what AI-suggest applied/dropped (auditable) + redline challenges. */
const AiResults: React.FC = () => {
  const aiNotes = useEngine2Model((s) => s.aiNotes);
  const redlineItems = useEngine2Model((s) => s.redlineItems);
  if (!aiNotes.length && !redlineItems) return null;
  return (
    <div className="mt-2 p-2.5" style={{ border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.04)' }}>
      {aiNotes.map((n, i) => (
        <p key={`n${i}`} className="text-[10px] mb-0.5" style={{ color: '#6d28d9', fontFamily: mono }}>{n}</p>
      ))}
      {redlineItems?.map((r, i) => (
        <p key={`r${i}`} className="text-[10px] mb-0.5" style={{ color: '#6d28d9', fontFamily: mono }}>
          ✎ {r.path}: {r.challenge}
        </p>
      ))}
    </div>
  );
};

const Workbench: React.FC = () => {
  const facts = useEngine2Model((s) => s.facts);
  const output = useEngine2Model((s) => s.output);
  const error = useEngine2Model((s) => s.error);
  const missing = useEngine2Model((s) => s.missingFacts);
  const sourceCurrency = useEngine2Model((s) => s.sourceCurrency);
  const build = useEngine2Model((s) => s.buildWithExhibits);
  const resuggest = useEngine2Model((s) => s.resuggest);
  if (!facts) {
    return <p className="text-[11px] p-6" style={labelStyle}>Import a company first (Screen 1) — the v2 workbench reads the engine2 store.</p>;
  }
  const ccy = facts.currency as Engine2Currency;
  const blocked = missing.length > 0;
  return (
    // the v2 tree inks in near-black; it must supply its own paper (the site shell is
    // dark — verified visually in the browser pane, 2026-07-24)
    <div className="min-h-screen overflow-y-auto" style={{ background: '#F9F9F7' }}>
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm tracking-widest uppercase" style={{ fontFamily: mono, color: '#111' }}>{facts.entity_name}</h2>
        <button onClick={resuggest} className="px-2.5 py-1 text-[9px] uppercase tracking-widest"
          style={{ border: '1px solid rgba(17,17,17,0.2)', color: '#111', fontFamily: mono }}>
          Suggest everything
        </button>
      </div>
      <div className="mb-4">
        <HistoryTable
          facts={facts}
          isoOverride={missing.includes('currency_unsupported') ? sourceCurrency : null}
        />
      </div>
      <MissingBar />
      <AssumptionsPanel />
      {error && <p className="text-[11px] mt-3" style={{ color: '#b91c1c', fontFamily: mono }}>{error}</p>}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px]" style={{ color: 'rgba(17,17,17,0.6)', fontFamily: mono }}>
          {output ? (
            <>
              Sponsor IRR {pct(output.returns.sponsor_net.irr)} · MOIC {multiple(output.returns.sponsor_net.moic)} ·
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
      {output && (
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={async () => {
              const { buildEngine2Workbook } = await import('../../../lib/engine2/excelExport');
              const buf = await buildEngine2Workbook(output, ccy).xlsx.writeBuffer();
              const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `${facts.entity_name.replace(/[^\w-]+/g, '_')}_engine2.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2.5 py-1 text-[9px] uppercase tracking-widest"
            style={{ border: '1px solid rgba(17,17,17,0.2)', color: '#111', fontFamily: mono }}
          >
            Export Excel
          </button>
          <AiToolbar />
        </div>
      )}
      <AiResults />
      {output && <OutputTabs output={output} currency={ccy} />}
      {output && output.coherence.length > 0 && (
        <div className="mt-3 p-2.5" style={{ border: '1px solid rgba(180,120,0,0.4)', background: 'rgba(180,120,0,0.05)' }}>
          {output.coherence.map((f) => (
            <p key={f.code + f.message} className="text-[10px] mb-0.5" style={{ color: f.severity === 'block' ? '#b91c1c' : '#92600a', fontFamily: mono }}>
              {f.severity === 'block' ? '■' : '▲'} {f.message}
            </p>
          ))}
        </div>
      )}
    </div>
    </div>
  );
};

export default Workbench;
