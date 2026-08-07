# IXBRL_SPEC — uploaded-filing extraction (data-side, Tier B) — v1, 2026-08-07

Normative conventions for the in-browser iXBRL upload parser (`lib/edgar/ixbrl.ts`): a user
drops a filing FILE and gets the SAME `RawHistoricals` the fetch routes produce, through the
SAME mappers. This document is the parser's spec the way SPEC §1.1 is the LTM stitch's: every
rule here is fixture-pinned, and the reference derivation (`scripts/goldens/ixbrl_ref.py`,
Python, zero imports of the TypeScript under test) re-derives the expected facts for CI.

**Scope (v1).** Three upload forms, all parsed ENTIRELY in the browser (a private target's
accounts never leave the machine — the REJECTED alternative, server-side parsing, dies on
exactly that):
1. **SEC 10-K/10-Q/20-F iXBRL** — a single `.htm`/`.xhtml` as served by EDGAR
   (us-gaap/ifrs-full + dei + issuer extension namespaces; Workiva-style profile verified on
   the real Apple FY2024 10-K: 963 `ix:nonFraction`, transforms `ixt:num-dot-decimal` /
   `ixt:fixed-zero` / rare `ixt-sec:*` word-numbers, scales {−2,0,3,6,9}, sign flags,
   dimensional contexts).
2. **UK Companies House accounts iXBRL** — the `document?format=xhtml` file (FRC taxonomies
   `uk-core`/`uk-bus`/`uk-direp`, `ixt2` 2011 transforms; verified on a real 19KB filing).
   THE private-company case: UK private companies FILE these.
3. **ESEF report packages** — the `.zip` (unzipped in-browser via `fflate`; every
   `reports/*.xhtml` parsed and merged) or a bare report `.xhtml`.

**Non-goals (v1, REJECTED → later).** PDF/scanned accounts (no XBRL — the AI-extraction
feature, deferred behind this one); XBRL-CSV/OIM-JSON uploads; footnote/continuation TEXT
extraction beyond the entity name; calculation-linkbase validation (the mappers' layered
precedence + reconstruction rules already guard double-counting).

## 1. Parse pipeline (per xhtml file)

`DOMParser` (`application/xhtml+xml`; on parser-error retry `text/html` — Companies House
files are occasionally lax) → namespace map from EVERY `xmlns:*` declaration in scope →
resources:

- **Contexts** (`xbrli:context` by `id`): entity (recorded, not used for filtering — a single
  uploaded document IS one entity; a multi-entity document is out of scope and surfaces as a
  note), period → OIM string `start/end` (duration) or `instant` (instant), dimensions from
  `xbrldi:explicitMember` under `segment`/`scenario` → `{dimensionQName: memberQName}` (typed
  members are recorded verbatim; never interpreted).
- **Units** (`xbrli:unit` by `id`): single `xbrli:measure` → local unit string (`iso4217:USD`
  → `USD`, `xbrli:shares` → `shares`, `xbrli:pure` → `pure`). Divide/complex units (e.g.
  USD/share) are kept as `NUM/DEN` strings; the downstream mappers already ignore
  non-single-currency units, so nothing needs to guess.

