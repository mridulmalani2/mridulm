/**
 * lib/edgar/ixbrl.ts — the in-browser uploaded-filing iXBRL parser (IXBRL_SPEC v1 r4,
 * hostile sign-off GRANTED @ fb8021e). A user drops an ANNUAL filing (SEC 10-K/20-F .htm,
 * UK Companies House accounts .xhtml, ESEF .zip package) and gets the SAME RawHistoricals
 * the fetch routes produce, through the SAME adjudicated mappers — everything parsed in the
 * browser (a private target's accounts never leave the machine).
 *
 * The TS implementation here is held to the SAME gospel as the independent Python reference
 * (`scripts/goldens/ixbrl_ref.py`): tests/edgar-ixbrl.test.ts compares this parser's output
 * to tests/fixtures/ixbrl/expected/*.json (adjudicated per DERIVATION.md), and the CI
 * regeneration gate re-runs the reference. Every rule below cites its IXBRL_SPEC section.
 */

import { unzipSync } from 'fflate';
import type { CompanyFacts, XbrlFactValue } from './client';
import { mapCompanyFacts } from './mapXbrl';
import { mapIfrsReport } from './mapIfrs';
import type { XbrlJsonFact, XbrlJsonReport } from './esef';
import type { RawHistoricals, SourcedValue } from './types';

// ── §1c transform registry: (registry namespace, exact local name) ──────────
const TR1 = 'http://www.xbrl.org/2008/inlineXBRL/transformation';
const TR2 = 'http://www.xbrl.org/inlineXBRL/transformation/2011-07-31';
const TR3 = 'http://www.xbrl.org/inlineXBRL/transformation/2015-02-26';
const TR4 = 'http://www.xbrl.org/inlineXBRL/transformation/2020-02-12';
const TR5 = 'http://www.xbrl.org/inlineXBRL/transformation/2022-02-16';
type NumKind = 'dot' | 'comma' | 'zero';
const NUMERIC_TRANSFORMS = new Map<string, NumKind>([
  [`${TR1}|numcommadot`, 'dot'], [`${TR1}|numdotcomma`, 'comma'], [`${TR1}|numdash`, 'zero'],
  [`${TR2}|numdotdecimal`, 'dot'], [`${TR2}|numcommadecimal`, 'comma'], [`${TR2}|zerodash`, 'zero'],
  [`${TR3}|numdotdecimal`, 'dot'], [`${TR3}|numcommadecimal`, 'comma'], [`${TR3}|zerodash`, 'zero'],
  [`${TR4}|num-dot-decimal`, 'dot'], [`${TR4}|num-comma-decimal`, 'comma'], [`${TR4}|fixed-zero`, 'zero'],
  [`${TR5}|num-dot-decimal`, 'dot'], [`${TR5}|num-comma-decimal`, 'comma'], [`${TR5}|fixed-zero`, 'zero'],
]);
// §1d identity date transforms (nonNumeric reads only)
const DATE_TRANSFORMS = new Set([
  `${TR2}|datedaymonthyearen`, `${TR2}|datedaymonthyear`,
  `${TR3}|datedaymonthyearen`, `${TR3}|datedaymonthyear`,
  `${TR4}|date-day-month-year`, `${TR5}|date-day-month-year`,
]);
const IX_URIS = new Set(['http://www.xbrl.org/2008/inlineXBRL', 'http://www.xbrl.org/2013/inlineXBRL']);
const XBRLI = 'http://www.xbrl.org/2003/instance';
const XBRLDI = 'http://xbrl.org/2006/xbrldi';
// §1c canonical prefixes for known namespace families
const CANONICAL: [string, string][] = [
  ['http://fasb.org/us-gaap', 'us-gaap'], ['http://xbrl.ifrs.org/taxonomy', 'ifrs-full'],
  ['http://xbrl.sec.gov/dei', 'dei'], ['http://fasb.org/srt', 'srt'], ['http://xbrl.sec.gov/country', 'country'],
];
const SPACES = ' \u00a0\u2009\u202f\t'; // §1c: space, NBSP, thin, narrow-NBSP, tab
const MONTHS: Record<string, number> = {};
['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  .forEach((m, i) => { MONTHS[m] = i + 1; MONTHS[m.slice(0, 3)] = i + 1; });

const IDENTITY_NAME = new Set(['dei:EntityRegistrantName', 'uk-bus:EntityCurrentLegalOrRegisteredName',
  'ifrs-full:NameOfReportingEntityOrOtherMeansOfIdentification']);
const IDENTITY_META: Record<string, keyof UploadIdentity> = {
  'dei:DocumentType': 'docType', 'dei:DocumentFiscalYearFocus': 'fy',
  'dei:DocumentFiscalPeriodFocus': 'fp', 'dei:DocumentPeriodEndDate': 'periodEnd',
};
const IDENTITY_DATES: Record<string, keyof UploadIdentity> = {
  'uk-bus:BalanceSheetDate': 'balanceSheetDate', 'uk-bus:EndDateForPeriodCoveredByReport': 'endDateForPeriod',
};

export interface UploadIdentity {
  name?: string; docType?: string; fy?: string; fp?: string; periodEnd?: string;
  balanceSheetDate?: string; endDateForPeriod?: string;
}
export interface ParsedFact {
  concept: string; period: string; unit: string;
  dims: Record<string, string>; value: number; decimals: number | null; file: string;
}
export interface ParsedUpload {
  facts: ParsedFact[]; notes: string[]; identity: UploadIdentity;
  routing: 'us-gaap' | 'oim'; modalCurrency: string | null;
  namespaces: Record<string, string>;
}

// ── number/date parsing: EXACTLY the reference's semantics ───────────────────
const NUM_SIGNED = /^[-−]?\d+(\.\d+)?$/;
const NUM_UNSIGNED = /^\d+(\.\d+)?$/; // M5: registry grammars admit no sign character
function parseNumber(kind: NumKind | null, text: string): number | null {
  let t = text.trim();
  if (kind === 'zero') return 0;
  if (kind === 'dot') t = t.replace(new RegExp(`[${SPACES},]`, 'g'), '');
  else if (kind === 'comma') t = t.replace(new RegExp(`[${SPACES}.]`, 'g'), '').replace(/,/g, '.');
  if (!(kind === null ? NUM_SIGNED : NUM_UNSIGNED).test(t)) return null;
  return parseFloat(t.replace('−', '-'));
}
function parseDate(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/); // "31 December 2023"
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3].padStart(4, '0')}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); // numeric d-m-y
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
/** §1e HALF-AWAY-FROM-ZERO at 10^decimals — pinned so TS ≡ the Python reference. */
const roundHalfAway = (x: number, decimals: number): number => {
  const s = Math.pow(10, decimals);
  return (Math.sign(x) || 1) * Math.floor(Math.abs(x) * s + 0.5) / s;
};
/** Python-repr float formatting for note strings (the gospel notes carry repr floats). */
const pyFloat = (x: number): string => (Number.isInteger(x) ? `${x}.0` : String(x));

