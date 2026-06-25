import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';
import { searchCompanies, parseEdgarUrl, type CompanyMatch } from '../../../lib/edgar/client';

/**
 * Screen 1 — Source (Phase 1). Pull the target's ACTUAL financials from SEC EDGAR: search by
 * name/ticker (autocomplete → CIK), or paste an EDGAR URL/CIK. 10-K upload is stubbed behind
 * "coming soon" (EDGAR-first per the build decision). A manual-entry fallback remains for
 * private targets not on EDGAR.
 */

const mono = "'JetBrains Mono', monospace";
const paper = '#F9F9F7';
const inputStyle: React.CSSProperties = { background: '#fff', border: '1px solid rgba(17,17,17,0.15)', color: '#111', fontFamily: mono, outline: 'none' };
const labelStyle: React.CSSProperties = { color: 'rgba(17,17,17,0.4)', fontFamily: mono };

const SourceScreen: React.FC<{ onManual: () => void }> = ({ onManual }) => {
  const importFromEdgar = useDealEngineStore((s) => s.importFromEdgar);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);

  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runSearch = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setMatches([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true); setSearchErr(null);
      try { setMatches(await searchCompanies(q, 10)); }
      catch (e) { setSearchErr((e as Error).message); setMatches([]); }
      finally { setSearching(false); }
    }, 250);
  }, []);

  const pick = (m: CompanyMatch) => {
    setQuery(`${m.title} (${m.ticker})`);
    setMatches([]);
    importFromEdgar(m.cik10, { dealName: m.title });
  };

  const submitUrl = () => {
    const parsed = parseEdgarUrl(urlInput);
    if (!parsed) { setSearchErr('Could not parse a CIK from that — paste an EDGAR URL, a 10-digit CIK, or a number.'); return; }
    importFromEdgar(parsed.cik10);
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: paper }}>
      <div className="relative z-10 w-full max-w-2xl mx-auto px-6 py-12">
        <div className="mb-5">
          <Link to="/" className="text-[10px] tracking-widest uppercase" style={{ ...labelStyle, textDecoration: 'none' }}>← mridulmalani.com</Link>
        </div>
        <div className="border-t-[3px] border-[#111] mb-6" />
        <h1 className="font-playfair text-4xl lg:text-5xl font-bold mb-3" style={{ color: '#111' }}>Source the target</h1>
        <p className="mb-8" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.8, maxWidth: 460 }}>
          Pull a US company's actual financials straight from its SEC filings. Every extracted figure is shown on the next screen with a link back to the filing — nothing is assumed without you seeing it.
        </p>

        <div className="p-6 lg:p-8" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.1)' }}>
          <div className="border-t-[2px] border-[#111] mb-5" />

          {/* Company autocomplete */}
          <label className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>Company name or ticker</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              autoFocus
              placeholder="e.g. Apple, AAPL, Microsoft…"
              onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }}
              className="w-full px-3 py-2 text-sm"
              style={inputStyle}
            />
            {(matches.length > 0 || searching) && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto" style={{ background: '#fff', border: '1px solid rgba(17,17,17,0.15)' }}>
                {searching && <div className="px-3 py-2 text-[11px]" style={labelStyle}>Searching EDGAR…</div>}
                {matches.map((m) => (
                  <button
                    key={m.cik10}
                    onClick={() => pick(m)}
                    className="w-full text-left px-3 py-2 transition-colors hover:bg-[rgba(17,17,17,0.03)] flex items-center justify-between"
                  >
                    <span className="text-[13px] truncate" style={{ color: '#111', fontFamily: 'Lora, serif' }}>{m.title}</span>
                    <span className="text-[10px] ml-3 flex-shrink-0" style={{ color: '#CC0000', fontFamily: mono }}>{m.ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* EDGAR URL / CIK */}
          <div className="mt-5">
            <label className="block mb-1 text-[10px] tracking-widest uppercase" style={labelStyle}>…or paste an EDGAR URL / CIK</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                placeholder="https://www.sec.gov/…  or  0000320193"
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }}
                className="flex-1 px-3 py-2 text-sm"
                style={inputStyle}
              />
              <button
                onClick={submitUrl}
                disabled={isCalculating || !urlInput.trim()}
                className="px-4 py-2 text-[11px] tracking-widest uppercase"
                style={{ background: urlInput.trim() ? '#111' : 'rgba(17,17,17,0.05)', color: urlInput.trim() ? '#fff' : 'rgba(17,17,17,0.3)', fontFamily: mono, border: 'none' }}
              >
                Go
              </button>
            </div>
          </div>

          {(error || searchErr) && (
            <p className="text-xs mt-4" style={{ color: '#b91c1c', fontFamily: mono, lineHeight: 1.6 }}>{error || searchErr}</p>
          )}
          {isCalculating && (
            <p className="text-xs mt-4" style={{ color: 'rgba(17,17,17,0.5)', fontFamily: mono }}>Fetching filings from EDGAR…</p>
          )}

          {/* Secondary paths */}
          <div className="mt-6 pt-5 grid grid-cols-2 gap-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)' }}>
            <button
              disabled
              title="10-K / PDF upload is coming soon — use the EDGAR path for US issuers."
              className="py-2.5 text-[10px] tracking-widest uppercase"
              style={{ background: 'transparent', color: 'rgba(17,17,17,0.3)', fontFamily: mono, border: '1px dashed rgba(17,17,17,0.15)', cursor: 'not-allowed' }}
            >
              Upload 10-K · coming soon
            </button>
            <button
              onClick={onManual}
              className="py-2.5 text-[10px] tracking-widest uppercase transition-colors hover:bg-[rgba(17,17,17,0.03)]"
              style={{ background: 'transparent', color: 'rgba(17,17,17,0.5)', fontFamily: mono, border: '1px solid rgba(17,17,17,0.15)' }}
            >
              Manual entry (private)
            </button>
          </div>
        </div>

        <p className="mt-4 text-[10px]" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: mono, lineHeight: 1.7 }}>
          US issuers file with the SEC. Foreign private issuers (20-F) and private targets may have sparse or no XBRL — any gaps are surfaced for you to fill on the review screen.
        </p>
      </div>
    </div>
  );
};

export default SourceScreen;
