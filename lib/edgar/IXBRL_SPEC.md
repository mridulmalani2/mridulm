# IXBRL_SPEC — uploaded-filing extraction (data-side, Tier B) — v1 r4 (sign-off GRANTED @ fb8021e), 2026-08-07

Normative conventions for the in-browser iXBRL upload parser (`lib/edgar/ixbrl.ts`): a user
drops a filing FILE and gets the SAME `RawHistoricals` the fetch routes produce, through the
SAME mappers. Every rule here is fixture-pinned; the reference derivation
(`scripts/goldens/ixbrl_ref.py`, Python stdlib, zero imports of the TypeScript under test)
re-derives the expected facts for the CI regeneration gate. **Revisions r2–r4 applied every hostile
sign-off finding (rounds 1–3: 9 + 3 + 1 blockers + minors; round 4 GRANTED)** — transform registry corrected
against BOTH real samples; order-independent decimals-aware dedup; dimensional exclusion;
annual-documents scope; the stitch-refusal proof; the restamp mechanism (default-sparing,
URL-honest); FRC truth-telling incl. the balance-sheet-date staleness story; the nested
ESEF glob; allowlist re-justification.

**Scope (v1) — ANNUAL documents only.** Three upload forms, parsed ENTIRELY in the browser
(a private target's accounts never leave the machine — server-side parsing REJECTED on
exactly that):
1. **SEC 10-K / 20-F iXBRL** — a single `.htm`/`.xhtml` as served by EDGAR. (Verified on the
   real Apple FY2024 10-K: 963 `ix:nonFraction`, TR4 `ixt:num-dot-decimal`/`ixt:fixed-zero`,
   rare `ixt-sec` word-numbers, scales {−2,0,3,6,9}, 61 sign flags, ix-2013 namespace.)
2. **UK Companies House accounts iXBRL** — the `document?format=xhtml` file (FRC taxonomies,
   ix-2008 + TR2 `ixt2:numdotdecimal`; verified on a real 19KB FRS filing). v1 extracts the
   document IDENTITY and surfaces every financial field as an honest GAP — see §2b. THE
   private-company filing form; full FRC alias support is a named later extension.
3. **ESEF report packages** — the `.zip` (unzipped in-browser via `fflate`; every
   `**/reports/*.xhtml` at ANY depth parsed and merged — real packages nest the report under
   `<name>/reports/`; fallback: any `.xhtml` entry bearing `ix:` facts) or a bare `.xhtml`.
   (Verified on a real Finnish FY2025 package: TR5 namespace, nested layout.)

**Interim documents (10-Q/half-years) are OUT OF SCOPE in v1 and rejected up-front** with a
user-facing error ("interim filings aren't supported yet — upload the annual report"),
detected via `dei:DocumentType`/`dei:DocumentFiscalPeriodFocus` ≠ FY where tagged. Rationale
(round-1 B4): the reused `mapCompanyFacts` anchors on `fp === 'FY' || ANNUAL_FORMS.has(form)`;
a 10-Q synthesis anchors nothing and the whole import (history included) would be empty — an
all-gap surprise, not the promised degradation. Rejecting up-front is the honest v1.

**Non-goals (v1, REJECTED → later).** PDF/scanned accounts (the AI-extraction feature,
deferred behind this one); XBRL-CSV / OIM-JSON uploads; footnote text extraction beyond the
identity reads (§1d); calculation-linkbase validation (the mappers' layered precedence +
reconstruction rules already guard double-counting); FRC financial-alias mapping (§2b).

## 1. Parse pipeline (per xhtml file)