// ── per-document parse (§1) ──────────────────────────────────────────────────
interface DocScan {
  nsmap: Record<string, string>;
  contexts: Map<string, { period: string; dims: Record<string, string> }>;
  units: Map<string, string>;
}

function parseDom(text: string): Document {
  const dom = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (dom.getElementsByTagName('parsererror').length === 0) return dom;
  return new DOMParser().parseFromString(text, 'text/html'); // CH files are occasionally lax
}

const lower = (s: string) => s.toLowerCase();

function collectNs(doc: Document): Record<string, string> {
  const nsmap: Record<string, string> = {};
  const walk = (el: Element) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (a.name.startsWith('xmlns:')) nsmap[a.name.slice(6)] = a.value;
      else if (a.name === 'xmlns') nsmap[''] = a.value;
    }
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) walk(c);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return nsmap;
}

function canonicalPrefix(uri: string, docPrefix: string): string {
  for (const [base, pfx] of CANONICAL) if (uri.startsWith(base)) return pfx;
  return docPrefix;
}

function textMinusExclude(el: Element, excludeTags: Set<string>): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.textContent ?? '';
    else if (n.nodeType === 1) {
      const child = n as Element;
      if (excludeTags.has(lower(child.tagName))) return; // ix:exclude subtree removed (§1c)
      out += textMinusExclude(child, excludeTags);
    }
  });
  return out;
}

