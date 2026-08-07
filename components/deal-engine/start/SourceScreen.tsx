import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';
import { searchCompanies, parseEdgarUrl } from '../../../lib/edgar/client';
import { searchEsefByName } from '../../../lib/edgar/esef';
import ApiKeyInline from './ApiKeyInline';

/**
 * Screen 1 — Source. Three honest paths, framed the way targets are actually sourced:
 *
 *  1. MANUAL ENTRY — the realistic path. Most buyouts are of PRIVATE companies (founder
 *     sales, sponsor secondaries, carve-outs) underwritten from a CIM/dataroom, not from
 *     public filings.
 *  2. PUBLIC FILINGS (SEC EDGAR / ESEF) — a real workflow too (take-private screens and
 *     "LBO floor" analyses run on listed names), and the fastest way to try the engine:
 *     filings are free, structured, and land with provenance.
 *  3. UPLOAD A FILING — next on the roadmap (deterministic iXBRL parser; then PDF CIMs).
 *
 * Every route feeds the SAME engine2 workbench (extraction → adapter → suggest → build).
 * Facts carry provenance; gaps stay gaps.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const inputStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' };
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.4)', fontFamily: mono };

type Mode = 'sec' | 'esef';
interface Match { id: string; title: string; tag: string; onPick: () => void }
const LEI_RE = /^[A-Za-z0-9]{18,20}$/;

const PathCard: React.FC<{
  tag: string; tagColor?: string; title: string; body: string;
  action?: () => void; actionLabel?: string; active?: boolean; disabled?: boolean;
}> = ({ tag, tagColor = 'rgba(17,17,17,0.35)', title, body, action, actionLabel, active, disabled }) => (
  <button type="button" onClick={action} disabled={disabled || !action}
    className="text-left p-4 flex flex-col gap-2 transition-colors"
    style={{
      background: active ? '#fff' : 'transparent',
      border: active ? '1px solid #111' : disabled ? '1px dashed rgba(17,17,17,0.15)' : '1px solid rgba(17,17,17,0.15)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.75 : 1,
    }}>
    <span className="text-[9px] tracking-widest uppercase" style={{ color: tagColor, fontFamily: mono }}>{tag}</span>
    <span className="text-[15px] font-bold" style={{ color: disabled ? 'rgba(17,17,17,0.45)' : '#111', fontFamily: 'Playfair Display, serif' }}>{title}</span>
    <span className="text-[11.5px]" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', lineHeight: 1.65 }}>{body}</span>
    {actionLabel && (
      <span className="mt-1 text-[10px] tracking-widest uppercase" style={{ color: disabled ? 'rgba(17,17,17,0.3)' : '#CC0000', fontFamily: mono }}>{actionLabel}</span>
    )}
  </button>
);

const SourceScreen: React.FC<{ onManual: () => void }> = ({ onManual }) => {
  const importFromEdgar = useDealEngineStore((s) => s.importFromEdgar);
  const importFromEsef = useDealEngineStore((s) => s.importFromEsef);
  const loadModel = useDealEngineStore((s) => s.loadModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);

  const [filingsOpen, setFilingsOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('sec');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runSearch = useCallback((q: string, m: Mode) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < (m === 'esef' ? 2 : 1)) { setMatches([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true); setSearchErr(null);
      try {
        if (m === 'sec') {
          const r = await searchCompanies(q, 10);
          setMatches(r.map((cm) => ({ id: cm.cik10, title: cm.title, tag: cm.ticker, onPick: () => { setQuery(`${cm.title} (${cm.ticker})`); setMatches([]); importFromEdgar(cm.cik10); } })));
        } else {
          const r = await searchEsefByName(q, 10);
          setMatches(r.map((em) => ({ id: em.lei, title: em.name, tag: `${em.lei.slice(0, 6)}…`, onPick: () => { setQuery(em.name); setMatches([]); importFromEsef(em.lei, { dealName: em.name }); } })));
        }
      } catch (e) { setSearchErr((e as Error).message); setMatches([]); }
      finally { setSearching(false); }
    }, 250);
  }, [importFromEdgar, importFromEsef]);

  const switchMode = (m: Mode) => { setMode(m); setMatches([]); setQuery(''); setUrlInput(''); setSearchErr(null); };

  const submitUrl = () => {
    if (mode === 'sec') {
      const parsed = parseEdgarUrl(urlInput);
      if (!parsed) { setSearchErr('Could not parse a CIK — paste an EDGAR URL, a 10-digit CIK, or a number.'); return; }
      importFromEdgar(parsed.cik10);
    } else {
      const lei = urlInput.trim().toUpperCase();
      if (!LEI_RE.test(lei)) { setSearchErr('Enter a 20-character LEI (find it at search.gleif.org).'); return; }
      importFromEsef(lei);
    }
  };

  const isSec = mode === 'sec';
  const sourceLabel = isSec ? 'SEC EDGAR' : 'ESEF (filings.xbrl.org)';

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: paper }}>
      <div className="relative z-10 w-full max-w-3xl mx-auto px-6 py-12">
        <div className="mb-5">
          <Link to="/" className="text-[10px] tracking-widest uppercase" style={{ ...labelStyle, textDecoration: 'none' }}>← mridulmalani.com</Link>
        </div>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111' }}>Source the target</h1>
        <p className="mb-7" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 560 }}>
          Most buyouts are of <em>private</em> companies — a founder sale, a sponsor-to-sponsor secondary, a
          carve-out — underwritten from a CIM and dataroom, so manual entry is the realistic path. Listed
          companies get bought too (take-privates; every bank runs an “LBO floor” on public names), and their
          filings are free and structured — which also makes them the fastest way to try the engine.
        </p>

        {/* The three paths */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <PathCard
            tag="private target · the realistic path"
            title="Manual entry"
            body="Type the numbers from a CIM, dataroom, or management accounts — multi-year history, every figure provenance-tagged as yours, gaps stay gaps."
            action={onManual} actionLabel="enter the facts →"
          />
          <PathCard
            tag="take-private screen · fastest demo" tagColor="#CC0000"
            title="Public filings"
            body="Pull a listed company's actual financials from SEC EDGAR (US) or ESEF (EU/UK) — the workflow behind take-private screens, and the quickest full demo."
            action={() => setFilingsOpen((o) => !o)} actionLabel={filingsOpen ? 'search below ↓' : 'open the search →'}
            active={filingsOpen}
          />
          <PathCard
            tag="on the roadmap"
            title="Upload a filing"
            body="Drop in an iXBRL report — a 10-K, an ESEF package, or Companies House accounts (UK private companies file these). Deterministic parser next; PDF CIM extraction after."
            disabled actionLabel="next up"
          />
        </div>

        {filingsOpen && (
        <div className="p-6 lg:p-8" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
          <div className="border-t-[2px] border-[#111] mb-5" />

          {/* Source toggle */}
          <div className="mb-4 flex" style={{ border: '1px solid rgba(17,17,17,0.15)', width: 'fit-content' }}>
            {([['sec', 'US · SEC'], ['esef', 'Europe · ESEF']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => switchMode(m)}
                className="px-3 py-1 text-[10px] tracking-widest uppercase transition-colors"
                style={{ background: mode === m ? '#111' : 'transparent', color: mode === m ? '#fff' : 'rgba(17,17,17,0.45)', fontFamily: mono }}>
                {label}
              </button>
            ))}
          </div>

          {/* Company autocomplete */}
          <label className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>{isSec ? 'Company name or ticker' : 'Company name (Europe)'}</label>
          <div className="relative">
            <input
              type="text" value={query} autoFocus
              placeholder={isSec ? 'e.g. Apple, AAPL, Microsoft…' : 'e.g. Vinci, SAP, Unilever…'}
              onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value, mode); }}
              className="w-full px-3 py-2 text-sm" style={inputStyle}
            />
            {(matches.length > 0 || searching) && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.15)' }}>
                {searching && <div className="px-3 py-2 text-[11px]" style={labelStyle}>Searching {isSec ? 'EDGAR' : 'ESEF filers'}…</div>}
                {matches.map((m) => (
                  <button key={m.id} onClick={m.onPick}
                    className="w-full text-left px-3 py-2 transition-colors hover:bg-[rgba(17,17,17,0.03)] flex items-center justify-between">
                    <span className="text-[13px] truncate" style={{ color: '#111', fontFamily: 'Lora, serif' }}>{m.title}</span>
                    <span className="text-[10px] ml-3 flex-shrink-0" style={{ color: '#CC0000', fontFamily: mono }}>{m.tag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* URL / CIK / LEI */}
          <div className="mt-5">
            <label className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>{isSec ? '…or paste an EDGAR URL / CIK' : '…or paste a 20-char LEI'}</label>
            <div className="flex gap-2">
              <input
                type="text" value={urlInput}
                placeholder={isSec ? 'https://www.sec.gov/…  or  0000320193' : '969500…  (search.gleif.org)'}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }}
                className="flex-1 px-3 py-2 text-sm" style={inputStyle}
              />
              <button onClick={submitUrl} disabled={isCalculating || !urlInput.trim()}
                className="px-4 py-2 text-[11px] tracking-widest uppercase"
                style={{ background: urlInput.trim() ? '#111' : 'rgba(17,17,17,0.05)', color: urlInput.trim() ? '#fff' : 'rgba(17,17,17,0.3)', fontFamily: mono, border: 'none' }}>
                Go
              </button>
            </div>
          </div>

          {(error || searchErr) && <p className="text-xs mt-4" style={{ color: '#b91c1c', fontFamily: mono, lineHeight: 1.6 }}>{error || searchErr}</p>}
          {isCalculating && <p className="text-xs mt-4" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: mono }}>Fetching filings from {sourceLabel}…</p>}

          <p className="mt-5 text-[10px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono, lineHeight: 1.7 }}>
            Here the listed-company pull doubles as the demo path: filings are free and structured, so you see the
            whole engine on real numbers in seconds. {isSec
              ? 'US issuers file with the SEC. Foreign private issuers (20-F) may have sparse XBRL — gaps are surfaced for you to fill.'
              : 'EU/UK-listed issuers file ESEF (IFRS). D&A, debt and working-capital coverage is often sparser than US filings — gaps are surfaced for you to fill.'}
          </p>
        </div>
        )}

        {/* Previous-engine .json saves NO LONGER OPEN (the engine that ran them is
            deleted — tag pre-deletion-lib-engine). Selecting one surfaces the honest
            retirement notice + the re-import path. */}
        <label className="block mt-4 text-[10px] tracking-widest uppercase text-center cursor-pointer"
          style={{ color: 'rgba(17,17,17,0.35)', fontFamily: mono }}>
          <input type="file" accept=".json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadModel(f); e.target.value = ''; }} />
          open a saved model (.json — previous engine)
        </label>

        {/* Optional AI key — reused by AI-suggest on the next screen */}
        <ApiKeyInline />
      </div>
    </div>
  );
};

export default SourceScreen;
