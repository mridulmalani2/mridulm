# ixbrl fixtures — adjudication record (DERIVATION.md method; IXBRL_SPEC v1 r4, GRANTED @ fb8021e)

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
| routing | dimension-free us-gaap ≥5, ifrs-full 0 → **us-gaap** | ✓ |

**aapl-10k-trimmed.htm (REAL Workiva markup):** 210 `ix:nonFraction` + the dei identity `ix:nonNumeric` reads (216 kept elements) [element counts corrected by pass 2] → 176 deduped facts; the
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

## Pass 2 — independent hand-derivation (no access to ixbrl_ref.py or expected/)

_To be appended by the independent adjudicator._