function parseOneDocument(text: string, filename: string, out: {
  facts: ParsedFact[]; notes: string[]; identity: UploadIdentity; namespaces: Record<string, string>;
  entities: Set<string>;
}): void {
  const doc = parseDom(text);
  const nsmap = collectNs(doc);
  Object.assign(out.namespaces, nsmap);
  const prefixesFor = (pred: (uri: string) => boolean) =>
    Object.entries(nsmap).filter(([, u]) => pred(u)).map(([p]) => p);
  const tagSet = (prefixes: string[], local: string) => new Set(prefixes.map((p) => lower(p ? `${p}:${local}` : local)));
  const ixPfx = prefixesFor((u) => IX_URIS.has(u));
  const xbrliPfx = prefixesFor((u) => u === XBRLI);
  const xbrldiPfx = prefixesFor((u) => u === XBRLDI);
  const T = {
    nonFraction: tagSet(ixPfx, 'nonFraction'), nonNumeric: tagSet(ixPfx, 'nonNumeric'),
    exclude: tagSet(ixPfx, 'exclude'), context: tagSet(xbrliPfx, 'context'), unit: tagSet(xbrliPfx, 'unit'),
    startDate: tagSet(xbrliPfx, 'startDate'), endDate: tagSet(xbrliPfx, 'endDate'),
    instant: tagSet(xbrliPfx, 'instant'), measure: tagSet(xbrliPfx, 'measure'),
    explicitMember: tagSet(xbrldiPfx, 'explicitMember'),
    typedMember: tagSet(xbrldiPfx, 'typedMember'),
    identifier: tagSet(xbrliPfx, 'identifier'),
  };
  const qname = (pfxname: string): string => {
    const i = pfxname.indexOf(':');
    if (i < 0) return pfxname;
    const pfx = pfxname.slice(0, i);
    return `${canonicalPrefix(nsmap[pfx] ?? '', pfx)}:${pfxname.slice(i + 1)}`;
  };

  const all = Array.from(doc.getElementsByTagName('*'));
  const scan: DocScan = { nsmap, contexts: new Map(), units: new Map() };
  for (const el of all) {
    const t = lower(el.tagName);
    if (T.context.has(t)) {
      let period: string | [string, string | null] | null = null;
      const dims: Record<string, string> = {};
      for (const sub of Array.from(el.getElementsByTagName('*'))) {
        const st = lower(sub.tagName);
        const txt = (sub.textContent ?? '').trim();
        if (T.startDate.has(st)) period = [txt, null];
        else if (T.endDate.has(st) && Array.isArray(period)) period[1] = txt;
        else if (T.instant.has(st)) period = txt;
        else if (T.explicitMember.has(st)) dims[qname(sub.getAttribute('dimension') ?? '')] = qname(txt);
        // §1a: typed members recorded VERBATIM (inner element text), never interpreted [B1]
        else if (T.typedMember.has(st)) dims[qname(sub.getAttribute('dimension') ?? '')] = txt;
        else if (T.identifier.has(st)) out.entities.add(txt); // M2: solely for the multi-entity note
      }
      scan.contexts.set(el.getAttribute('id') ?? '', {
        period: typeof period === 'string' ? period : period ? `${period[0]}/${period[1]}` : '',
        dims,
      });
    } else if (T.unit.has(t)) {
      const measures = Array.from(el.getElementsByTagName('*'))
        .filter((m) => T.measure.has(lower(m.tagName)))
        .map((m) => (m.textContent ?? '').trim());
      const one = (m: string) => {
        const loc = m.includes(':') ? m.slice(m.indexOf(':') + 1) : m;
        return m.toLowerCase().startsWith('iso4217') ? loc.toUpperCase() : loc;
      };
      scan.units.set(el.getAttribute('id') ?? '', measures.length === 1 ? one(measures[0]) : measures.map(one).join('/'));
    }
  }

  for (const el of all) {
    const t = lower(el.tagName);
    const isNF = T.nonFraction.has(t);
    const isNN = T.nonNumeric.has(t);
    if (!isNF && !isNN) continue;
    const cname = qname(el.getAttribute('name') ?? '');
    const fmt = el.getAttribute('format');
    const raw = textMinusExclude(el, T.exclude);
    if (isNN) {
      if (IDENTITY_NAME.has(cname)) { if (out.identity.name === undefined) out.identity.name = raw.trim(); }
      else if (cname in IDENTITY_META) out.identity[IDENTITY_META[cname]] = raw.trim();
      else if (cname in IDENTITY_DATES) {
        if (fmt !== null) {
          const i = fmt.indexOf(':');
          const key = `${nsmap[fmt.slice(0, i)] ?? ''}|${fmt.slice(i + 1)}`;
          if (!DATE_TRANSFORMS.has(key)) {
            out.notes.push(`unsupported date transform ${fmt} on ${cname} — identity read skipped`);
            continue;
          }
        }
        const d = parseDate(raw);
        if (d === null) out.notes.push(`unreadable date on ${cname} — identity read skipped`);
        else out.identity[IDENTITY_DATES[cname]] = d;
      }
      continue;
    }
    const ctx = scan.contexts.get(el.getAttribute('contextRef') ?? '');
    const unit = scan.units.get(el.getAttribute('unitRef') ?? '');
    if (ctx === undefined || unit === undefined) {
      out.notes.push(`unresolved contextRef/unitRef on ${cname} — fact dropped`);
      continue;
    }
    let kind: NumKind | null = null;
    if (fmt !== null) {
      const i = fmt.indexOf(':');
      const key = `${nsmap[fmt.slice(0, i)] ?? ''}|${fmt.slice(i + 1)}`;
      const k = NUMERIC_TRANSFORMS.get(key);
      if (k === undefined) {
        out.notes.push(`unsupported transform ${fmt} on ${cname} — fact dropped`);
        continue;
      }
      kind = k;
    }
    let n = parseNumber(kind, raw);
    if (n === null) { out.notes.push(`untransformable text on ${cname} — fact dropped`); continue; }
    if (el.getAttribute('sign') === '-') n = -n;
    n = n * Math.pow(10, parseInt(el.getAttribute('scale') ?? '0', 10));
    const dec = el.getAttribute('decimals');
    out.facts.push({
      concept: cname, period: ctx.period, unit, dims: ctx.dims, value: n,
      decimals: dec === null || dec === 'INF' ? null : parseInt(dec, 10), file: filename,
    });
  }
}