`DOMParser` (`application/xhtml+xml`; on parser-error retry `text/html` — Companies House
files are occasionally lax) → namespace map from EVERY `xmlns:*` declaration in scope (the
parser records the full prefix→URI map and EMITS it as `documentInfo.namespaces` — REQUIRED,
because `mapIfrs`'s standard-vs-extension classification reads namespace URIs, round-1 B7)
→ resources:

- **a. Contexts** (`xbrli:context` by `id`): entity (recorded, not used for filtering — a
  single uploaded document IS one entity; multi-entity documents are out of scope and
  surface as a note), period → OIM string `start/end` (duration) or `instant`, dimensions
  from `xbrldi:explicitMember` under `segment`/`scenario` → `{dimensionQName: memberQName}`
  (typed members recorded verbatim, never interpreted).
- **b. Units** (`xbrli:unit` by `id`): single `xbrli:measure` → local unit string
  (`iso4217:USD` → `USD`, `xbrli:shares` → `shares`, `xbrli:pure` → `pure`). Divide units
  serialize as `NUM/DEN` with the consumers' exact spellings (`USD/shares` — the grammar
  `mapXbrl.monetaryFacts`' non-currency set actually contains; round-1 minor 2). Only
  single-measure iso4217 units are "currency" anywhere downstream; the upload route derives
  the DOCUMENT currency as the modal iso4217 measure across kept monetary facts (§2c).

- **c. Facts** (`ix:nonFraction`, BOTH the 2008 and 2013 `ix` namespaces):
  concept = `name` (QName resolved against the in-scope map; prefixes NORMALIZED to canonical
  for known URIs — us-gaap, ifrs-full, dei, srt, country; unknown URIs keep their document
  prefix and are extensions), `contextRef`/`unitRef` resolved, and the value

  `value = sign × transform(text) × 10^scale`

  - `text` = the element's flattened text content with any `ix:exclude` subtree removed.
  - **Transform registry — keyed by (REGISTRY NAMESPACE, local name), exact spellings per
    registry [round-1 B1: TR2/TR3 spell the names unhyphenated; TR5 was missing; the two
    real samples each used a registry the r1 table lacked]:**

    | Registry namespace | → number | → 0 |
    |---|---|---|
    | TR1 `http://www.xbrl.org/2008/inlineXBRL/transformation` | `numcommadot` (comma thousands · dot decimal), `numdotcomma` (dot thousands · comma decimal) | `numdash` |
    | TR2 `http://www.xbrl.org/inlineXBRL/transformation/2011-07-31` | `numdotdecimal`, `numcommadecimal` | `zerodash` |
    | TR3 `http://www.xbrl.org/inlineXBRL/transformation/2015-02-26` | `numdotdecimal`, `numcommadecimal` | `zerodash` |
    | TR4 `http://www.xbrl.org/inlineXBRL/transformation/2020-02-12` | `num-dot-decimal`, `num-comma-decimal` | `fixed-zero` |
    | TR5 `http://www.xbrl.org/inlineXBRL/transformation/2022-02-16` | `num-dot-decimal`, `num-comma-decimal` | `fixed-zero` |

    Dot-decimal semantics: strip spaces (incl. NBSP/thin) and commas; `.` is the decimal
    mark. Comma-decimal: strip spaces and dots; `,` becomes the decimal mark. `numcommadot`
    ≡ dot-decimal semantics; `numdotcomma` ≡ comma-decimal semantics. The →0 names map an
    accountant's dash (em/en/hyphen/minus or empty content) to exactly 0.
    An ABSENT `format` parses `text` as a plain decimal (sign character permitted).
    **Everything else — including TR4/TR5 `fixed-empty` and TR2/TR3 `nocontent` (registry
    semantics: empty STRING, not zero — mapping them to 0 would fabricate a number), all
    date/text transforms, and `ixt-sec:*` word-numbers — DROPS the fact WITH a note**
    (`unsupported transform <qname> on <concept> — fact dropped`). A dropped fact can only
    ever produce a GAP (surfaced, user-fillable), never a wrong number.
  - `sign="-"` negates (after transform, before scale); absent `scale` → 0; `decimals`
    recorded verbatim (no re-rounding — SPEC §15).
  - A fact whose `contextRef`/`unitRef` fails to resolve, or whose text fails its transform
    (non-numeric residue), is DROPPED with a note.
- **d. Identity reads** (`ix:nonNumeric`, only these): entity name from
  `dei:EntityRegistrantName` / `uk-bus:EntityCurrentLegalOrRegisteredName` /
  `ifrs-full:NameOfReportingEntityOrOtherMeansOfIdentification` [round-1 minor 4];
  `dei:DocumentType`, `dei:DocumentFiscalYearFocus`, `dei:DocumentFiscalPeriodFocus`,
  `dei:DocumentPeriodEndDate` (scope gate + §3 synthesis); and the PERIOD-END dates an FRC
  filing actually carries [round-2 R2-1]: `uk-bus:BalanceSheetDate` /
  `uk-bus:EndDateForPeriodCoveredByReport`. Identity DATE reads support exactly the date
  transforms these classes use — TR2/TR3 `datedaymonthyearen`/`datedaymonthyear`, TR4/TR5
  `date-day-month-year`, plain ISO `yyyy-mm-dd` text — and an unsupported date format skips
  the read with a note (identity stays absent), never guesses.

- **e. DEDUPLICATION — one order-independent, decimals-aware rule for ALL facts, single- or
  multi-file [round-1 B2: the real Apple 10-K carries 70 duplicate keys; one
  (`UnrecognizedTaxBenefits @ c-21`) has $22,000m @ decimals −8 AND $22,038m @ −6 — an
  order-dependent pick is off by $38m].** Group by (concept, resolved period, unit,
  dimensions). Within a group: round every value to the COARSEST `decimals` present
  (`INF`/absent = most precise; rounding is HALF-AWAY-FROM-ZERO, pinned so the TS parser
  and the Python reference can never disagree at an exact half [round-2 minor 2]); if all
  rounded values agree, keep the MOST-precise member
  (noting the collapse only when raw values differed); if they disagree even at the coarsest
  precision, DROP the whole group to a GAP with a note naming both values. Never a
  document-order pick.

## 2. Output shape, routing, and honesty per class

The parser emits the OIM-ish `XbrlJsonReport` (`lib/edgar/esef.ts` shape) INCLUDING
`documentInfo.namespaces`. Routing [adapted from the fetch route's `isIfrsCompanyFacts` threshold — round-2 minor 1]:
count DISTINCT DIMENSION-FREE CONCEPTS per standard taxonomy (concepts, not fact rows, are
the unit of BOTH comparisons); **us-gaap route iff (ifrs-full concepts = 0 AND us-gaap ≥ 1)
OR (us-gaap concepts ≥ 5 AND us-gaap ≥ ifrs-full)** — one stray us-gaap fact must not flip
a 20-F, and a us-gaap-only document routes us-gaap even when sparse; otherwise the OIM
route. (Divergence from the fetch heuristic is toward honest gaps only, never a wrong
number.)

- **a. us-gaap route** → §3 CompanyFacts synthesis → `mapCompanyFacts` (the adjudicated
  D1/D2 mapper, reused as-is).
- **b. OIM route** → `mapIfrsReport` as-is — with the truth told per class [round-1 B7]:
  - **ESEF/IFRS**: the normal path; the layered resolver does its normal work.
  - **FRC/Companies House**: `mapIfrs` classifies `frc.org.uk` namespaces as STANDARD
    taxonomies (deliberately excluded from its extension scan), and its anchor concepts are
    `ifrs-full`-only — so a pure-FRC filing resolves NO financial fields in v1. The upload
    still imports honestly: entity name + the balance-sheet date from §1d (ch-real pins
    BOTH, and the staleness badge they drive), every financial field a GAP
    (red MISSING badges — the user confirms numbers off the accounts they are holding), plus
    a document-level note: `FRC (Companies House) accounts: v1 extracts identity only —
    financial fields surface as gaps; FRC alias mapping is a planned extension`. This is the
    manual-entry flow with the identity prefilled and the parse layer proven — not a silent
    failure, and NEVER a mislabel.
- **c. Currency + period fix-ups [round-1 B7 / round-2 R2-1]**: when the mapper's own
  anchor-based detection found no anchor (pure-FRC, sparse docs), the upload route's
  post-map fix-up sets `RawHistoricals.currency` from the DOCUMENT's modal iso4217 unit
  (a modelled currency lands as itself; an unmodelled one goes through the existing
  `currency_unsupported` Build-block — the mapper's EUR default is never presented against
  contrary units) AND sets `periodEnd`/`as_of`/`fiscalYear` from the §1d balance-sheet date
  when the mapper left them unset (`uk-bus:BalanceSheetDate` WINS when both §1d dates are
  present and differ) — so an old FRC filing badges STALE off its own balance-sheet date.
- **d. Zero-fact uploads** (nothing parseable at all): a user-facing ERROR, not an empty
  import.

**Provenance restamp [round-1 B6 — the mappers hardcode `source: 'edgar'`/`'esef'` and their
audit details must survive].** The restamp mechanism edits NO mapper (the one mapper change this feature ships is the
separate, fixture-pinned `· 10-K` literal fix below). After mapping, `lib/edgar/ixbrl.ts`
walks the produced `RawHistoricals` and, FOR EXACTLY the provenances whose
`source ∈ {'edgar','esef'}` (the fetch-producer tags — the only other sources the two
mappers emit), (i) sets `provenance.source` to `'upload'` and (ii) APPENDS
` · uploaded <filename>` to the `detail` (never replacing the mapper's audit string);
(iii) sets `RawHistoricals.origin = 'upload'` and (iv) clears `RawHistoricals.cik10`
[round-3 R3-1]. **`source: 'default'` is left UNTOUCHED**
[round-2 R2-2]: the statutory tax-rate fallback must keep its 'default' tag or
`factsAdapter`'s template-badge downgrade dies and a 21%/25% statute would wear an
uploaded-from-the-filing badge — the mislabel class again. **All
THREE source unions gain `'upload'`**: `ProvenanceSource`, `RawHistoricals.origin`, and
`DealFacts.source` (leaving origin unset would let `factsAdapter`'s legacy fallback stamp
`'edgar'`/`'esef'` — a false Class-A source, the v1.1.2 mislabel class). Known pre-existing
latent folded in here: `mapXbrl`'s derived-EBITDA detail hardcodes `· 10-K`; the synthesis
passes the REAL `dei:DocumentType`, and the hardcoded literal is corrected to use the fact's
actual form (in-allowlist one-liner, fixture-pinned).

**Staleness**: every route badges off the document's own period end — the anchored routes
from the anchor period, an FRC import from its §1d balance-sheet date via the §2c fix-up.
An old uploaded filing badges stale, honestly; only a document carrying NO readable date at
all renders no tier (`stalenessTier(undefined)`), with the §2b note carrying the story.

## 3. CompanyFacts synthesis (us-gaap route only)

`mapCompanyFacts` + `history.ts` consume the SEC `companyfacts` shape. From one document:
**only DIMENSION-FREE facts enter the synthesis** [round-1 B3 — real companyfacts is
non-dimensional by construction; without this rule Apple's 45 dimensional revenue members
(segments/products) would be stripped of their axes and become indistinguishable from the
consolidated total: a silent wrong number, and a forged `vintage_count` for the stitch gate].
Group by `taxonomy:tag` and unit → `{val, start?, end, fy?, fp?, form?, filed?}` rows with
`fy`/`fp` from the §1d focus facts and `form` from `dei:DocumentType` where tagged, else
OMITTED (the consumers tolerate absence — `String(filed ?? '')` sorts; `accn` is required by
the type and synthesized as the EMPTY STRING — falsy, so `filingUrl`'s `!accession` guard
short-circuits and NO sec.gov archive URL is ever fabricated for an upload (the
uploaded-filename story travels in the restamped detail instead); `cik` is synthesized `0`
purely to satisfy the required type, and the §2 restamp walk, item (iv), CLEARS `RawHistoricals.cik10`
— a zero-padded pseudo-CIK must never present as a real one) [round-2 minor 5; round-3
R3-1: JS `0 != null` is true, so a cik of 0 DOES produce `CIK0000000000` — the previous
"cik10-absent guard" claim was code-false]
[round-1 minor 1]. DOCUMENTED DEGRADATIONS (each fails toward gaps or fewer points, never
wrong values):
- **Vintage dedup (D1 rule 2)** degrades to single-vintage — one document, one filing; the
  in-document comparative years (a 10-K carries 2–3) still build a short history, and the
  D1 ≥3-point gate applies unchanged.
- **The §1.1 LTM quarter-stitch RUNS and REFUSES [round-1 B5 — mechanism, not assertion]:**
  `mapCompanyFacts` calls `stitchLtm` unconditionally; on an annual-document synthesis it
  refuses on THREE independent grounds: (i) no interim durations → the 'fpi' fallback; (ii)
  any in-document interim could not start at FY-end+1d, so the F1 abutment gate refuses;
  (iii) the M1 restatement-evaluability gate sees `vintage_count = 1` — which §3's
  dimensional exclusion makes TRUE by construction (dimensional members were the only way to
  fake a second vintage). The refusal stamps the mapper's existing visible provenance note
  ("LTM stitch → FY: …"), which the review screen shows; `basis` is FY and the staleness
  badge does the honest work.

## 4. Failure honesty

Nothing in this pipeline defaults, interpolates or unit-guesses. Every drop, conflict,
unsupported transform, routing decision and degradation lands in `notes[]`/`gaps[]`,
rendered on the review screen like every other route's. A value the document did not yield
is EMPTY + MISSING-badged, never fabricated.

## 5. Fixtures + adjudication (the DERIVATION.md method, Tier B step 2)

- `tests/fixtures/ixbrl/synthetic-min.xhtml` — hand-written: every SUPPORTED (registry,
  name) pair incl. TR1/TR2 spellings, scales (incl. −2), sign, duration/instant, a
  dimensional fact (must be EXCLUDED from synthesis/routing counts yet present in the OIM
  facts), an unsupported transform (drop + note), `fixed-empty` (drop + note, NOT zero), a
  broken contextRef (drop + note), an `ix:exclude` subtree, and a decimals-aware dedup
  trio: (agreeing coarse/precise pair → most-precise kept) + (disagreeing pair → GAP).
  Every expected number hand-computed in the adjudication record.
- `tests/fixtures/ixbrl/aapl-10k-trimmed.htm` — the REAL Apple FY2024 10-K (full ix:header +
  every fact the mappers read PLUS the `UnrecognizedTaxBenefits` note facts, markup
  untouched); expected headline facts hand-verified against EDGAR-published figures; pins
  the REAL dup-key case in-fixture (`UnrecognizedTaxBenefits @ c-21`: decimals −8 $22,000m
  vs −6 $22,038m — the precise value must win) [round-2 R2-3: the trim keep-set explicitly
  includes this concept so the pin actually runs].
- `tests/fixtures/ixbrl/ch-real.xhtml` — the REAL 19KB Companies House FRS filing, committed
  whole: pins the §2b truth — identity extracted, financial fields ALL gaps, the FRC note
  present, currency from the document's GBP units, and TR2 `numdotdecimal` recognized (the
  OIM facts ARE parsed — mapping, not parsing, is what v1 defers).
- `tests/fixtures/ixbrl/esef-mini.zip` — NESTED real-package layout
  (`pkg/reports/a.xhtml` + `pkg/reports/b.xhtml`): pins the `**/reports/*.xhtml` glob,
  multi-file merge, the cross-file dedup rule, and a TR5-namespace fact.
- `scripts/goldens/ixbrl_ref.py` — INDEPENDENT Python extraction (stdlib only) producing
  `expected.json` per fixture; committed outputs are GOSPEL after TWO independent
  adjudication passes (DERIVATION.md method, ±$0.005m where money is compared);
  `tests/ixbrl-goldens.test.ts` re-runs the reference via `python3` in CI (the goldens
  regeneration-gate mechanism) and fails on drift.

## Tier claim: B — with the allowlist deltas NAMED [round-1 B9]

The diff is confined to: `lib/edgar/**` (parser + this spec), the DISPLAY-SURFACE SET
(upload UI in `components/deal-engine/**`), purely-additive union members in
`lib/edgar/types.ts` AND `lib/engine2/types.ts` (`'upload'` on the three source unions),
`tests/**`, docs — **plus three enumerated, justified deltas**: `package.json` +
`package-lock.json` (dependency manifest ONLY — `fflate`, zero-dependency inflate; no code
path outside `lib/edgar` imports it) and `scripts/goldens/ixbrl_ref.py` (the Tier-B
reference derivation — the exact precedent of G-2's reference scripts living in
`scripts/goldens/`). **`store/dealEngine.ts` is NOT touched**: the upload UI parses via
`lib/edgar` and feeds the EXISTING `loadFromHistoricals` action — the conformance diff
check can verify the store's absence from the diff. EMPTY over the engine arithmetic path
and the suggestion path. The new arithmetic = transform/scale/sign evaluation, the
decimals-aware dedup, and fact grouping — adjudicated per §5. `mapCompanyFacts` /
`mapIfrsReport` are consumed as-is except the one fixture-pinned `· 10-K` literal fix (§2);
their adjudication stands.
