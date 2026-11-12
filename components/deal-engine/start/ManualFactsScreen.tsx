import React, { useState } from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { useEngine2Model } from '../../../store/engine2Model';
import { manualHistoricals, shiftYearEnd, type ManualYearRow } from '../../../lib/edgar/buildModel';
import { Button, DateField, Dropdown, Segmented, cx } from '../ui/kit';

/**
 * Manual-entry "facts" screen — the REALISTIC private-target path. Most buyouts are of
 * private companies underwritten from a CIM / dataroom / management accounts; this screen
 * collects that surface: a multi-year operating history (the same D1 history the EDGAR
 * route extracts), the §1.1 sizing basis (FY or LTM), and the at-entry balance-sheet
 * items. Everything lands as a RawHistoricals tagged 'user' / origin 'manual' and feeds
 * the IDENTICAL engine2 workbench — the manual and filing routes diverge only in how the
 * facts are sourced.
 *
 * Honesty invariant (same as extraction): a BLANK cell stays blank — it becomes a gap the
 * review screen surfaces with a MISSING badge. Nothing is coerced to 0.
 */

/** The nine comps buckets (§21.5). These strings ARE the join key into `data/comps/bands.json`
 *  — rename one and every manual deal of that sector silently falls to the unavailable state
 *  (the audit-B2 dead-wire class). `tests/comps-wiring.test.ts` binds this list to the band key
 *  set by CONSTRUCTION, so drift is a red test rather than a hand-kept list [conformance N8]. */
export const SECTORS = ['Technology', 'Healthcare', 'Industrials', 'Consumer', 'Financial Services', 'Real Estate', 'Energy', 'Business Services', 'Other'];
const CURRENCIES: ('USD' | 'GBP' | 'EUR' | 'INR' | 'JPY')[] = ['USD', 'GBP', 'EUR', 'INR', 'JPY'];
const CSYM: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', INR: '₹', JPY: '¥' };

/** '' → null; anything unparseable → null. Blank is BLANK, never 0. */
const parseCell = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

interface GridRow { revenue: string; ebitda: string; da: string; capex: string }
const emptyRow = (): GridRow => ({ revenue: '', ebitda: '', da: '', capex: '' });

const GRID_METRICS: { key: keyof GridRow; label: string; ltm: boolean }[] = [
  { key: 'revenue', label: 'Revenue', ltm: true },
  { key: 'ebitda', label: 'EBITDA', ltm: true },
  { key: 'da', label: 'D&A', ltm: false },
  { key: 'capex', label: 'Capex', ltm: false },
];

const Field: React.FC<{ label: string; unit?: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }>
  = ({ label, unit, value, onChange, placeholder, disabled }) => (
  <label className="block">
    <span className="flex items-baseline justify-between mb-1.5">
      <span className="text-[13px] text-[color:var(--de-ink-2)]">{label}</span>
      {unit && <span className="text-[12px] text-[color:var(--de-ink-3)]">{unit}</span>}
    </span>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} inputMode="decimal"
      className={cx('de-control de-num w-full px-3 text-[14px] text-right placeholder:text-[color:var(--de-ink-3)] placeholder:text-[12px]', disabled ? 'bg-[var(--de-sunken)] text-[color:var(--de-ink-2)]' : 'text-[color:var(--de-input)]')} />
  </label>
);

const Block: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="py-7 border-t border-[color:var(--de-rule)] first:border-t-0 first:pt-1">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

const ManualFactsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const loadFromHistoricals = useDealEngineStore((s) => s.loadFromHistoricals);
  const startForecastOnly = useEngine2Model((s) => s.startForecastOnly);
  const [forecastHold, setForecastHold] = useState('');

  const [dealName, setDealName] = useState('');
  // the sector picks the listed-comps band shown beside the entry multiple, so it is chosen, not assumed
  const [sector, setSector] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'GBP' | 'EUR' | 'INR' | 'JPY'>('USD');

  const [anchorEnd, setAnchorEnd] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const [rows, setRows] = useState<GridRow[]>([emptyRow(), emptyRow(), emptyRow()]); // index 0 = oldest
  const [basis, setBasis] = useState<'FY' | 'LTM'>('FY');
  const [ltmAsOf, setLtmAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [ltm, setLtm] = useState({ revenue: '', ebitda: '' });

  const [pt, setPt] = useState({ nwc: '', grossDebt: '', cash: '', netDebt: '', netPpe: '', taxRate: '', nol: '' });
  const setP = (k: keyof typeof pt) => (v: string) => setPt((p) => ({ ...p, [k]: v }));

  // Column end dates derive from the anchor FY end — one shared definition (data layer's).
  const ends = rows.map((_, i) => shiftYearEnd(anchorEnd, rows.length - 1 - i));
  const csym = CSYM[currency] ?? '$';

  const setCell = (i: number, k: keyof GridRow) => (v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addYear = () => setRows((rs) => (rs.length < 5 ? [emptyRow(), ...rs] : rs)); // older years prepend
  const dropYear = () => setRows((rs) => (rs.length > 1 ? rs.slice(1) : rs));

  // Derived net debt preview — shown (and locked) only when BOTH legs parse; the data layer
  // does the same derivation, so the two can never disagree.
  const g = parseCell(pt.grossDebt);
  const c = parseCell(pt.cash);
  const netDerived = g !== null && c !== null ? g - c : null;

  // Sizing pair completeness gates the submit (everything ELSE may stay blank → gaps).
  const anchorRow = rows[rows.length - 1];
  const sizingOk = basis === 'LTM'
    ? parseCell(ltm.revenue) !== null && parseCell(ltm.ebitda) !== null
    : parseCell(anchorRow.revenue) !== null && parseCell(anchorRow.ebitda) !== null;

  const ready = sizingOk && sector !== '' && dealName.trim() !== '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const years: ManualYearRow[] = rows.map((r, i) => ({
      end: ends[i],
      revenue: parseCell(r.revenue),
      ebitda: parseCell(r.ebitda),
      da: parseCell(r.da),
      capex: parseCell(r.capex),
    }));
    const taxPct = parseCell(pt.taxRate);
    const raw = manualHistoricals({
      dealName: dealName.trim(),
      sector,
      currency,
      basis,
      ltm: basis === 'LTM' && parseCell(ltm.revenue) !== null && parseCell(ltm.ebitda) !== null
        ? { asOf: ltmAsOf, revenue: parseCell(ltm.revenue)!, ebitda: parseCell(ltm.ebitda)! }
        : null,
      years,
      nwc: parseCell(pt.nwc),
      grossDebt: g,
      cash: c,
      netDebt: parseCell(pt.netDebt),
      netPpe: parseCell(pt.netPpe),
      taxRate: taxPct === null ? null : taxPct / 100,
      nol: parseCell(pt.nol),
    });
    loadFromHistoricals(raw);
  };

  const fyLabel = (end: string) => `FY${end.slice(0, 4)}`;
  const marginAt = (r: GridRow): string => {
    const rev = parseCell(r.revenue);
    const eb = parseCell(r.ebitda);
    return rev !== null && eb !== null && rev > 0 ? `${((eb / rev) * 100).toFixed(1)}%` : '–';
  };

  const cellIn = 'de-control de-num w-full min-w-[6rem] px-2 text-[14px] text-right text-[color:var(--de-input)] placeholder:text-[color:var(--de-ink-3)]';
  const waiting = dealName.trim() === '' ? 'Name the company to continue'
    : sector === '' ? 'Choose a sector to continue'
    : `Enter ${basis === 'LTM' ? 'LTM' : 'latest-FY'} revenue & EBITDA to continue`;

  return (
    <form onSubmit={submit} className="max-w-[60rem] mx-auto px-6 pt-10 pb-24">
      <button type="button" onClick={onBack} className="text-[13px] text-[color:var(--de-ink-2)] hover:text-[color:var(--de-ink)] mb-5">‹ Back to the ways in</button>
      <h1 className="de-display text-[44px] leading-[1.05]">Enter the facts</h1>
      <p className="text-[16px] text-[color:var(--de-ink-2)] mt-3 mb-8 max-w-[56ch]">
        Type the numbers from the CIM, the dataroom or management accounts. Blank cells stay blank: each shows as a gap to confirm on the next step, never as a default.
      </p>

      <div className="px-7 rounded-[14px] bg-[var(--de-surface)] border border-[color:var(--de-rule)]">
        <Block title="The company">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_15rem_auto] gap-4 items-end">
            <label className="block">
              <span className="block mb-1.5 text-[13px] text-[color:var(--de-ink-2)]">Company / Deal Name</span>
              <input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="Name of the company" className="de-control w-full px-3 text-[14px]" />
            </label>
            <div>
              <span className="block mb-1.5 text-[13px] text-[color:var(--de-ink-2)]">Sector</span>
              <Dropdown ariaLabel="Sector" align="left" className="w-full" value={sector} blank={sector === ''} placeholder="Choose a sector"
                options={SECTORS.map((x) => ({ value: x, label: x }))} onChange={setSector} />
            </div>
            <div>
              <span className="block mb-1.5 text-[13px] text-[color:var(--de-ink-2)]">Currency</span>
              <Dropdown ariaLabel="Currency" className="w-28" value={currency} options={CURRENCIES.map((cc) => ({ value: cc, label: cc }))} onChange={setCurrency} />
            </div>
          </div>
        </Block>

        <Block title={`Operating history (${csym}m per year)`} aside={
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-[13px] text-[color:var(--de-ink-2)]">Latest FY end <DateField ariaLabel="Latest FY end" value={anchorEnd} onChange={setAnchorEnd} /></span>
            <span className="inline-flex gap-1">
              <Button size="sm" onClick={addYear} disabled={rows.length >= 5}>+ Year</Button>
              <Button size="sm" onClick={dropYear} disabled={rows.length <= 1}>− Year</Button>
            </span>
          </span>
        }>
          <div className="de-scroll-x">
            <table className="w-full border-separate border-spacing-x-1.5 border-spacing-y-1">
              <thead>
                <tr>
                  <th />
                  {ends.map((end) => (
                    <th key={end} className="text-right font-normal pb-1 pr-2">
                      <span className="block text-[13px] font-semibold">{fyLabel(end)}</span>
                      <span className="de-num block text-[11px] text-[color:var(--de-ink-3)]">{end}</span>
                    </th>
                  ))}
                  {basis === 'LTM' && (
                    <th className="text-right font-normal pb-1 pr-2">
                      <span className="block text-[13px] font-semibold">LTM</span>
                      <span className="block text-[11px] text-[color:var(--de-ink-3)]">sizing basis</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {GRID_METRICS.map((m) => (
                  <tr key={m.key}>
                    <th scope="row" className="text-left font-normal text-[14px] pr-3 whitespace-nowrap">{m.label}</th>
                    {rows.map((r, i) => (
                      <td key={ends[i]}>
                        <input aria-label={`${m.label} ${fyLabel(ends[i])}`} value={r[m.key]} onChange={(e) => setCell(i, m.key)(e.target.value)} inputMode="decimal" className={cellIn} placeholder="–" />
                      </td>
                    ))}
                    {basis === 'LTM' && (
                      <td>
                        {m.ltm ? (
                          <input aria-label={`${m.label} LTM`} value={ltm[m.key as 'revenue' | 'ebitda']} onChange={(e) => setLtm((p) => ({ ...p, [m.key]: e.target.value }))} inputMode="decimal" className={cellIn} placeholder="–" />
                        ) : (
                          <span className="block text-right text-[12px] pr-2 text-[color:var(--de-ink-3)]" title="Operating rates always derive from the anchor fiscal year (§1.1)">n/a</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="text-left font-normal text-[13px] text-[color:var(--de-ink-3)] pr-3 whitespace-nowrap">Implied margin</th>
                  {rows.map((r, i) => <td key={ends[i]} className="de-num text-right text-[13px] text-[color:var(--de-ink-2)] pr-2 py-1">{marginAt(r)}</td>)}
                  {basis === 'LTM' && <td className="de-num text-right text-[13px] text-[color:var(--de-ink-2)] pr-2 py-1">{marginAt({ ...ltm, da: '', capex: '' })}</td>}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <span className="text-[14px]">Sizing figures are</span>
            <Segmented ariaLabel="Sizing basis" value={basis} onChange={setBasis} options={[{ value: 'FY', label: 'Latest FY' }, { value: 'LTM', label: 'LTM' }]} />
            {basis === 'LTM' && <span className="flex items-center gap-2 text-[13px] text-[color:var(--de-ink-2)]">LTM as of <DateField ariaLabel="LTM as of" value={ltmAsOf} onChange={setLtmAsOf} /></span>}
            <span className="text-[12px] text-[color:var(--de-ink-3)]">
              {basis === 'LTM' ? 'Leverage and entry EBITDA are sized on the LTM pair; D&A, capex and working-capital rates stay on the fiscal year (§1.1).' : 'Leverage and entry EBITDA are sized on the latest fiscal year.'}
            </span>
          </div>
        </Block>

        <Block title={`At entry (${csym}m unless noted)`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4">
            <Field label="Operating NWC" unit={`${csym}m`} value={pt.nwc} onChange={setP('nwc')} placeholder="blank = gap" />
            <Field label="Gross Debt" unit={`${csym}m`} value={pt.grossDebt} onChange={setP('grossDebt')} placeholder="blank = gap" />
            <Field label="Cash" unit={`${csym}m`} value={pt.cash} onChange={setP('cash')} placeholder="blank = gap" />
            {netDerived !== null ? (
              <Field label="Net Debt (derived)" unit="gross − cash" value={netDerived.toFixed(1)} onChange={() => undefined} disabled />
            ) : (
              <Field label="Net Debt" unit={`${csym}m`} value={pt.netDebt} onChange={setP('netDebt')} placeholder="or gross and cash" />
            )}
            <Field label="Net PP&E" unit={`${csym}m`} value={pt.netPpe} onChange={setP('netPpe')} placeholder="blank = gap" />
            <Field label="Effective Tax Rate" unit="%" value={pt.taxRate} onChange={setP('taxRate')} placeholder="blank = gap" />
            <Field label="NOL Carryforward" unit={`${csym}m`} value={pt.nol} onChange={setP('nol')} placeholder="blank = none" />
          </div>
          <p className="mt-4 text-[12px] text-[color:var(--de-ink-3)]">Blank cells stay blank. Net debt locks to gross less cash when both are entered.</p>
          <Button type="submit" variant="primary" disabled={!ready} className="w-full mt-5">
            {ready ? 'Continue with these figures' : waiting}
          </Button>
        </Block>

        {/* §24.2 [v2.0.0] — a case that states NO historical year (a course case, a CIM forecast
            page, a lender model): every operating line is entered directly on the next screen.
            No LTM figure is invented to make the form validate. */}
        <Block title="No historical figures?">
          <p className="text-[14px] text-[color:var(--de-ink-2)] mb-3 max-w-[64ch]">
            Start a forecast-only case. You enter EBIT or EBITDA, D&amp;A, capex and working capital by year on the next step, exactly as the case gives them.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="de-control inline-flex items-center w-36">
              <input aria-label="Holding period (years)" value={forecastHold} onChange={(e) => setForecastHold(e.target.value)} placeholder="holding period" inputMode="numeric"
                className="de-num min-w-0 w-full h-full bg-transparent outline-none text-right text-[14px] text-[color:var(--de-input)] pl-2 pr-1 placeholder:text-[12px] placeholder:text-[color:var(--de-ink-3)]" />
              <span className="pr-2 text-[12px] text-[color:var(--de-ink-3)]">yrs</span>
            </span>
            <Button
              disabled={!(Number.isInteger(Number(forecastHold)) && Number(forecastHold) >= 1) || dealName.trim() === ''}
              onClick={() => startForecastOnly({ entity_name: dealName.trim(), currency, hold_years: Number(forecastHold) })}>
              Start forecast-only case
            </Button>
            {dealName.trim() === '' && <span className="text-[12px] text-[color:var(--de-ink-3)]">Name the company first.</span>}
          </div>
        </Block>
      </div>
    </form>
  );
};

export default ManualFactsScreen;