- **Facts** (`ix:nonFraction`, both the 2008 and 2013 `ix` namespaces): concept = `name`
  (prefixed QName, resolved against the in-scope namespace map — the PREFIX string is
  normalized to the CANONICAL prefix for known namespaces: us-gaap, ifrs-full, dei, srt,
  country; unknown namespaces keep their document prefix and are treated as issuer
  extensions), `contextRef`/`unitRef` resolved against the resources, and the VALUE:

  `value = sign × transform(text) × 10^scale`

  - `text` = the element's full text content with descendant markup flattened and any
    `ix:exclude` subtree removed;
  - **transform registry (SUPPORTED subset — everything else drops the fact WITH a note,
    never a guess):** `num-dot-decimal` (strip `,` and spaces; `.` decimal), `num-comma-decimal`
    (strip `.` and spaces; `,` decimal), `fixed-zero` → 0, `zerodash`/`numdash`/`fixed-empty`
    (an em/en/hyphen dash or empty → 0 — the accountant's "—"), across the `ixt`,
    `ixt2`, `ixt3`, `ixt4` registry namespaces (same local-name semantics). UNSUPPORTED
    (e.g. `ixt-sec:numwordsen` "two" → 2, date transforms on numeric slots): the fact is
    DROPPED and `notes[]` records `unsupported transform <qname> on <concept> — fact dropped`.
    Rationale: v1 needs the FINANCIAL-STATEMENT numerics; SEC word-number facts are cover-page
    metadata. A dropped fact can only ever produce a GAP (surfaced, user-fillable) — never a
    wrong number. This is the same fail-closed posture as the mappers' gap discipline.
  - `sign="-"` negates (after transform, before scale); `scale` absent → 0; `decimals`
    recorded verbatim (the mappers do not re-round — SPEC §15's no-intermediate-rounding).
  - A fact whose `contextRef`/`unitRef` fails to resolve, or whose text fails its transform
    (non-numeric residue), is DROPPED with a note. `ix:nonNumeric` is read ONLY for
    `dei:EntityRegistrantName` / `uk-bus:EntityCurrentLegalOrRegisteredName` (entity name)
    and `dei:DocumentType` / fiscal-focus fields (CompanyFacts synthesis, §3).

- **Merge (packages/multi-file):** facts from every parsed file union into one report. Exact
  duplicates (same concept+period+unit+dimensions+value) collapse silently; same-key
  DIFFERENT-value duplicates keep the FIRST and note the conflict (`duplicate fact <concept>
  @ <period>: <a> vs <b> — kept first`). An ESEF zip with zero parseable `reports/*.xhtml`
  (or any upload with zero facts) is an ERROR to the user, not an empty import.

## 2. Output shape and routing

The parser emits the OIM-ish `XbrlJsonReport` (`lib/edgar/esef.ts` shape: `facts` keyed
`f{n}`, each `{value, decimals, dimensions:{concept, period, unit, entity, …axes}}`) — the
shape `mapIfrsReport` already consumes. Routing by observed concept prefixes:

- **`us-gaap` facts present** → §3 CompanyFacts synthesis → **`mapCompanyFacts`** (the
  adjudicated D1/D2 mapper, REUSED VERBATIM — zero new mapping logic on this path).
- **otherwise** (ifrs-full, FRC `uk-core`, extensions) → **`mapIfrsReport`** as-is. The FRC
  taxonomies ride the EXISTING layered resolver: layer (a/b) ifrs-full aliases are silent,
  layer (c) extension-namespace local-name regexes and layer (d/e) reconstruction/roll-up do
  the work; whatever no layer derives is a GAP — the exact honest degradation the manual
  route already renders. v1 makes NO FRC-specific alias promises; observed coverage is
  recorded in the walkthrough, and FRC alias chains are a later, separately-adjudicated
  extension if coverage warrants.

Every produced `SourcedValue` carries `provenance.source: 'upload'` and a detail of the form
`<concept> · <period> · uploaded <filename>`; `RawHistoricals.origin = 'upload'`;
`DealFacts.source = 'upload'`. The staleness machinery (§1.1) reads the document's own
period end — an old uploaded filing badges stale, honestly.

## 3. CompanyFacts synthesis (us-gaap route only)

`mapCompanyFacts` + `lib/edgar/history.ts` consume the SEC `companyfacts` shape
(per-concept `units` arrays with `{val, start, end, fy, fp, form, filed, accn}`). From a
single uploaded document: group facts by `taxonomy:tag` and unit; `fy`/`fp` from
`dei:DocumentFiscalYearFocus`/`dei:DocumentFiscalPeriodFocus` where tagged (else null),
`form` from `dei:DocumentType` (else null), `filed`/`accn` null. DOCUMENTED DEGRADATIONS
(all fail toward gaps or fewer history points, never wrong values):
- **Vintage dedup (D1 rule 2)** degrades to single-vintage: one document has one filing
  vintage; restatement detection needs the fetch route. The comparative periods INSIDE the
  document (a 10-K carries 2–3 fiscal years) still build a short history — fewer usable
  points than the 8-year fetch history, and the D1 ≥3-point gate applies unchanged.
- **The §1.1 LTM quarter-stitch does NOT run** (it needs the quarterly filing series);
  `basis` is FY from the document's own annual figures — with the staleness badge doing the
  honest work. A 10-Q upload sizes off ITS OWN LTM only if the document tags LTM durations
  (rare); otherwise its most recent FULL-YEAR duration is used, and if none exists the
  sizing pair is a GAP (Build-gated).

## 4. Failure honesty

Nothing in this pipeline defaults, interpolates or unit-guesses. Every drop, conflict,
unsupported transform and degradation lands in `notes[]`/`gaps[]`, rendered on the review
screen like every other route's. The invariant is the repo's standing one: a value the
document did not yield is EMPTY + MISSING-badged, never fabricated.

## 5. Fixtures + adjudication (the DERIVATION.md method, Tier B step 2)

- `tests/fixtures/ixbrl/synthetic-min.xhtml` — hand-written, exercises EVERY supported
  transform, scale (incl. −2), sign, duration/instant contexts, a dimensional fact (must be
  EXCLUDED from non-dimensional mapping), an unsupported transform (must drop + note), a
  broken contextRef (drop + note), an `ix:exclude` subtree, and a same-key conflict across
  two files (zip fixture). Every expected number is hand-computed in the adjudication record.
- `tests/fixtures/ixbrl/aapl-10k-trimmed.htm` — the REAL Apple FY2024 10-K with the fact-free
  narrative body removed (ix:header + face-statement fact paragraphs kept intact, trimming
  documented); expected headline facts hand-verified against the EDGAR-published figures.
- `tests/fixtures/ixbrl/ch-real.xhtml` — a REAL small Companies House FRC filing (19KB,
  committed whole); expected extraction hand-verified; its sparse facts pin the honest-gap
  path.
- `tests/fixtures/ixbrl/esef-mini.zip` — two-xhtml package (built from the synthetic parts)
  pinning multi-file merge + zip handling + the conflict note.
- `scripts/goldens/ixbrl_ref.py` — INDEPENDENT Python extraction (stdlib only; imports
  nothing from the TS tree) producing `expected.json` per fixture; committed outputs are
  GOSPEL after TWO independent adjudication passes sign them (DERIVATION.md method, same
  ±$0.005m bar where money is compared); `tests/ixbrl-goldens.test.ts` re-runs the reference
  via `python3` in CI (same mechanism as the goldens regeneration gate) and fails on drift.

**Tier claim: B.** The whole diff is confined to `lib/edgar/**`, the display-surface set
(upload UI), additive `types.ts` union members (`'upload'` on the two source unions),
`tests/**`, docs, and `package.json` (fflate). EMPTY over the engine arithmetic path and the
suggestion path. The new arithmetic = transform/scale/sign evaluation + fact grouping —
adjudicated per §5. `mapCompanyFacts`/`mapIfrsReport` are consumed AS-IS (their adjudication
stands; reusing them is the point).
