# ixbrl fixtures — adjudication record (DERIVATION.md method; IXBRL_SPEC v1 r6 @ d74275e — r4 GRANTED @ fb8021e; r5 adjudication-driven; r6 conformance-driven)

The committed `expected/*.json` are the parser's GOSPEL once BOTH independent passes below are
signed: a reference derivation in a DIFFERENT LANGUAGE (`scripts/goldens/ixbrl_ref.py`, Python
stdlib, zero imports of the TS under test), two hand-derivation passes, and the CI regeneration
gate (`tests/ixbrl-goldens.test.ts` re-runs the reference and byte-compares). Same bar as
`tests/goldens/DERIVATION.md` (±$0.005m where money is compared; here every value is exact).

## Pass 1 — hand-derivation from IXBRL_SPEC §1/§2 (author-independent of the script's runtime)

**synthetic-min.xhtml — every value recomputed by hand from the raw document:**

| rule (IXBRL_SPEC) | raw → expected | verified |
|---|---|---|
| TR4 num-dot-decimal ×10⁶ | "2,000" → 2,000 → ×1e6 = 2.0e9 | ✓ |
| TR2 numdotdecimal ×10³ | "1,234.5" → 1234.5 → 1,234,500 | ✓ |
| TR2 numcommadecimal ×10³ | "1.234,56" → 1234.56 → 1,234,560 | ✓ |
| TR1 numcommadot | "9,876" → 9,876 | ✓ |
| TR1 numdotcomma | "1.000,5" → 1,000.5 | ✓ |
| TR3 numdotdecimal | "500" → 500 | ✓ |
| TR5 num-comma-decimal | "250,75" → 250.75 | ✓ |
| →0 names (TR2 zerodash "—", TR1 numdash "-", TR4 fixed-zero "") | 0, 0, 0 | ✓ |
| sign="-" then scale ×10³ | "12.5" → −12.5 → −12,500 | ✓ |
| scale −2, absent format | "21" → 0.21 | ✓ |
| plain decimal | "1000.25" → 1000.25 | ✓ |
| DIMENSIONAL fact kept in OIM with dims, excluded from routing counts | Revenues 111e6 dims≠{} present; routing counted 16 distinct dimension-free us-gaap concepts [corrected by pass 2 — a signed record must be exact] | ✓ |
| ix:exclude subtree removed | "5,000\<exclude…999…\>" → 5,000 (999 ignored) | ✓ |
| §1e dedup AGREE (Apple-mirror) | 22.0 ×1e9 dec −8 vs 22,038 ×1e6 dec −6: coarsest −8 → half-away 2.20e10 ≡ 2.20e10 → keep −6 = **22,038,000,000** + "kept most precise" note | ✓ |
| §1e dedup DISAGREE | 100e6 dec −6 vs 150e6 dec −6 → 1.0e8 ≠ 1.5e8 → NO fact + "inconsistent duplicate … dropped to gap" note | ✓ |
| unsupported transform / fixed-empty / broken contextRef | three drop notes, exact spec wording | ✓ |
| identity + TR2 datedaymonthyearen | "31 December 2024" → 2024-12-31 (balanceSheetDate); unsupported date transform → skip + note | ✓ |
| units | USD, EUR, shares, pure, divide "USD/shares"; modal currency USD (7+ USD vs 1 EUR) | ✓ |
| TYPED member [r6/B1] | c-typed `xbrldi:typedMember` → dims `{t1:ContractDurationAxis: "P3Y"}` VERBATIM; Revenues 55 ×1e6 = 55,000,000 KEPT with dims (no collision with the c-dur or c-dim Revenues — three distinct §1e groups), EXCLUDED from routing/synthesis | ✓ |
| signed text under a transform [r6/M5] | "-42" under `ixt:num-dot-decimal` → registry grammar admits no sign → DROP + "untransformable text on t1:SignedUnderTransform — fact dropped" | ✓ |
| routing | dimension-free us-gaap ≥5, ifrs-full 0 → **us-gaap** | ✓ |

