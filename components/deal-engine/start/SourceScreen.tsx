import React, { useState, useRef, useCallback } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { searchCompanies, parseEdgarUrl } from '../../../lib/edgar/client';
import { searchEsefByName } from '../../../lib/edgar/esef';
import { uploadedFilingToRaw } from '../../../lib/edgar/ixbrl';
import { dealUiStore, useDealUi, type AiFeatures } from '../../../store/dealUi';
import { Button, Segmented } from '../ui/kit';
import ApiKeyInline from './ApiKeyInline';
import { PROVIDER_KEY_PAGES } from '../../../lib/ai2/gateway/providers';

/**
 * Screen 1 — Source. Three honest paths, framed the way targets are actually sourced:
 *
 *  1. MANUAL ENTRY — the realistic path. Most buyouts are of PRIVATE companies (founder
 *     sales, sponsor secondaries, carve-outs) underwritten from a CIM/dataroom, not from
 *     public filings.
 *  2. PUBLIC FILINGS (SEC EDGAR / ESEF) — a real workflow too (take-private screens and
 *     "LBO floor" analyses run on listed names), and the fastest way to try the engine:
 *     filings are free, structured, and land with provenance.
 *  3. UPLOAD A FILING — live [IXBRL_SPEC v1]: an ANNUAL iXBRL filing (10-K/20-F, ESEF .zip,
 *     Companies House accounts) parsed ENTIRELY in the browser — the file never leaves the
 *     machine. PDF CIM extraction remains the named next step.
 *
 * Every route feeds the SAME engine2 workbench (extraction → adapter → suggest → build).
 * Facts carry provenance; gaps stay gaps.
 */

type Mode = 'sec' | 'esef';
interface Match { id: string; title: string; tag: string; onPick: () => void }
const LEI_RE = /^[A-Za-z0-9]{18,20}$/;

/** A secondary way in: a title, one sentence, and the whole tile is the control. */
const PathTile: React.FC<{ title: string; body: string; action?: () => void; cta: string; fileAccept?: string; onFile?: (f: File) => void }> = ({ title, body, action, cta, fileAccept, onFile }) => {
  const inner = (
    <>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)]">{body}</span>
      <span className="mt-auto pt-2 text-[13px] font-medium text-[color:var(--de-input)]">{cta}</span>
    </>
  );
  const frame = 'text-left p-5 flex flex-col gap-1.5 rounded-[var(--de-r)] bg-[var(--de-surface)] border border-[color:var(--de-rule)] hover:border-[color:var(--de-rule-strong)] transition-colors cursor-pointer';
  if (onFile) {
    return (
      <label className={frame}>
        <input type="file" accept={fileAccept} className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        {inner}
      </label>
    );
  }
  return <button type="button" onClick={action} className={frame}>{inner}</button>;
};

/** One thing the page can do for the analyst, switched on or off and remembered. */
const FeatureBox: React.FC<{ name: keyof AiFeatures; title: string; body: string }> = ({ name, title, body }) => {
  const on = useDealUi((s) => s.features[name]);
  const setFeature = useDealUi((s) => s.setFeature);
  return (
    <li>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setFeature(name, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--de-ink)]" />
        <span>
          <span className="block text-[13px] font-medium">{title}</span>
          <span className="block text-[12px] leading-relaxed text-[color:var(--de-ink-3)] mt-0.5 max-w-[56ch]">{body}</span>
        </span>
      </label>
    </li>
  );
};

