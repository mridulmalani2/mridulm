/**
 * Cases, the history of builds, and the deal library. A case and a version are saved INPUTS:
 * every figure shown beside one is computed now, by the one engine, on the deal's current facts.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useEngine2Model } from '../../../store/engine2Model';
import { useWorkspace, type InputSet } from '../../../store/workspace';
import { diffInputs, headlineOf, irrWalk, tryRun, type Headline, type InputChange } from '../../../lib/analysis';
import { labelFor as engineLabel } from '../../../lib/engine2/draft';
import { plainLabel } from '../v2/sections';
import { money, multiple, num, pct } from '../../../lib/format';
import type { Engine2Currency } from '../../../lib/format';
import type { DealFacts } from '../../../lib/engine2/types';
import { Button, Drawer, TextInput, cx } from '../ui/kit';
import { download, fileStem } from '../results/exportModel';

const labelFor = (path: string) => plainLabel(engineLabel(path));

// ── showing an input value in words ─────────────────────────────────────────────────────────

const isPctPath = (p: string) => /(pct|rate|growth|margin|coupon|spread|floor|mrp|risk_free|fraction)(\.\d+)?$/.test(p) && !/hurdle|leverage/.test(p);
const isMultPath = (p: string) => /(multiple|x_ebitda|hurdle_moic|leverage_max|level|above_net_leverage|dscr_min|fccr_min|max)(\.\d+)?$/.test(p);

export function showInput(path: string, v: unknown): string {
  if (v === null || v === undefined) return 'off';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v.replace(/_/g, ' ');
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'blank';
    if (isPctPath(path)) return pct(v, 2);
    if (isMultPath(path)) return multiple(v, 2);
    return num(v, Number.isInteger(v) ? 0 : 2);
  }
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'number')) return (v as number[]).map((x) => showInput(path, x)).join(', ');
    return `${v.length} item${v.length === 1 ? '' : 's'}`;
  }
  return 'set';
}

const headOf = (facts: DealFacts, s: InputSet): Headline | string => {
  const r = tryRun(facts, s.assumptions, s.pending);
  return r.ok ? headlineOf(r.output) : r.reason;
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ── cases ───────────────────────────────────────────────────────────────────────────────────

/** Cases side by side with the inputs as they stand: the headline figures, then every input that differs. */
export const CasesCompare: React.FC<{ onLoaded?: () => void }> = ({ onLoaded }) => {
  const facts = useEngine2Model((s) => s.facts);
  const assumptions = useEngine2Model((s) => s.assumptions);
  const pending = useEngine2Model((s) => s.pending);
  const basis = useEngine2Model((s) => s.basis);
  const cases = useWorkspace((s) => s.cases);
  const loadCase = useWorkspace((s) => s.loadCase);
  const deleteCase = useWorkspace((s) => s.deleteCase);

  const cols = useMemo(() => {
    if (!facts || !assumptions) return [];
    const current: InputSet = { assumptions, pending, basis };
    return [{ id: 'current', name: 'Current inputs', set: current }, ...cases.map((c) => ({ id: c.id, name: c.name, set: c as InputSet }))]
      .map((c) => ({ ...c, head: headOf(facts, c.set) }));
  }, [facts, assumptions, pending, basis, cases]);
  if (!facts || !assumptions) return null;
  const ccy = facts.currency as Engine2Currency;

  // every input that differs from the current inputs in at least one case
  const changes = new Map<string, InputChange[]>();
  cols.slice(1).forEach((c, i) => {
    for (const ch of diffInputs(assumptions, c.set.assumptions)) {
      const row = changes.get(ch.path) ?? [];
      row[i] = ch;
      changes.set(ch.path, row);
    }
  });
  const rows: [string, (h: Headline) => string][] = [
    ['Sponsor IRR', (h) => (h.irr === null ? 'N/M' : pct(h.irr, 2))],
    ['Money multiple', (h) => (h.moic === null ? 'N/M' : multiple(h.moic, 2))],
    ['Equity cheque', (h) => money(h.equity, ccy, 0)],
    ['Purchase price', (h) => money(h.enterprise_value, ccy, 0)],
    ['Lowest cash in the hold', (h) => money(h.min_cash, ccy, 0)],
    ['Net leverage at exit', (h) => (h.net_leverage_exit === null ? 'N/A' : multiple(h.net_leverage_exit, 2))],
    ['Tightest leverage headroom', (h) => (h.min_leverage_headroom === null ? 'no covenant' : `${num(h.min_leverage_headroom, 2)}x`)],
  ];

  if (cases.length === 0) {
    return <p className="text-[14px] text-[color:var(--de-ink-2)]">No cases saved yet. Save the inputs as they stand under a name, change them, and the two appear here side by side.</p>;
  }
  return (
    <div className="de-scroll-x">
      <table className="de-table">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c.id} className={cx(c.id === 'current' && '!text-[color:var(--de-ink)] !font-semibold')}>{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <td>{label}</td>
              {cols.map((c) => <td key={c.id} className={cx(c.id === 'current' && 'font-medium')}>{typeof c.head === 'string' ? <span className="text-[color:var(--de-ink-3)]">{label === 'Sponsor IRR' ? c.head : '–'}</span> : f(c.head)}</td>)}
            </tr>
          ))}
          {changes.size > 0 && (
            <tr><td colSpan={cols.length + 1} className="!pt-5 !text-left text-[12px] font-medium text-[color:var(--de-ink-3)]">Inputs that differ from the current inputs</td></tr>
          )}
          {[...changes.entries()].map(([path, row]) => (
            <tr key={path}>
              <td className="max-w-[18rem]">{labelFor(path)}</td>
              <td className="text-[color:var(--de-input)]">{showInput(path, (row.find(Boolean) as InputChange).from)}</td>
              {cols.slice(1).map((c, i) => <td key={c.id} className={row[i] ? 'text-[color:var(--de-input)] font-medium' : 'text-[color:var(--de-ink-3)]'}>{row[i] ? showInput(path, row[i].to) : 'same'}</td>)}
            </tr>
          ))}
          <tr>
            <td />
            <td />
            {cols.slice(1).map((c) => (
              <td key={c.id}>
                <span className="inline-flex gap-1">
                  <Button size="sm" onClick={() => { loadCase(c.id); onLoaded?.(); }}>Load</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteCase(c.id)}>Delete</Button>
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const SaveCase: React.FC = () => {
  const saveCase = useWorkspace((s) => s.saveCase);
  const cases = useWorkspace((s) => s.cases);
  const [name, setName] = useState('');
  const taken = cases.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <div>
      <div className="flex gap-2">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this case" aria-label="Case name"
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { saveCase(name); setName(''); } }} />
        <Button variant="primary" disabled={!name.trim()} onClick={() => { saveCase(name); setName(''); }}>{taken ? 'Replace' : 'Save case'}</Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {['Management', 'Base', 'Downside', 'Lender'].map((n) => (
          <button key={n} type="button" onClick={() => setName(n)} className="h-7 px-2.5 rounded-full text-[12px] bg-[var(--de-sunken)] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)]">{n}</button>
        ))}
      </div>
    </div>
  );
};