**aapl-10k-trimmed.htm (REAL Workiva markup):** 210 `ix:nonFraction` + 6 top-level dei identity `ix:nonNumeric` elements = 216 kept top-level elements (nested fact occurrences serialize within their parents) [counts corrected/reconciled by pass 2] → 176 deduped facts; the
REAL dup pin `us-gaap:UnrecognizedTaxBenefits @ 2024-09-28` resolves to **22,038,000,000 @
dec −6** (the $22.0bn dec −8 twin collapses; EDGAR-published figure 22,038) — the exact case
sign-off round 2 verified arithmetically; second real pair 19,454 likewise; routing us-gaap;
modal USD; identity Apple Inc. / 10-K / FY2024 (identity.periodEnd is the RAW tagged text
"September 28, 2024" incl. its NBSP — dei:DocumentPeriodEndDate is metadata the pipeline never
consumes as a date; the us-gaap anchor period comes from fact contexts, and §1d's date
transforms apply to the uk-bus reads). Headline face figures spot-checked against the
EDGAR-published FY2024 10-K, dimension-free FY rows: RevenueFromContractWithCustomer…
391,035e6, OperatingIncomeLoss 123,216e6, CashAndCashEquivalents 29,943e6 — all exact.
(`NetIncomeLoss` is deliberately ABSENT: the trim keep-set is the mapXbrl read-set, which
never reads it — the engine derives NI itself.)

