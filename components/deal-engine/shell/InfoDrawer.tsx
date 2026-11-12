/**
 * The guide for the page in view: what the page is for, what an analyst can do on it, and how the
 * engine treats what is entered. Explanation lives here so the screens themselves can stay quiet.
 */
import React from 'react';
import { Drawer, cx } from '../ui/kit';

type StepId = 'source' | 'clean' | 'assumptions' | 'results';
interface Guide { title: string; lede: string; cards: { title: string; body: string; art: React.ReactNode }[] }

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Art: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 64 48" className="w-16 h-12 shrink-0 text-[color:var(--de-ink)]" aria-hidden="true">{children}</svg>
);
const blue = 'var(--de-input)';

const ART = {
  search: <Art><circle cx="26" cy="22" r="10" {...stroke} /><path d="M34 30l10 9" {...stroke} /><path d="M21 22h10M26 17v10" {...stroke} stroke={blue} /></Art>,
  sheet: <Art><rect x="12" y="7" width="40" height="34" rx="3" {...stroke} /><path d="M12 17h40M12 27h40M26 7v34" {...stroke} /><rect x="29" y="20" width="20" height="4" rx="1" fill={blue} /></Art>,
  blank: <Art><rect x="10" y="14" width="44" height="20" rx="4" {...stroke} /><path d="M10 34h44" stroke="var(--de-accent)" strokeWidth="2.5" strokeLinecap="round" /><path d="M18 24h10" {...stroke} strokeDasharray="2 3" /></Art>,
  bridge: <Art><rect x="8" y="12" width="9" height="28" rx="1.5" fill="currentColor" /><rect x="21" y="12" width="9" height="9" rx="1.5" fill="var(--de-pos)" /><rect x="34" y="21" width="9" height="7" rx="1.5" fill="var(--de-accent)" /><rect x="47" y="16" width="9" height="24" rx="1.5" fill="currentColor" /></Art>,
  choice: <Art><rect x="8" y="16" width="48" height="16" rx="8" {...stroke} /><rect x="11" y="19" width="22" height="10" rx="5" fill="currentColor" /><path d="M41 24h8" {...stroke} /></Art>,
  check: <Art><circle cx="32" cy="24" r="15" {...stroke} /><path d="M24 24l6 6 11-13" {...stroke} stroke="var(--de-pos)" strokeWidth="2.2" /></Art>,
  keys: <Art><rect x="8" y="14" width="20" height="20" rx="4" {...stroke} /><rect x="36" y="14" width="20" height="20" rx="4" {...stroke} /><path d="M14 24h8M19 20l4 4-4 4M42 28v-8l4 4 4-4v8" {...stroke} /></Art>,
  live: <Art><path d="M8 36l12-10 9 6 12-16 15 10" {...stroke} /><circle cx="41" cy="16" r="3.5" fill={blue} /></Art>,
  trace: <Art><circle cx="14" cy="24" r="5" {...stroke} /><circle cx="50" cy="12" r="5" {...stroke} /><circle cx="50" cy="36" r="5" {...stroke} /><path d="M19 22l26-8M19 26l26 8" {...stroke} stroke={blue} /></Art>,
  tornado: <Art><rect x="10" y="9" width="44" height="6" rx="1.5" fill="currentColor" /><rect x="16" y="19" width="32" height="6" rx="1.5" fill="currentColor" opacity=".7" /><rect x="22" y="29" width="20" height="6" rx="1.5" fill="currentColor" opacity=".45" /><path d="M32 5v38" {...stroke} stroke={blue} /></Art>,
  excel: <Art><rect x="14" y="6" width="36" height="36" rx="3" {...stroke} /><path d="M14 16h36M14 26h36M26 16v26M38 16v26" {...stroke} /><path d="M32 30v8M28 35l4 4 4-4" {...stroke} stroke={blue} strokeWidth="2" /></Art>,
  cases: <Art><rect x="8" y="12" width="20" height="26" rx="3" {...stroke} /><rect x="36" y="12" width="20" height="26" rx="3" {...stroke} /><path d="M13 20h10M13 26h10M41 20h10M41 26h10" {...stroke} /><path d="M13 32h6" {...stroke} stroke={blue} /><path d="M41 32h10" {...stroke} stroke="var(--de-accent)" /></Art>,
};