const SourceScreen: React.FC<{ onManual: () => void }> = ({ onManual }) => {
  const assistantOpen = useDealUi((s) => s.assistant.open);
  const setAssistant = useDealUi((s) => s.setAssistant);
  const importFromEdgar = useDealEngineStore((s) => s.importFromEdgar);
  const importFromEsef = useDealEngineStore((s) => s.importFromEsef);
  const loadModel = useDealEngineStore((s) => s.loadModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);
  const error = useDealEngineStore((s) => s.error);

  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const loadFromHistoricals = useDealEngineStore((st) => st.loadFromHistoricals);
  const onUploadFile = async (f: File) => {
    setUploadErr(null); setUploadBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      // IXBRL_SPEC v1: parsed entirely in the browser; same mappers as the fetch routes.
      loadFromHistoricals(uploadedFilingToRaw(f.name, bytes));
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally { setUploadBusy(false); }
  };
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
      if (!parsed) { setSearchErr('Could not read a CIK from that. Paste an EDGAR link, a 10-digit CIK, or a number.'); return; }
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
    <div className="max-w-[60rem] mx-auto px-6 pt-14 pb-24">
      <h1 className="de-display text-[44px] lg:text-[56px] leading-[1.05]">Source the target</h1>
      <p className="text-[16px] text-[color:var(--de-ink-2)] mt-3 max-w-[56ch]">
        Start from a listed company’s filed figures, or enter a private company’s numbers yourself. Either way the figures arrive with their source, and a gap stays a gap.
      </p>

      {/* The search is the page: a name in, filed financials out. */}
      <div className="mt-9 p-6 rounded-[14px] bg-[var(--de-surface)] border border-[color:var(--de-rule)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <label htmlFor="de-company" className="text-[14px] font-semibold">{isSec ? 'Company name or ticker' : 'Company name (Europe)'}</label>
          <Segmented ariaLabel="Filing source" value={mode} onChange={switchMode} options={[{ value: 'sec', label: 'US · SEC' }, { value: 'esef', label: 'Europe · ESEF' }]} />
        </div>
        <div className="relative">
          <input
            id="de-company" type="text" value={query} autoFocus autoComplete="off"
            placeholder={isSec ? 'Apple, AAPL, Hasbro' : 'Vinci, SAP, Unilever'}
            onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value, mode); }}
            className="de-control w-full !h-14 px-4 text-[18px] placeholder:text-[color:var(--de-ink-3)]"
          />
          {(matches.length > 0 || searching) && (
            <div className="de-pop absolute left-0 right-0 z-20 mt-1.5 max-h-80 overflow-y-auto p-1.5 bg-[var(--de-surface)] border border-[color:var(--de-rule)] rounded-[var(--de-r)] shadow-[var(--de-shadow-pop)]">
              {searching && <div className="px-3 py-2 text-[13px] text-[color:var(--de-ink-3)]">Searching {isSec ? 'EDGAR' : 'ESEF filers'}</div>}
              {matches.map((m) => (
                <button key={m.id} onClick={m.onPick}
                  className="w-full text-left px-3 h-11 rounded-[var(--de-r-sm)] hover:bg-[var(--de-sunken)] flex items-center justify-between gap-3">
                  <span className="text-[15px] truncate">{m.title}</span>
                  <span className="de-num text-[12px] text-[color:var(--de-ink-3)] shrink-0">{m.tag}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="de-ref" className="text-[13px] text-[color:var(--de-ink-2)]">{isSec ? 'or paste an EDGAR link or CIK' : 'or paste a 20-character LEI'}</label>
          <input
            id="de-ref" type="text" value={urlInput}
            placeholder={isSec ? 'https://www.sec.gov/…  or  0000320193' : '969500…'}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitUrl(); }}
            className="de-control flex-1 min-w-[14rem] px-3 text-[13px]"
          />
          <Button size="sm" variant="primary" onClick={submitUrl} disabled={isCalculating || !urlInput.trim()}>Fetch</Button>
        </div>

        {(error || searchErr) && <p className="text-[13px] mt-3 text-[color:var(--de-accent)]">{error || searchErr}</p>}
        {isCalculating && <p className="text-[13px] mt-3 text-[color:var(--de-ink-2)]">Fetching filings from {sourceLabel}</p>}
        <p className="mt-4 text-[12px] leading-relaxed text-[color:var(--de-ink-3)] max-w-[72ch]">
          {isSec
            ? 'US issuers file with the SEC. Foreign private issuers (20-F) may have sparse data; gaps are shown for you to fill.'
            : 'EU and UK listed issuers file ESEF reports under IFRS. D&A, debt and working capital are often sparser than in US filings; gaps are shown for you to fill.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <PathTile title="Manual entry" cta="Enter the facts"
          body="A private company, from a CIM, a dataroom or management accounts. Every figure is tagged as yours."
          action={onManual} />
        <PathTile title="Upload a filing" cta={uploadBusy ? 'Reading the file' : 'Choose a file'}
          body="An annual iXBRL filing: a 10-K or 20-F, an ESEF package, or UK Companies House accounts. Read in your browser; the file never leaves your machine."
          fileAccept=".htm,.html,.xhtml,.zip" onFile={onUploadFile} />
        <PathTile title="Deal library" cta="Open the library"
          body="Deals you saved in this browser, and deal files sent to you by a colleague."
          action={() => dealUiStore.getState().setOverlay('library')} />
      </div>
      {uploadErr && <p className="mt-3 text-[13px] text-[color:var(--de-accent)]">Upload: {uploadErr}</p>}

      {/* What the page may do for the analyst, chosen before the first figure arrives. Nothing here
          is a gate: every step works with every box cleared and with no key. */}
      <section aria-labelledby="de-help" className="mt-4 p-6 rounded-[14px] bg-[var(--de-surface)] border border-[color:var(--de-rule)] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] gap-x-10 gap-y-6 items-start">
        <div>
          <h2 id="de-help" className="text-[15px] font-semibold">You build the model. Choose what helps.</h2>
          <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-1.5 max-w-[58ch]">
            Suggestions are offered, never applied: a suggested value sits in grey until you accept it, and the model is not built on it before then.
          </p>
          <ul className="mt-4 space-y-3">
            <FeatureBox name="suggestAssumptions" title="Suggested values on Assumptions"
              body="Each blank input shows a suggested value in grey, with its reasoning one key away. Filing figures and cited conventions need no key. An AI key adds a proposal for every other input." />
            <FeatureBox name="flow" title="Keyboard flow on Assumptions"
              body="The sheet opens in the first open input and moves on after each entry, so it is worked without the mouse. The keys are the ones Excel uses." />
            <FeatureBox name="suggestClean" title="Adjustments found in the filing, on Clean"
              body="Lists the one-off and debt-like items the filing reports, ready to add to the bridge." />
            <li>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={assistantOpen} onChange={(e) => setAssistant({ open: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--de-ink)]" />
                <span>
                  <span className="block text-[13px] font-medium">Assistant panel open beside the page</span>
                  <span className="block text-[12px] leading-relaxed text-[color:var(--de-ink-3)] mt-0.5 max-w-[56ch]">Points to the next move and answers questions in your own words. Left clear, it stays closed until you open it from the header.</span>
                </span>
              </label>
            </li>
          </ul>
        </div>
        <div>
          <p className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-[13px] font-medium">AI key</span>
            <span className="text-[12px] text-[color:var(--de-ink-3)]">Optional</span>
          </p>
          <ApiKeyInline bare />
          <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--de-ink-3)]">
            <span className="font-medium text-[color:var(--de-ink-2)]">A paid key gives better suggestions.</span> With a key from Anthropic or OpenAI the whole sheet is reasoned in one pass from this company's own figures, with fuller reasoning, for a small charge per deal.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--de-ink-3)]">
            <span className="font-medium text-[color:var(--de-ink-2)]">A free key works, with plainer results.</span> A free key from{' '}
            <a href={`https://${PROVIDER_KEY_PAGES.groq}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Groq</a> or{' '}
            <a href={`https://${PROVIDER_KEY_PAGES.google}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:text-[color:var(--de-ink)]">Google AI Studio</a>{' '}
            reaches a smaller model with a tight limit: suggestions arrive in batches, are more generic, and may stop when the limit is reached.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--de-ink-3)]">The key is kept only in this browser and sent straight to the provider.</p>
        </div>
      </section>

      {/* Previous-engine .json saves NO LONGER OPEN (the engine that ran them is deleted).
          Selecting one surfaces the honest retirement notice and the re-import path. */}
      <label className="inline-block mt-6 text-[12px] text-[color:var(--de-ink-3)] underline underline-offset-2 decoration-dotted cursor-pointer hover:text-[color:var(--de-ink)]">
        <input type="file" accept=".json" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadModel(f); e.target.value = ''; }} />
        open a saved model from the previous engine (.json)
      </label>
    </div>
  );
};

export default SourceScreen;
