/**
 * lib/edgar/ltmStitch.ts — SPEC §1.1 quarter-stitched LTM sizing basis (Phase G-2, Tier B).
 *
 * DATA-SIDE: computes the most-current trailing-twelve-months revenue and EBITDA from companyfacts,
 * or falls back to the latest complete fiscal year with a staleness badge — the figure `factsAdapter`
 * writes into `DealFacts.fy_revenue`/`fy_ebitda`. The ENGINE is untouched (it consumes one number the
 * same way). This is the production port of the adjudicated reference `scripts/goldens/ltm_stitch.py`;
 * both are held to the GOSPEL fixtures `tests/goldens/g2ltm/(i)-(ix)` by `tests/edgar-ltm-stitch.test.ts`.
 *
 *   LTM(M) = FY(M) + YTD_current(M) − YTD_prior(M)                       [§1.1 normative]
 *   EBITDA stitches PER COMPONENT: LTM EBITDA = LTM(OperInc) + LTM(D&A)  [§1.1]
 *
 * Refusal gates → FY fallback (each disclosed): F1 abutment (FY.end+1d = cur.start), F7 52/53-week
 * (|Δspan| ≤ 7d accept-with-disclosure, >7d refuse), F3/M1 vintage (prior-YTD needs ≥2 filed vintages
 * AND no >1% restatement on any span), F5 component completeness, F4 single-basis pair (either side
 * refuses ⇒ BOTH → FY). FPI/annual-only (no interim) ⇒ FY + badge.
 */
import type { CompanyFacts, XbrlFactValue } from './client';

export type StitchBasis = 'ltm_stitched' | 'fy' | 'missing';
export type StalenessBadge = 'fresh' | 'aging' | 'stale';

export interface StitchMetric {
  basis: StitchBasis;
  value: number | null;
  as_of: string | null;
}
export interface StitchResult {
  stitched: boolean;
  revenue: StitchMetric;
  ebitda: StitchMetric;
  refusal_reason: string | null;
  badge: StalenessBadge | null;
  notes: string[];
}

const DAY = 86_400_000;
const spanDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const plus1d = (s: string) => new Date(Date.parse(s) + DAY).toISOString().slice(0, 10);
const ageMonths = (asOf: string, importDate: string) => spanDays(asOf, importDate) / 30.44;
const r2 = (x: number | null): number | null => (x === null ? null : Math.round((x + Number.EPSILON) * 100) / 100);

// §1.1 widened day-count windows (52/53-week + FYE changes)
const WINDOWS: [string, number, number][] = [['full_year', 350, 380], ['9m', 250, 285], ['6m', 165, 200], ['quarter', 80, 100]];
function classify(start: string | undefined, end: string): string | null {
  if (!start) return null;
  const n = spanDays(start, end);
  for (const [role, lo, hi] of WINDOWS) if (n >= lo && n <= hi) return role;
  return null; // a span in no window is a HOLE (honestly unused)
}

// §1.1 staleness badge (filing-overdue cadence)
function badge(asOf: string, importDate: string): StalenessBadge {
  const a = ageMonths(asOf, importDate);
  if (a <= 4.5) return 'fresh';
  if (a <= 14.5) return 'aging';
  return 'stale';
}

interface Point { start: string | undefined; end: string; val: number; filed: string | null; tag: string; note: string | null; vintage_count: number; }
type PointMap = Map<string, Point>;
const key = (start: string | undefined, end: string) => `${start ?? ''}|${end}`;