const GUIDES: Record<StepId, Guide> = {
  source: {
    title: 'Source',
    lede: 'Bring in the company the deal is about. Everything later in the flow is built on these figures.',
    cards: [
      { title: 'Search public filings', body: 'Type a name or ticker. US companies come from SEC filings; European companies from their ESEF reports. The figures arrive with the filing they came from.', art: ART.search },
      { title: 'Or enter the facts yourself', body: 'For a private company, a CIM or a course case, enter the history by hand, or start a forecast-only case that needs no history at all.', art: ART.sheet },
      { title: 'A gap stays a gap', body: 'If the source lacks a figure the engine shows it as missing and asks you for it. It is never filled with a default or treated as zero.', art: ART.blank },
    ],
  },
  clean: {
    title: 'Clean',
    lede: 'Decide what EBITDA and net debt mean for this company before any model is built on them.',
    cards: [
      { title: 'From reported to adjusted', body: 'Add the adjustments an analyst would make: one-off costs, restructuring, stock compensation. Each one says whether the cost stops or continues after the deal.', art: ART.bridge },
      { title: 'Net debt, item by item', body: 'Add debt-like items such as leases and pensions, and cash-like items. The bridge shows how each moves the figure the sellers are paid on.', art: ART.sheet },
      { title: 'Proposals, never changes', body: 'Where the filing discloses a likely adjustment the page offers it. Nothing is applied until you add it to the bridge.', art: ART.choice },
      { title: 'Or model as reported', body: 'If the reported figures are right for this deal, continue without adjusting. The model then says so wherever the figures are shown.', art: ART.check },
    ],
  },
  assumptions: {
    title: 'Assumptions',
    lede: 'The input sheet of the model. Blue is a number you entered; ink is a number the model worked out.',
    cards: [
      { title: 'Every input starts blank', body: 'A blank has a red underline and holds the build back. The panel on the right lists what is left; click an item to go straight to it.', art: ART.blank },
      { title: 'Suggestions wait for you', body: 'A blue “use” link offers a value drawn from the filing history or a cited convention. Click it, or press S in the blank field. Click the small source tag to read how the value was reached.', art: ART.choice },
      { title: 'It works like a spreadsheet', body: 'Enter moves to the next input and the arrow keys move between cells. Paste a row copied from Excel into a by-year line. Ctrl + Enter copies a value to the years on its right.', art: ART.keys },
      { title: 'The return updates as you type', body: 'Once the sheet is complete the panel shows the return on the inputs as they stand, and how far it has moved since the last build.', art: ART.live },
      { title: 'Keep the basis with the number', body: 'Hover a line and add a note, such as “CIM p.14”. Notes are saved with the deal and exported with the Excel model.', art: ART.sheet },
      { title: 'Cases', body: 'Save the inputs as a named case, such as Management or Downside, then switch between cases or compare them side by side.', art: ART.cases },
    ],
  },
  results: {
    title: 'Results',
    lede: 'What the deal returns, why, and how much it can take before it stops working.',
    cards: [
      { title: 'Click any number', body: 'A figure with a dotted underline opens its formula and the figures that feed it, down to the inputs. They are the formulas of the Excel model itself.', art: ART.trace },
      { title: 'What moves the return', body: 'The tornado flexes one driver at a time by an amount you set and ranks them. The grid shows the return at any two inputs together.', art: ART.tornado },
      { title: 'How far it can bend', body: 'Enter your hurdle return and the page works out how far each input can move before the deal falls below it, and before the money is lost.', art: ART.live },
      { title: 'Take it with you', body: 'Export a formula-driven Excel model, print a one-page summary, copy any table into Excel or PowerPoint, and save any chart as an image.', art: ART.excel },
      { title: 'Review view', body: 'Switch to the review view for the headline figures, the value bridge and the points to check, with the working detail put away.', art: ART.check },
    ],
  },
};

const SHORTCUTS: [string, string][] = [
  ['Ctrl / Cmd + K', 'Search and jump anywhere'],
  ['Enter', 'Next input'],
  ['Arrow keys', 'Move between cells'],
  ['Ctrl / Cmd + Enter', 'Fill right in a by-year line'],
  ['S', 'Use the suggestion in a blank field'],
  ['?', 'Open this guide'],
];

const InfoDrawer: React.FC<{ open: boolean; onClose: () => void; step: string }> = ({ open, onClose, step }) => {
  const g = GUIDES[(step as StepId) in GUIDES ? (step as StepId) : 'source'];
  return (
    <Drawer open={open} onClose={onClose} title={`Guide: ${g.title}`} width="w-[30rem]">
      <p className="de-display text-[22px] leading-snug">{g.lede}</p>
      <ul className="mt-6 space-y-3">
        {g.cards.map((c, i) => (
          <li key={c.title} className={cx('de-pop flex items-start gap-4 p-4 rounded-[var(--de-r)] bg-[var(--de-paper)]')} style={{ animationDelay: `${i * 45}ms`, animationFillMode: 'both' }}>
            {c.art}
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{c.title}</p>
              <p className="text-[13px] leading-relaxed text-[color:var(--de-ink-2)] mt-1">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <p className="text-[13px] font-semibold mb-2">Keyboard</p>
        <dl className="divide-y divide-[color:var(--de-rule)]">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-[13px] text-[color:var(--de-ink-2)]">{v}</dt>
              <dd className="de-kbd whitespace-nowrap">{k}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-[12px] text-[color:var(--de-ink-3)] leading-relaxed mt-8">
        Everything you enter stays in this browser. One engine produces the figures on screen and the formulas in the Excel model.
      </p>
    </Drawer>
  );
};

export default InfoDrawer;