// ── §1e dedup + §2 finish: EXACTLY the reference's algorithm ────────────────
const dimsKey = (dims: Record<string, string>) => JSON.stringify(Object.fromEntries(Object.entries(dims).sort()));
const INF = 1e9;

function finish(raw: { facts: ParsedFact[]; notes: string[]; identity: UploadIdentity; namespaces: Record<string, string>; entities: Set<string> }): ParsedUpload {
  if (raw.entities.size > 1) raw.notes.push('multiple entity identifiers in one upload — out of scope; facts merged per §1a note');
  const groups = new Map<string, ParsedFact[]>();
  for (const f of raw.facts) {
    const key = `${f.concept} ${f.period} ${f.unit} ${dimsKey(f.dims)}`;
    const g = groups.get(key);
    if (g) g.push(f); else groups.set(key, [f]);
  }
  const facts: ParsedFact[] = [];
  for (const [, g] of Array.from(groups.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (g.length === 1) { facts.push(g[0]); continue; }
    const coarsest = Math.min(...g.map((x) => (x.decimals ?? INF)));
    const rounded = new Set(g.map((x) => roundHalfAway(x.value, coarsest < INF ? coarsest : 12)));
    const { concept, period } = g[0];
    if (rounded.size > 1) {
      const vals = Array.from(new Set(g.map((x) => x.value))).sort((a, b) => a - b);
      raw.notes.push(`inconsistent duplicate ${concept} @ ${period}: ${pyFloat(vals[0])} vs ${pyFloat(vals[vals.length - 1])} — dropped to gap`);
      continue;
    }
    const best = [...g].sort((a, b) => ((b.decimals ?? INF) - (a.decimals ?? INF)) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))[0];
    if (new Set(g.map((x) => x.value)).size > 1) raw.notes.push(`duplicate ${concept} @ ${period}: kept most precise`);
    facts.push(best);
  }
  facts.sort((a, b) =>
    (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0)
    || (a.period < b.period ? -1 : a.period > b.period ? 1 : 0)
    || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0)
    || (dimsKey(a.dims) < dimsKey(b.dims) ? -1 : dimsKey(a.dims) > dimsKey(b.dims) ? 1 : 0));

  // §2 routing over DISTINCT DIMENSION-FREE CONCEPTS
  const free = facts.filter((f) => Object.keys(f.dims).length === 0);
  const distinct = (pfx: string) => new Set(free.filter((f) => f.concept.startsWith(pfx)).map((f) => f.concept)).size;
  const ug = distinct('us-gaap:');
  const ifrs = distinct('ifrs-full:');
  const routing: 'us-gaap' | 'oim' = (ifrs === 0 && ug >= 1) || (ug >= 5 && ug >= ifrs) ? 'us-gaap' : 'oim';

  const cur = new Map<string, number>();
  for (const f of facts) if (/^[A-Z]{3}$/.test(f.unit)) cur.set(f.unit, (cur.get(f.unit) ?? 0) + 1);
  const modalCurrency = cur.size
    ? Array.from(cur.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0][0]
    : null;

  raw.notes.sort();
  return { facts, notes: raw.notes, identity: raw.identity, routing, modalCurrency, namespaces: raw.namespaces };
}