// history.ts rule 2 (restatement dedupe), reproduced independently: within ONE (start,end) group of a
// single tag, the latest `filed` wins; >1% note vs the EARLIEST filed; vintage_count = how many filings
// reported it — the M1 vintage-PRESENCE input.
function dedupeGroup(g: XbrlFactValue[], tag: string): Point {
  const sorted = [...g].sort((a, b) => String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
  const original = sorted[0], winner = sorted[sorted.length - 1];
  let note: string | null = null;
  if (original.val !== 0 && Math.abs((winner.val - original.val) / original.val) > 0.01) {
    note = `restated: ${original.val} (filed ${original.filed ?? '—'}) -> ${winner.val} (filed ${winner.filed ?? '—'})`;
  }
  return { start: winner.start, end: winner.end, val: winner.val, filed: winner.filed ?? null, tag, note, vintage_count: g.length };
}

// Resolve a metric across a TAG-PRIORITY list (history.ts rule 1: tags resolve PER PERIOD). For each
// (start,end), the FIRST tag in `tagList` that reports it wins; its vintages are then deduped. A single
// canonical tag (the goldens) is the degenerate case. This is what makes the stitch work on real filers
// (Apple's revenue is RevenueFromContractWithCustomer…, not Revenues).
function tagPoints(facts: CompanyFacts, taxonomy: string, tagList: string[], unit = 'USD'): PointMap {
  const perKey = new Map<string, { tag: string; facts: XbrlFactValue[] }>();
  for (const tag of tagList) {
    const arr = facts.facts?.[taxonomy]?.[tag]?.units?.[unit] ?? [];
    for (const f of arr) {
      const k = key(f.start, f.end);
      const existing = perKey.get(k);
      if (!existing) perKey.set(k, { tag, facts: [f] });
      else if (existing.tag === tag) existing.facts.push(f); // same winning tag → another vintage
      // else: a higher-priority tag already claimed this period → ignore the lower-priority tag
    }
  }
  const out: PointMap = new Map();
  for (const [k, { tag, facts: g }] of perKey) out.set(k, dedupeGroup(g, tag));
  return out;
}

interface Keys { fy: [string | undefined, string]; cur?: [string | undefined, string]; prior?: [string | undefined, string]; }
type Status = 'ok' | 'fpi' | 'no_prior' | 'no_fy';

function canonicalSpans(rev: PointMap, oi: PointMap, da: PointMap): [Status, Keys | null] {
  const all = [...rev.values(), ...oi.values(), ...da.values()];
  const interims = all.filter((p) => ['9m', '6m', 'quarter'].includes(classify(p.start, p.end) ?? ''));
  const fulls = all.filter((p) => classify(p.start, p.end) === 'full_year');
  if (!fulls.length) return ['no_fy', null];
  const fyP = fulls.reduce((a, b) => (a.end > b.end ? a : b));
  if (!interims.length) return ['fpi', { fy: [fyP.start, fyP.end] }];
  const e = interims.reduce((a, b) => (a.end > b.end ? a : b)).end;
  const curP = interims.find((p) => p.end === e)!;
  const role = classify(curP.start, curP.end);
  const [y, m, dd] = e.split('-').map(Number);
  const target = Date.parse(`${y - 1}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  const priors = interims.filter((p) => classify(p.start, p.end) === role && p.end !== e);
  if (!priors.length) return ['no_prior', { fy: [fyP.start, fyP.end] }];
  const priorP = priors.reduce((a, b) => (Math.abs(Date.parse(a.end) - target) <= Math.abs(Date.parse(b.end) - target) ? a : b));
  return ['ok', { fy: [fyP.start, fyP.end], cur: [curP.start, curP.end], prior: [priorP.start, priorP.end] }];
}

const at = (pts: PointMap, k: [string | undefined, string]) => pts.get(key(k[0], k[1])) ?? null;
function ltmAt(pts: PointMap, k: Keys): number | null {
  const fy = at(pts, k.fy), cur = at(pts, k.cur!), pr = at(pts, k.prior!);
  return fy && cur && pr ? fy.val + cur.val - pr.val : null;
}
const fyVal = (pts: PointMap, k: Keys) => at(pts, k.fy)?.val ?? null;

function makeResult(stitched: boolean, revenue: StitchMetric, ebitda: StitchMetric, reason: string | null, bdg: StalenessBadge | null, notes: string[]): StitchResult {
  return { stitched, revenue, ebitda, refusal_reason: stitched ? null : reason, badge: bdg, notes: [...new Set(notes)].sort() };
}

/** Tag-priority lists per sizing metric (history.ts rule 1). Defaults are the canonical goldens tags;
 *  mapXbrl passes its fuller fallback lists so the stitch works on real filers. */
export interface StitchTags { taxonomy: string; revenue: string[]; operatingIncome: string[]; da: string[]; }
export const DEFAULT_STITCH_TAGS: StitchTags = {
  taxonomy: 'us-gaap', revenue: ['Revenues'], operatingIncome: ['OperatingIncomeLoss'], da: ['DepreciationDepletionAndAmortization'],
};

export function stitchLtm(facts: CompanyFacts, importDate: string, tags: StitchTags = DEFAULT_STITCH_TAGS): StitchResult {
  const rev = tagPoints(facts, tags.taxonomy, tags.revenue);
  const oi = tagPoints(facts, tags.taxonomy, tags.operatingIncome);
  const da = tagPoints(facts, tags.taxonomy, tags.da);

  const [status, k] = canonicalSpans(rev, oi, da);

  const fyFallback = (reason: string, keys: Keys): StitchResult => {
    const rv = fyVal(rev, keys);
    const oiv = fyVal(oi, keys), dav = fyVal(da, keys);
    const eb = oiv !== null && dav !== null ? r2(oiv + dav) : null;
    const asOf = keys.fy[1];
    return makeResult(false, { basis: 'fy', value: r2(rv), as_of: asOf }, { basis: 'fy', value: eb, as_of: asOf }, reason, badge(asOf, importDate), []);
  };

  if (status === 'no_fy' || k === null) {
    return makeResult(false, { basis: 'missing', value: null, as_of: null }, { basis: 'missing', value: null, as_of: null }, 'no full year present', null, []);
  }
  if (status === 'fpi') return fyFallback('no interim filings (annual-only)', k);
  if (status === 'no_prior') return fyFallback('no prior-year comparative of the same role', k);

  // ── whole-stitch gates: any failure ⇒ BOTH revenue & EBITDA fall to FY ──
  if (plus1d(k.fy[1]) !== k.cur![0]) return fyFallback('FY not adjacent to current partial (fiscal-year-end change)', k);
  const dspan = Math.abs(spanDays(k.cur![0]!, k.cur![1]) - spanDays(k.prior![0]!, k.prior![1]));
  if (dspan > 7) return fyFallback(`YTD span mismatch ${dspan}d > 7d (not a 53rd-week case)`, k);
  for (const [pts] of [[rev], [oi], [da]] as [PointMap][]) {
    const pr = at(pts, k.prior!);
    if (pr && pr.vintage_count < 2) return fyFallback('prior-YTD single vintage — restatement check un-evaluable (fail-closed)', k);
  }
  for (const [pts, nm] of [[rev, 'Revenue'], [oi, 'OperInc'], [da, 'D&A']] as [PointMap, string][]) {
    for (const [spanName, kk] of [['FY', k.fy], ['YTD_current', k.cur!], ['YTD_prior', k.prior!]] as [string, [string | undefined, string]][]) {
      const p = at(pts, kk);
      if (p && p.note) return fyFallback(`${nm} ${spanName} restated >1% vs original — cross-vintage basis mix (${p.note})`, k);
    }
  }

  // ── availability on the canonical spans ──
  const revLtm = ltmAt(rev, k);
  const oiLtm = ltmAt(oi, k), daLtm = ltmAt(da, k);
  const revOk = revLtm !== null;
  const ebdOk = oiLtm !== null && daLtm !== null;
  if (!(revOk && ebdOk)) {
    if (!ebdOk) {
      const miss = daLtm === null ? 'D&A' : 'OperInc';
      return fyFallback(`EBITDA component ${miss} absent on a canonical span ⇒ single-basis pair fallback`, k);
    }
    return fyFallback('revenue not resolvable on the canonical spans ⇒ single-basis pair fallback', k);
  }

  const notes = dspan === 7 ? ['<=1-week 52/53 approximation disclosed'] : [];
  const asOf = k.cur![1];
  return makeResult(true, { basis: 'ltm_stitched', value: r2(revLtm), as_of: asOf }, { basis: 'ltm_stitched', value: r2(oiLtm! + daLtm!), as_of: asOf }, null, badge(asOf, importDate), notes);
}