export const CasesDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Drawer open={open} onClose={onClose} title="Cases" width="w-[52rem]">
    <p className="text-[13px] text-[color:var(--de-ink-2)] mb-3 max-w-[60ch]">A case is the whole input sheet saved under a name. Loading one replaces the inputs on the sheet; save the current ones first if you want to keep them.</p>
    <SaveCase />
    <div className="mt-6"><CasesCompare onLoaded={onClose} /></div>
  </Drawer>
);

// ── history ─────────────────────────────────────────────────────────────────────────────────

export const HistoryDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const facts = useEngine2Model((s) => s.facts);
  const versions = useWorkspace((s) => s.versions);
  const restore = useWorkspace((s) => s.restoreVersion);
  const clear = useWorkspace((s) => s.clearVersions);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!facts || !open) return [];
    return versions.map((v, i) => ({ v, n: i + 1, head: headOf(facts, v), prev: i > 0 ? versions[i - 1] : null })).reverse();
  }, [facts, versions, open]);
  const walk = useMemo(() => {
    const row = list.find((x) => x.v.id === openId);
    return facts && row?.prev ? irrWalk(facts, row.prev.assumptions, row.v.assumptions) : null;
  }, [facts, list, openId]);

  return (
    <Drawer open={open} onClose={onClose} title="Build history" width="w-[34rem]"
      aside={versions.length > 0 ? <Button size="sm" variant="quiet" onClick={clear}>Clear</Button> : undefined}>
      {list.length === 0 ? (
        <p className="text-[14px] text-[color:var(--de-ink-2)]">Each time the model is built, the inputs are recorded here. Open a build to see which edits moved the return since the one before it.</p>
      ) : (
        <ol className="space-y-2">
          {list.map(({ v, n, head, prev }) => {
            const isOpen = openId === v.id;
            return (
              <li key={v.id} className="rounded-[var(--de-r)] border border-[color:var(--de-rule)]">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button type="button" disabled={!prev} onClick={() => setOpenId(isOpen ? null : v.id)} className="text-left min-w-0">
                    <span className="block text-[14px] font-medium">Build {n}</span>
                    <span className="block text-[12px] text-[color:var(--de-ink-3)]">{when(v.builtAt)}{prev ? (isOpen ? ' · hide changes' : ' · show what changed') : ' · first build'}</span>
                  </button>
                  <span className="flex items-center gap-3">
                    <span className="de-num text-[15px] font-semibold">{typeof head === 'string' ? 'N/A' : head.irr === null ? 'N/M' : pct(head.irr, 2)}</span>
                    <Button size="sm" onClick={() => { restore(v.id); onClose(); }}>Restore</Button>
                  </span>
                </div>
                {isOpen && walk && (
                  <div className="px-4 pb-4">
                    {walk.steps.length === 0 ? <p className="text-[13px] text-[color:var(--de-ink-3)]">No input changed.</p> : (
                      <table className="de-table">
                        <thead><tr><th>Input changed</th><th>From</th><th>To</th><th>IRR move</th></tr></thead>
                        <tbody>
                          {walk.steps.map((s) => (
                            <tr key={s.path}>
                              <td className="max-w-[14rem]">{labelFor(s.path)}</td>
                              <td>{showInput(s.path, s.from)}</td>
                              <td className="text-[color:var(--de-input)]">{showInput(s.path, s.to)}</td>
                              <td className={cx('font-medium', s.irr_move !== null && s.irr_move > 0 && 'text-[color:var(--de-pos)]', s.irr_move !== null && s.irr_move < 0 && 'text-[color:var(--de-accent)]')}>
                                {s.irr_move === null ? 'N/A' : `${s.irr_move > 0 ? '+' : s.irr_move < 0 ? '−' : ''}${num(Math.abs(s.irr_move) * 100, 2)} pts`}
                              </td>
                            </tr>
                          ))}
                          <tr data-total="true">
                            <td>Sponsor IRR</td>
                            <td>{walk.from_irr === null ? 'N/A' : pct(walk.from_irr, 2)}</td>
                            <td>{walk.to_irr === null ? 'N/A' : pct(walk.to_irr, 2)}</td>
                            <td>{walk.from_irr === null || walk.to_irr === null ? 'N/A' : `${walk.to_irr >= walk.from_irr ? '+' : '−'}${num(Math.abs(walk.to_irr - walk.from_irr) * 100, 2)} pts`}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                    <p className="text-[12px] text-[color:var(--de-ink-3)] mt-2">The changes are applied one at a time, in this order. The moves add up to the total; how it splits between them depends on the order.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
};

// ── library ─────────────────────────────────────────────────────────────────────────────────

export const LibraryDrawer: React.FC<{ open: boolean; onClose: () => void; onOpened: () => void }> = ({ open, onClose, onOpened }) => {
  const facts = useEngine2Model((s) => s.facts);
  const dealName = useEngine2Model((s) => s.assumptions?.deal_name ?? s.facts?.entity_name ?? '');
  const library = useWorkspace((s) => s.library);
  const libraryId = useWorkspace((s) => s.libraryId);
  const save = useWorkspace((s) => s.saveToLibrary);
  const openDeal = useWorkspace((s) => s.openFromLibrary);
  const duplicate = useWorkspace((s) => s.duplicateInLibrary);
  const remove = useWorkspace((s) => s.deleteFromLibrary);
  const exportFile = useWorkspace((s) => s.exportDealFile);
  const importFile = useWorkspace((s) => s.importDealFile);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  return (
    <Drawer open={open} onClose={onClose} title="Deal library" width="w-[32rem]">
      <p className="text-[13px] text-[color:var(--de-ink-2)] mb-4">Deals are kept in this browser only. To move one to another computer or send it to a colleague, save it as a file.</p>
      {facts && (
        <div className="p-4 rounded-[var(--de-r)] bg-[var(--de-paper)] mb-6">
          <p className="text-[13px] font-semibold mb-2">The open deal</p>
          <div className="flex gap-2">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={dealName} aria-label="Name in the library" />
            <Button variant="primary" onClick={() => { save(name || undefined); setName(''); setMessage('Saved to the library.'); }}>{libraryId ? 'Save' : 'Save to library'}</Button>
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => { const text = exportFile(); if (text) download(`${fileStem(dealName || 'deal')}.deal.json`, text, 'application/json'); }}>Save as a file</Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-semibold">Saved deals</p>
        <Button size="sm" onClick={() => picker.current?.click()}>Open a deal file</Button>
        <input ref={picker} type="file" accept=".json,application/json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (importFile(await f.text())) { setMessage(null); onOpened(); onClose(); } else setMessage('That file is not a deal saved by this engine.');
          }} />
      </div>
      {message && <p className="text-[13px] text-[color:var(--de-ink-2)] mb-2">{message}</p>}
      {library.length === 0 ? <p className="text-[14px] text-[color:var(--de-ink-3)]">Nothing saved yet.</p> : (
        <ul className="divide-y divide-[color:var(--de-rule)]">
          {library.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-[14px] font-medium truncate">{e.name}{e.id === libraryId && <span className="ml-2 text-[12px] font-normal text-[color:var(--de-pos)]">open</span>}</span>
                <span className="block text-[12px] text-[color:var(--de-ink-3)]">saved {when(e.savedAt)}</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Button size="sm" onClick={() => { if (openDeal(e.id)) { onOpened(); onClose(); } else setMessage('That deal could not be opened.'); }}>Open</Button>
                <Button size="sm" variant="quiet" onClick={() => duplicate(e.id)}>Duplicate</Button>
                {confirm === e.id
                  ? <Button size="sm" variant="danger" onClick={() => { remove(e.id); setConfirm(null); }}>Confirm delete</Button>
                  : <Button size="sm" variant="quiet" onClick={() => setConfirm(e.id)}>Delete</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
};