**ch-real.xhtml (REAL Companies House FRS filing, committed whole):** 14 facts, ALL
`uk-core:*` balance-sheet items across two year-ends (7 concepts × 2 instants), TR2
numdotdecimal; routing **oim** (0 us-gaap, 0 ifrs-full → arm 1 fails, arm 2 fails → oim);
modal currency **GBP** (the §2c fix-up input — the mapper's EUR default never presents);
identity: `uk-bus` name + `uk-bus:BalanceSheetDate` via datedaymonthyearen. Zero notes. The
§2b truth: these 14 facts map to NO financial field in v1 (FRC ≠ ifrs-full anchors) — the
import is identity + gaps, as spec'd.

**esef-mini.zip (nested `pkg/reports/{a,b}.xhtml`, TR5):** merge of two files; identical dups
(Revenue/ProfitLoss/Equity) collapse silently → 3 facts ×1e3 (1,000,000 / 200,000 / 300,000);
the cross-file Cash CONFLICT (50e3 vs 51e3, both dec −3 → disagree at coarsest) drops to a
GAP with the spec-worded note; identity name from a.xhtml; routing oim; modal EUR; the
META-INF entry is ignored by the `**/reports/*.xhtml` glob.

**Signed — pass 1 (2026-08-07): every expected value above re-derived by hand from the raw
fixture bytes + IXBRL_SPEC r4 alone; zero mismatches against `expected/*.json`.**
**Pass-1 r6 delta (2026-08-07, conformance-driven B1/M5 pins): synthetic gains the TWO rows
above → 20 facts / 7 notes; routing still 16 distinct dimension-free us-gaap concepts (the
typed Revenues is dimensional and does not vote); the other three goldens regenerated
byte-identically (gate-verified). Values hand-derived as above; signed.**

## Pass 2 — independent hand-derivation (no access to ixbrl_ref.py or expected/)

**Blindness ordering honored:** every value below was derived from IXBRL_SPEC + the raw
fixture bytes ONLY and committed to a scratch record BEFORE `expected/*.json` was opened;
`ixbrl_ref.py` was never consulted during derivation (opened only afterward, to audit the
post-adjudication §1c strip-set delta); the Pass-1 section above was read last, after the
comparison was already complete. Derive first, compare second.

**Derived blind:**
- **synthetic-min**: all 22 parsed facts with per-transform arithmetic (TR2 numcommadecimal
  "1.234,56" → 1234.56 ×10³ = 1,234,560; sign "12.5" → −12.5 ×10³ = −12,500; scale −2
  "21" → 0.21; ix:exclude "5,000⟨…999…⟩" → 5,000; →0 names → 0), the §1e trio (UTB agree:
  coarsest −8 → 220 vs 220.38→220 → keep dec −6 = 22,038,000,000 + note; AccountsPayable
  1.0e8 vs 1.5e8 → gap + note), the 3 drops, the identity block incl. the
  ixt-sec:datequarterend skip+note, all 6 notes, routing us-gaap (16 kept dimension-free
  us-gaap concepts, ifrs-full 0), modal USD (15 USD vs 1 EUR) → 19 kept facts.
- **esef-mini**: both `reports/*.xhtml` merged; identical dups collapse silently → 1,000,000 /
  200,000 / 300,000; cross-file Cash 50,000-vs-51,000 both dec −3 → disagree → gap + note;
  identity "Mini ESEF Oy"; routing oim; modal EUR.
- **ch-real**: all 14 facts (7 uk-core concepts × instants 2018-05-31 / 2017-05-31, Creditors
  under the WithinOneYear member, parentheses outside the element → positive), identity name +
  BalanceSheetDate (datedaymonthyearen) + EndDateForPeriodCoveredByReport (plain ISO), zero
  parse notes, routing oim, modal GBP.
- **aapl-10k-trimmed**: all 8 UnrecognizedTaxBenefits facts and their four §1e groups —
  2024-09-28: 22.0e9 dec −8 vs 22,038e6 dec −6, /1e8 = 220.00 vs 220.38 → both 220 → keep
  −6 = **22,038,000,000** + note; 2023-09-30: 19.5e9 dec −8 vs 19,454e6 dec −6 (×2), 195.00
  vs 194.54→195 → keep **19,454,000,000** + note; 2022-09-24 identical pair → 16,758,000,000,
  NO note; 2021-09-25 singleton 15,477,000,000. Spot checks at the dimension-free contexts:
  Revenue 391,035e6, OperatingIncomeLoss 123,216e6, Cash @ 2024-09-28 29,943e6. All exact.

**The one fork (r4) and its resolution (r5):** under r4's §1d grammar this pass derived
`dei:DocumentPeriodEndDate` as a date read → aapl's `ixt:date-monthname-day-year-en` (outside
the whitelist) → identity absent + note; the committed golden carries the verbatim text
"September 28, 2024" (NBSP intact) with no note. Pass 2 refused to sign over that single
divergence. Resolved SPEC-SIDE in r5 (@ 1bdc566), per this pass's own recommendation:
dei periodEnd is recorded VERBATIM (metadata never consumed as a date; SEC staleness anchors
from fact contexts), the date whitelist governs exactly the two uk-bus reads. Under r5 the
divergence dissolves in the goldens' favor; no golden changed. Pass 2 also audited the
post-adjudication one-line `ixbrl_ref.py` §1c fix (strip-set now space/NBSP/thin/narrow-NBSP/
tab) and re-ran the reference on all four fixtures: output **byte-identical** to the committed
`expected/*.json` — the fix is output-neutral here (no fixture numeric text carries a
non-ASCII space; esef's "1 000" is ASCII).

**Signed — pass 2 (2026-08-07): independent blind hand-derivation from the raw fixture bytes
+ IXBRL_SPEC (r4 at derivation time; adjudicated under r5 @ 1bdc566); ZERO mismatches against
`expected/*.json` under r5. The committed goldens are GOSPEL.**

**Pass-2 r6 delta (2026-08-07, same blindness ordering — derived from the r6 §1a/§1c spec
text + the two new fixture lines and committed to scratch BEFORE opening the r6 golden,
`ixbrl_ref.py` r6 diff, or the Pass-1 r6 note):** (1) typed pin — c-typed carries
`xbrldi:typedMember` on `t1:ContractDurationAxis` wrapping `<t1:DurationValue>P3Y</…>` →
dims recorded verbatim as the inner element's text `{t1:ContractDurationAxis: "P3Y"}`;
Revenues "55" ×10⁶ = **55,000,000** dec −6, kept WITH dims; the three Revenues keys
(dim-free 2.0e9 / explicit 111e6 / typed 55e6) differ in dims → three distinct §1e groups,
zero dedup interaction; the typed fact does NOT vote (routing still us-gaap on the same 16
distinct dimension-free us-gaap concepts) and single-identifier SYN means no multi-entity
note. (2) sign-grammar pin — `t1:SignedUnderTransform` "-42" under `ixt:num-dot-decimal`:
registry grammars admit no sign character → text fails its transform → fact DROPPED with
the untransformable-text note. Predicted totals 20 facts / 7 notes / identity, routing,
modal USD unchanged — the committed r6 golden matches on every item; the other three
expected JSONs are diff-confirmed untouched (96b3d9d..d74275e touches only
synthetic-min.json) and this pass re-ran the r6 reference on all FOUR fixtures:
byte-identical. **ZERO mismatches under r6; the delta is signed.**
