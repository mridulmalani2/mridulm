import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';
import { searchCompanies, parseEdgarUrl } from '../../../lib/edgar/client';
import { searchEsefByName } from '../../../lib/edgar/esef';
import ApiKeyInline from './ApiKeyInline';

/**
 * Screen 1 — Source (Phase 1). Pull a target's ACTUAL financials from a free structured filing
 * source: SEC EDGAR (US issuers) or ESEF via filings.xbrl.org (EU/UK-listed). Both feed the same
 * RawHistoricals → assumptions review → model. A manual-entry fallback remains for private
 * targets. Every extracted figure is shown on the next screen with a link back to the filing.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const inputStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' };
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.4)', fontFamily: mono };

type Mode = 'sec' | 'esef';
interface Match { id: string; title: string; tag: string; onPick: () => void }
const LEI_RE = /^[A-Za-z0-9]{18,20}$/;

const SourceScreen: React.FC<{ onManual: () => void }> = ({ onManual }) => {
  const importFromEdgar = useDealEngineStore((s) => s.importFromEdgar);
  const importFromEsef = useDealEngineStore((s) => s.importFromEsef);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);

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
          setMatches(r.map((c) => ({ id: c.cik10, title: c.title, tag: c.ticker, onPick: () => { setQuery(`${c.title} (${c.ticker})`); setMatches([]); importFromEdgar(c.cik10, { dealName: c.title }); } })));
        } else {
          const r = await searchEsefByName(q, 10);
          setMatches(r.map((e) => ({ id: e.lei, title: e.name, tag: `${e.lei.slice(0, 6)}…`, onPick: () => { setQuery(e.name); setMatches([]); importFromEsef(e.lei, { dealName: e.name }); } })));
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
      <div className="relative z-10 w-full max-w-2xl mx-auto px-6 py-12">
        <div className="mb-5">
          <Link to="/" className="text-[10px] tracking-widest uppercase" style={{ ...labelStyle, textDecoration: 'none' }}>← mridulmalani.com</Link>
        </div>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111' }}>Source the target</h1>
        <p className="mb-8" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 460 }}>
          Pull a listed company's actual financials straight from its regulatory filings — {isSec ? 'US issuers via SEC EDGAR' : 'EU/UK-listed via ESEF'}. Every extracted figure is shown on the next screen with a link back to the filing; nothing is assumed without you seeing it.
        </p>

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
                {searching && <div className="px-3 py-2 text-[11px]" style={labelStyle}>Searching {isSec ? 'EDGAR' : 'GLEIF'}…</div>}
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

          {/* Secondary paths */}
          <div className="mt-6 pt-5 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)' }}>
            <button disabled title="10-K / PDF upload is coming soon."
              className="py-2.5 text-[10px] tracking-widest uppercase"
              style={{ background: 'transparent', color: 'rgba(17,17,17,0.3)', fontFamily: mono, border: '1px dashed rgba(17,17,17,0.15)', cursor: 'not-allowed' }}>
              Upload 10-K · coming soon
            </button>
            <button onClick={onManual}
              className="py-2.5 text-[10px] tracking-widest uppercase transition-colors hover:bg-[rgba(17,17,17,0.03)]"
              style={{ background: 'transparent', color: 'rgba(17,17,17,0.5)', fontFamily: mono, border: '1px solid rgba(17,17,17,0.15)' }}>
              Manual entry (private)
            </button>
          </div>

          {/* Optional AI key — reused by AI-suggest on the next screen */}
          <ApiKeyInline />
        </div>

        <p className="mt-4 text-[10px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono, lineHeight: 1.7 }}>
          {isSec
            ? 'US issuers file with the SEC. Foreign private issuers (20-F) and private targets may have sparse or no XBRL — gaps are surfaced for you to fill.'
            : 'EU/UK-listed issuers file ESEF (IFRS). Coverage of D&A, debt and working capital is often sparser than US filings — those gaps are surfaced for you to fill on the review screen.'}
        </p>
      </div>
    </div>
  );
};

export default SourceScreen;
