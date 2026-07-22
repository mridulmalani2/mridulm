/**
 * lib/edgar/history.ts — multi-year history builder (PHASE_D §D1, the reliability core).
 *
 * companyfacts is NOT a clean time series; this module makes it one, under the extraction
 * reliability rules the data review demanded:
 *  1. Alias chains resolve PER PERIOD, not once per concept — filers switch tags
 *     mid-history (ASC-606: Revenues ↔ RevenueFromContractWithCustomer…). The tag used is
 *     recorded per point; a point whose tag differs from the anchor year's is flagged.
 *  2. Restatements dedupe by exact (start, end): the LATEST `filed` vintage wins; a
 *     provenance note is emitted when |restated − original| > 1%.
 *  3. Periods key on END DATES only — `fy`/`fp` describe the FILING, not the fact's
 *     period (a FY2022 comparative inside a FY2024 10-K carries fy=2024). Never fy/fp.
 *  4. CAGRs run over TRUE date spans (÷365.25), never row counts — fiscal-year changes
 *     leave holes. A history-based suggestion basis needs ≥ MIN_HISTORY_POINTS usable
 *     full-year points of that SPECIFIC metric; callers gate on `usablePoints`.
 *  5. Degradation: per-period gaps stay gaps (the review table renders empty cells);
 *     partial components never combine into a fake total — derived series (EBITDA)
 *     exist only at periods where EVERY component resolves.
 *
 * Only full-year durations (350–380 days) enter duration series — a fiscal-year-change
 * transition stub is excluded and leaves a hole, which downstream spans handle honestly.
 */

import type { CompanyFacts, XbrlConcept, XbrlFactValue } from './client';

export interface HistoryPoint {
  /** Period END date (YYYY-MM-DD) — the series key (rule 3). */
  end: string;
  /** Period start for durations; null for instants. */
  start: string | null;
  /** Value in the engine's millions unit. */
  value: number;
  /** Tag that resolved THIS period (rule 1). */
  tag: string;
  /** Filing vintage that won the (start, end) group (rule 2). */
  filed: string | null;
  form: string | null;
  /** Set when the winning vintage differs from the originally-filed value by > 1%. */
  restated_note?: string;
  /** Set when this period resolved from a different tag than the anchor (latest) period. */
  tag_differs_from_anchor?: boolean;
}

export interface HistorySeries {
  metric: string;
  /** Ascending by `end`; one point per period end; holes are simply absent ends. */
  points: HistoryPoint[];
  /** Tag of the latest (anchor) point — the reference for rule-1 flags. */
  anchor_tag: string | null;
  /** Currency unit shared by every point (single-unit rule; mixed-unit periods are dropped). */
  unit: string | null;
  /** Per-period notes: restatements, tag switches, dropped mixed-unit periods. */
  notes: string[];
}

/** ≥ this many usable full-year points of a metric ⇒ a SUGGESTED(history) basis is allowed. */
export const MIN_HISTORY_POINTS = 3;

const DAY_MS = 86_400_000;
const isFullYearSpan = (start: string, end: string): boolean => {
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS;
  return days >= 350 && days <= 380;
};

interface BuildOptions {
  kind: 'duration' | 'instant';
  taxonomy?: string;
  /** Divide raw XBRL absolute values by this to reach millions. Default 1e6. */
  unitScale?: number;
  /** Keep at most this many latest periods. Default 8. */
  maxYears?: number;
  /** Restrict to this currency unit; default = the unit of the latest resolvable fact. */
  unit?: string;
}

const NON_CURRENCY_UNITS = new Set(['shares', 'USD/shares', 'pure']);

function factsForUnit(concept: XbrlConcept, unit: string): XbrlFactValue[] {
  return concept.units?.[unit] ?? [];
}

function availableCurrencies(concept: XbrlConcept): string[] {
  return Object.keys(concept.units ?? {}).filter((u) => !NON_CURRENCY_UNITS.has(u));
}

/**
 * Group a tag's facts by exact (start,end), keep the latest `filed` vintage per group
 * (rule 2), and note >1% restatements vs the ORIGINAL (earliest-filed) value.
 */