/** Parse an uploaded filing (single xhtml or ESEF-style zip) per IXBRL_SPEC §1/§2. */
export function parseIxbrlUpload(filename: string, bytes: Uint8Array): ParsedUpload {
  const raw = { facts: [] as ParsedFact[], notes: [] as string[], identity: {} as UploadIdentity, namespaces: {} as Record<string, string>, entities: new Set<string>() };
  const isZip = filename.toLowerCase().endsWith('.zip') || (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b);
  const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);
  if (isZip) {
    const entries = unzipSync(bytes);
    let reports = Object.keys(entries).filter((n) => /(^|\/)reports\/[^/]+\.xhtml$/.test(n)); // §Scope: nested at ANY depth
    if (reports.length === 0) {
      reports = Object.keys(entries).filter((n) =>
        n.endsWith('.xhtml') && decode(entries[n]).includes(':nonFraction')); // M6: facts-bearing only
    }
    for (const n of reports.sort()) parseOneDocument(decode(entries[n]), n.split('/').pop() ?? n, raw);
  } else {
    parseOneDocument(decode(bytes), filename.split('/').pop() ?? filename, raw);
  }
  return finish(raw);
}

// ── §2/§3: routing into the adjudicated mappers ─────────────────────────────
const MODELLED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'INR']);

/** §3 CompanyFacts synthesis — DIMENSION-FREE facts only (a segment member must never
 *  impersonate a consolidated total); fy/fp/form where tagged, else omitted; accn is the
 *  EMPTY STRING (falsy ⇒ filingUrl short-circuits — no fabricated sec.gov URL); cik 0
 *  satisfies the required type and the restamp walk clears cik10. */
export function synthesizeCompanyFacts(p: ParsedUpload): CompanyFacts {
  const facts: CompanyFacts['facts'] = {};
  const fy = p.identity.fy !== undefined ? Number(p.identity.fy) : undefined;
  for (const f of p.facts) {
    if (Object.keys(f.dims).length > 0) continue;
    const i = f.concept.indexOf(':');
    const [taxonomy, tag] = [f.concept.slice(0, i), f.concept.slice(i + 1)];
    const isInstant = !f.period.includes('/');
    const row: XbrlFactValue = {
      val: f.value,
      end: isInstant ? f.period : f.period.slice(f.period.indexOf('/') + 1),
      ...(isInstant ? {} : { start: f.period.slice(0, f.period.indexOf('/')) }),
      ...(fy !== undefined && Number.isFinite(fy) ? { fy } : {}),
      ...(p.identity.fp !== undefined ? { fp: p.identity.fp } : {}),
      ...(p.identity.docType !== undefined ? { form: p.identity.docType } : {}),
      accn: '',
    } as XbrlFactValue;
    const space = (facts[taxonomy] ??= {});
    const concept = (space[tag] ??= { units: {} });
    (concept.units[f.unit] ??= []).push(row);
  }
  return { cik: 0, entityName: p.identity.name ?? 'Unknown', facts } as CompanyFacts;
}

