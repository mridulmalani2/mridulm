# Phase G-1 — three-issuer live walkthrough (template step 5)

**Run 2026-07-25** against the merged G-1 build (origin/main, SPEC v1.1.2) with REAL SEC
EDGAR data. The local dev build was paired with live filings through a temporary
`vite.config.ts` proxy to the deployed `/api/edgar` serverless function (the proxy is
version-independent — it only sets the SEC User-Agent and forwards; the proxy edit was
reverted after the run and never committed). The store was driven exactly as
`tests/engine2-workbench-smoke.test.tsx` drives it (`editAssumptions` → `build` →
read `ModelOutput`), so these are the engine's real outputs on real data, not mocks.

Per the PHASE_G standing rule: *"After every feature the three-issuer live walkthrough
(E-gate script) re-runs."* This is that re-run for G-1 (interim distributions + RP trap).

## Issuers

| # | Issuer | CIK | Form / basis | Currency | FY2025 revenue · EBITDA |
|---|---|---|---|---|---|
| 1 | Apple Inc. | 320193 | 10-K / US GAAP (large-cap) | USD | $416,161m · $144,748m |
| 2 | Crocs, Inc. | 1334036 | 10-K / US GAAP (mid-cap) | USD | $4,040.6m · $228.8m |
| 3 | SAP SE | 1000184 | 20-F / IFRS (foreign filer) | EUR | €36,800m · €10,928m |

All three imported cleanly through the real EDGAR pipeline (companyfacts + submissions +
best-effort quote, all HTTP 200). US GAAP via `mapXbrl`, IFRS via `mapCompanyFactsIfrs`.

## What each issuer confirmed

**Baseline (no distributions) — every issuer:** all 10 output tabs render; no `9999`
sentinel, no `NaN`, no `undefined`, no raw ≥8dp float in the DISPLAYED DOM (raw ModelOutput
legitimately carries full-precision floats — §15 rounds only at the `lib/format` boundary,
confirmed). The `entry_gross_leverage_fy` label renders as **"Total leverage (gross, x FY
EBITDA)"** on all three (the #104/#105 fix, on real data incl. EUR). With NO distribution
schedule set, NEITHER the "Interim distributions" table NOR the DPI/payback headline
appears — a pre-v1.1.0 deal is byte-identical on screen (default-OFF verified on live data).

**Apple — distributions ON, trap OFF then binding.**
- Trap OFF, requested [30000×5]: paid [30000×5] (Apple has ample cash above the floor —
  "cash above floor" rises 31,481→73,062), `rp_max` N/A every year (never a sentinel), DPI
  monotone 0.028→0.140, payback N/A (distributions ALONE never reach the huge sponsor
  check — exit correctly excluded, the L-10 lesson). Sponsor IRR **15.206% period-end vs
  15.348% mid-year** (the §1 timing lift; and up from the no-distribution 14.7% — earlier
  cash raises IRR). Summary headlines "DPI (distributions ÷ check) 0.1x · Payback
  (distributions alone)". Debt-tab "Interim distributions" table renders with the correct
  §15-formatted values and the "RP capacity = N/A" column.
- Trap ON at 0.5x (below the deal's 4.4x→1.9x net-leverage path): paid [0×5], `rp_max`
  [0×5] (full lockdown — the §3.7 money form at a level far under running leverage), all
  five years blocked, DPI 0, and EXACTLY ONE coherence WARN: *"Restricted-payment trap
  blocks distributions in years 1, 2, 3, 4, 5 — cash was available but the pro-forma
  net-leverage test was not met; blocked capacity does NOT carry forward (§3.7)."*

**Crocs — all four cap branches on ONE real deal.** Requested [81×5] (2% of revenue),
trap at 2.04x (the deal's Y3 net leverage; path [3.66, 2.78, 2.04, 1.58, 1.14]):
paid **[0, 0, 1, 81, 81]** — Y1/Y2 fully trap-blocked, **Y3 PARTIALLY blocked (1 of 81 —
the hard branch)**, Y4/Y5 request-capped; `rp_max` [0, 0, 1, 305, 606]; blocked
[T, T, T, F, F]; DPI monotone 0→0.093. Coherence: `distribution_blocked` WARN plus a
legitimate `negative_ppe` WARN (Crocs's suggested D&A vs capex rolls PP&E negative — the §8
roll working, not a G-1 issue). Display clean.

**SAP — IFRS/EUR, and the MISSING gate.** On import, `maint_capex_pct_revenue` surfaced as
**MISSING** (SAP's IFRS companyfacts has no clean maintenance-capex tag) and GATED Build —
surfaced, never defaulted. After confirming it (badge → TEMPLATE, never "from the filing"),
the deal built (EUR, IRR 12.83%, net leverage 4.28x→1.62x). Requested [736×5] (2% of
revenue), trap at 3.0x: paid **[0, 0, 444, 736, 736]** — the SAME fully→partially→
request-capped pattern as Crocs, now on IFRS/EUR data, with **Y3 landing net leverage
exactly on the 3.0 trap after paying 444**; `rp_max` [0, 0, 444, 9202, 18884]; blocked
[T, T, T, F, F]; sponsor IRR 12.86% period-end vs 12.88% mid-year. Coherence:
`distribution_blocked` coexisting correctly with SAP's legitimate `ppe_seeded_at_zero` +
`negative_ppe` flags (no net-PP&E tag in the IFRS filing — the honest D-layer/§8 response).
Display clean (incl. the € currency block — never a borrowed `$`).

## Verdict

The G-1 feature behaves correctly on all three real filings — US GAAP large-cap and
mid-cap, and IFRS 20-F — across USD and EUR. Every cap branch (fully blocked / partially
blocked / cash-capped / request-capped), the DPI/payback de-degeneration, the mid-year
timing lift, the coherence WARN, and the default-OFF invariant were each observed on live
data. The pre-existing honest flags (MISSING capex gate, `ppe_seeded_at_zero`,
`negative_ppe`) all fired correctly and coexisted with the new distribution surfaces
without interference. No wrong number, no sentinel, no raw float reached any displayed
surface.