function dedupeVintages(
  facts: XbrlFactValue[],
  kind: 'duration' | 'instant',
): Map<string, { winner: XbrlFactValue; restatedNote?: string }> {
  const groups = new Map<string, XbrlFactValue[]>();
  for (const f of facts) {
    if (!f.end) continue;
    if (kind === 'duration') {
      if (!f.start || !isFullYearSpan(f.start, f.end)) continue; // stubs excluded (rule 5)
    }
    const key = kind === 'duration' ? `${f.start}|${f.end}` : f.end;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  const out = new Map<string, { winner: XbrlFactValue; restatedNote?: string }>();
  for (const [key, g] of groups) {
    const byFiled = [...g].sort((a, b) => String(a.filed ?? '').localeCompare(String(b.filed ?? '')));
    const original = byFiled[0];
    const winner = byFiled[byFiled.length - 1];
    let restatedNote: string | undefined;
    if (
      winner !== original &&
      original.val !== 0 &&
      Math.abs((winner.val - original.val) / original.val) > 0.01
    ) {
      restatedNote = `restated: ${original.val} (filed ${original.filed ?? '—'}) → ${winner.val} (filed ${winner.filed ?? '—'})`;
    }
    out.set(key, { winner, restatedNote });
  }
  return out;
}

/**
 * Build one metric's annual series from an alias chain, resolving PER PERIOD (rule 1).
 */
export function buildAnnualSeries(
  facts: CompanyFacts,
  metric: string,
  aliasTags: string[],
  opts: BuildOptions,
): HistorySeries {
  const taxonomy = opts.taxonomy ?? 'us-gaap';
  const scale = opts.unitScale ?? 1e6;
  const maxYears = opts.maxYears ?? 8;
  const space = facts.facts?.[taxonomy] ?? {};
  const notes: string[] = [];

  // Single-unit rule: the unit of the latest fact of the FIRST tag that has any currency
  // facts (or the caller's override). Mixed-unit filers: other-unit periods are dropped
  // with a note, never silently converted.
  let unit = opts.unit ?? null;
  if (!unit) {
    outer: for (const tag of aliasTags) {
      const c = space[tag];
      if (!c) continue;
      for (const u of availableCurrencies(c)) {
        const fs = factsForUnit(c, u);
        if (fs.length) {
          const latestPerUnit = availableCurrencies(c)
            .map((uu) => ({ uu, latest: factsForUnit(c, uu).reduce((a, b) => (String(a.end) > String(b.end) ? a : b), factsForUnit(c, uu)[0]) }))
            .filter((x) => x.latest);
          latestPerUnit.sort((a, b) => String(a.latest.end).localeCompare(String(b.latest.end)));
          unit = latestPerUnit[latestPerUnit.length - 1].uu;
          break outer;
        }
      }
    }
  }
  if (!unit) return { metric, points: [], anchor_tag: null, unit: null, notes };

  // Per-tag vintage-deduped period maps (rule 2), keyed by END date for resolution.
  const perTag = aliasTags.map((tag) => {
    const c = space[tag];
    const deduped = c ? dedupeVintages(factsForUnit(c, unit!), opts.kind) : new Map<string, { winner: XbrlFactValue; restatedNote?: string }>();
    const byEnd = new Map<string, { winner: XbrlFactValue; restatedNote?: string }>();
    for (const v of deduped.values()) {
      const existing = byEnd.get(v.winner.end);
      // Two different (start,end) groups sharing an end (shouldn't happen for full-year
      // durations) — keep the latest filed.
      if (!existing || String(v.winner.filed ?? '') > String(existing.winner.filed ?? '')) {
        byEnd.set(v.winner.end, v);
      }
    }
    return { tag, byEnd };
  });

  // Union of period ends; per-period alias resolution: first tag in the chain wins (rule 1).
  const allEnds = new Set<string>();
  for (const { byEnd } of perTag) for (const end of byEnd.keys()) allEnds.add(end);
  const ends = [...allEnds].sort();
  const kept = ends.slice(-maxYears);
  if (ends.length > kept.length) {
    notes.push(`history truncated to the latest ${maxYears} periods (${ends.length} available)`);
  }

  const points: HistoryPoint[] = [];
  for (const end of kept) {
    for (const { tag, byEnd } of perTag) {
      const hit = byEnd.get(end);
      if (!hit) continue;
      const f = hit.winner;
      const p: HistoryPoint = {
        end,
        start: opts.kind === 'duration' ? (f.start ?? null) : null,
        value: f.val / scale,
        tag,
        filed: f.filed ?? null,
        form: f.form ?? null,
      };
      if (hit.restatedNote) {
        p.restated_note = hit.restatedNote;
        notes.push(`${metric} @ ${end}: ${hit.restatedNote}`);
      }
      points.push(p);
      break;
    }
  }

  const anchorTag = points.length ? points[points.length - 1].tag : null;
  for (const p of points) {
    if (anchorTag && p.tag !== anchorTag) {
      p.tag_differs_from_anchor = true;
      notes.push(`${metric} @ ${p.end}: tag ${p.tag} differs from anchor ${anchorTag}`);
    }
  }
  return { metric, points, anchor_tag: anchorTag, unit, notes };
}

/**
 * Derive a series from components that must ALL resolve at a period (rule 5 — no fake
 * totals): e.g. EBITDA = operating income + D&A only where both exist for that end date.
 */
export function deriveSeries(
  metric: string,
  components: HistorySeries[],
  combine: (values: number[]) => number,
): HistorySeries {
  if (!components.length) return { metric, points: [], anchor_tag: null, unit: null, notes: [] };
  const units = new Set(components.map((c) => c.unit).filter(Boolean));
  if (units.size > 1) {
    return { metric, points: [], anchor_tag: null, unit: null, notes: [`${metric}: mixed component units (${[...units].join(', ')}) — not derived`] };
  }
  const ends = components[0].points.map((p) => p.end);
  const points: HistoryPoint[] = [];
  for (const end of ends) {
    const rows = components.map((c) => c.points.find((p) => p.end === end));
    if (rows.some((r) => !r)) continue; // a missing component leaves a hole, never a fake total
    const first = rows[0]!;
    points.push({
      end,
      start: first.start,
      value: combine(rows.map((r) => r!.value)),
      tag: `derived:${rows.map((r) => r!.tag).join('+')}`,
      filed: first.filed,
      form: first.form,
    });
  }
  return {
    metric,
    points,
    anchor_tag: points.length ? points[points.length - 1].tag : null,
    unit: components[0].unit,
    notes: components.flatMap((c) => c.notes),
  };
}

/** Usable full-year point count — the ≥3 gate for a SUGGESTED(history) basis (rule 4). */
export function usablePoints(series: HistorySeries): number {
  return series.points.length;
}

/**
 * CAGR over the TRUE date span between the first and last points (rule 4):
 * (last/first)^(365.25 / span-days) − 1. Null when < MIN_HISTORY_POINTS points or a
 * non-positive endpoint (a sign flip has no geometric growth rate).
 */
export function cagrOverTrueSpan(series: HistorySeries): number | null {
  const pts = series.points;
  if (pts.length < MIN_HISTORY_POINTS) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.value <= 0 || last.value <= 0) return null;
  const spanDays = (Date.parse(last.end) - Date.parse(first.end)) / DAY_MS;
  if (spanDays < 350) return null;
  return Math.pow(last.value / first.value, 365.25 / spanDays) - 1;
}