/** §2 OIM report for the mapIfrsReport route (documentInfo.namespaces REQUIRED — mapIfrs's
 *  standard-vs-extension classification reads namespace URIs). */
export function buildOimReport(p: ParsedUpload): XbrlJsonReport {
  const facts: Record<string, XbrlJsonFact> = {};
  p.facts.forEach((f, i) => {
    facts[`f${i}`] = {
      value: f.value,
      ...(f.decimals !== null ? { decimals: f.decimals } : {}),
      dimensions: { concept: f.concept, period: f.period, unit: f.unit, ...f.dims },
    };
  });
  return { documentInfo: { namespaces: p.namespaces }, facts };
}

/** §2 provenance restamp + §2c fix-ups. Restamps EXACTLY source ∈ {edgar, esef} ('default'
 *  is untouched — the statutory-tax template downgrade must survive); appends the uploaded
 *  filename to the mapper's audit detail (never replaces); stamps origin; clears cik10; and
 *  applies the currency/period fix-ups for unanchored (pure-FRC) imports. */
export function restampUpload(raw: RawHistoricals, p: ParsedUpload, filename: string): RawHistoricals {
  const stamp = (v: SourcedValue | null | undefined): void => {
    if (!v) return;
    if (v.provenance.source === 'edgar' || v.provenance.source === 'esef') {
      v.provenance.source = 'upload';
      v.provenance.detail = `${v.provenance.detail} · uploaded ${filename}`;
    }
  };
  const r = raw as unknown as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && typeof v === 'object' && 'provenance' in (v as object)) stamp(v as SourcedValue);
  }
  raw.origin = 'upload';
  raw.cik10 = undefined; // a zero-padded pseudo-CIK must never present as a real one (R3-1)
  const anchored = raw.fy_revenue !== null || raw.fy_ebitda !== null;
  if (!anchored && p.modalCurrency) {
    if (MODELLED.has(p.modalCurrency)) { raw.currency = p.modalCurrency; raw.currency_unsupported = undefined; }
    else raw.currency_unsupported = p.modalCurrency;
  }
  const docDate = p.identity.balanceSheetDate ?? p.identity.endDateForPeriod; // BalanceSheetDate WINS
  if (docDate) {
    if (!raw.periodEnd) raw.periodEnd = docDate;
    if (!raw.as_of) raw.as_of = docDate;
    if (raw.fiscalYear === undefined) raw.fiscalYear = Number(docDate.slice(0, 4));
  }
  return raw;
}

/** The §2b FRC document-level note (identity-only import; every financial field a gap). */
const FRC_NOTE = 'FRC (Companies House) accounts: v1 extracts identity only — financial fields surface as gaps; FRC alias mapping is a planned extension';

/**
 * The upload orchestrator: bytes → RawHistoricals through the SAME mappers as the fetch
 * routes. Throws a user-facing Error for out-of-scope (interim) and zero-fact uploads.
 */
export function uploadedFilingToRaw(filename: string, bytes: Uint8Array): RawHistoricals {
  const p = parseIxbrlUpload(filename, bytes);
  const interim = (p.identity.fp !== undefined && p.identity.fp !== 'FY')
    || (p.identity.docType !== undefined && /10-Q|6-K/i.test(p.identity.docType));
  if (interim) {
    throw new Error("interim filings aren't supported yet — upload the annual report (10-K, 20-F, annual accounts)");
  }
  if (p.facts.length === 0) {
    throw new Error('no XBRL facts found in this file — is it an iXBRL filing? (PDFs and plain HTML have no tagged data)');
  }
  let raw: RawHistoricals;
  if (p.routing === 'us-gaap') {
    raw = mapCompanyFacts(synthesizeCompanyFacts(p), {});
  } else {
    raw = mapIfrsReport(buildOimReport(p), { entityName: p.identity.name });
    const frc = Object.values(p.namespaces).some((u) => u.includes('frc.org.uk'));
    if (frc) raw.days_notes = [...raw.days_notes, FRC_NOTE];
  }
  raw = restampUpload(raw, p, filename.split('/').pop() ?? filename);
  // §1 zero-parseable is an error above; parse-layer drop notes surface with the import
  raw.days_notes = [...raw.days_notes, ...p.notes];
  return raw;
}