/**
 * Year-over-year growth pairs — only across CONSECUTIVE year ends (335–395 days apart);
 * a fiscal-year-change hole yields no pair, never a fabricated bridge (rule 4).
 */
export function yoyGrowths(series: HistorySeries): { from: string; to: string; growth: number }[] {
  const out: { from: string; to: string; growth: number }[] = [];
  const pts = series.points;
  for (let i = 1; i < pts.length; i++) {
    const gapDays = (Date.parse(pts[i].end) - Date.parse(pts[i - 1].end)) / DAY_MS;
    if (gapDays < 335 || gapDays > 395) continue;
    if (pts[i - 1].value === 0) continue;
    out.push({ from: pts[i - 1].end, to: pts[i].end, growth: pts[i].value / pts[i - 1].value - 1 });
  }
  return out;
}

/**
 * Ratio series (e.g. margin = EBITDA/revenue per year) — defined only at ends where both
 * resolve and the denominator is nonzero.
 */
export function ratioSeries(metric: string, numerator: HistorySeries, denominator: HistorySeries): HistorySeries {
  const points = numerator.points
    .map((np) => {
      const dp = denominator.points.find((p) => p.end === np.end);
      if (!dp || dp.value === 0) return null;
      return { ...np, value: np.value / dp.value, tag: `ratio:${np.tag}/${dp.tag}` };
    })
    .filter((p): p is HistoryPoint => p !== null);
  return { metric, points, anchor_tag: null, unit: 'pure', notes: [] };
}
