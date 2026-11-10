# Adversarial verification harness

Rerunnable tools from the 2026-11-10 adversarial review (findings and dispositions:
`rebuild/ADVERSARIAL_REVIEW_2026-11-10.md`). Not part of `npm test` — they need LibreOffice
(`soffice`) and, for phase 1, the course's reference workbook, which is not committed.
Run everything from the repo root. `W` is any scratch folder.

| Phase | What it proves | How |
|---|---|---|
| 1 | The engine reproduces the professor's model with its INPUTS randomized (formulas untouched) | `python3 scripts/adversarial/v1_make.py "<LBO and FTE - worked example.xlsx>" W/v1 40` → `soffice --headless --calc --convert-to xlsx --outdir W/v1r W/v1/v*.xlsx` → `python3 scripts/adversarial/v1_extract.py W/v1r W/v1/variants.json W/ref.json` → `npx tsx scripts/adversarial/v1_engine.ts W/v1/variants.json W/eng.json` → `python3 scripts/adversarial/compare.py W/ref.json W/eng.json moic_a,moic_b,ni` |
| 2 | The engine matches an INDEPENDENT first-principles challenger workbook (no engine code consulted) | `python3 scripts/adversarial/v5_make.py W/c 45 mixed` (or `stress`, `cap`) → recalc → `v4_extract.py` → `v4_engine.ts` → `compare.py … flags`. v5 = v4 + the tax character of retired debt (SPEC §7.1, v2.4.0); v4 encodes the pre-v2.4.0 rule and is kept to show the comparison discriminates (it now diverges). `v2_make.py`/`v3_make.py` are the earlier, narrower generations (v3/v4/v5 are DERIVED from them by the `make_v*_from_v*.py` scripts, every edit asserted to apply once). |
| 4 | Every input moves an output — or provably cannot | `npx tsx scripts/adversarial/every_input.ts`; the inert ones are proved by `verify_inert.ts` and `verify_carry.ts` |
| 5 | The exported workbook is LIVE: each input changed IN EXCEL recalculates to the engine | `npx tsx scripts/adversarial/wb_inputs.ts W/wb` → recalc `W/wb/*.xlsx` into `W/wbr` → `npx tsx scripts/adversarial/wb_compare.ts W/wb W/wbr` |
| 6 | No business assumption is hard-coded in the engine | `node scripts/adversarial/literals.cjs` (every numeric literal, comments excluded) |
| — | A fix is pinned by its tests | `node scripts/adversarial/mutate.mjs < mutants.json` — `[file, old, new, label]` per mutant; the FULL suite runs per mutant |

Comparisons are at 1e-9 relative (both sides are full-precision doubles); the workbook check
uses the parity suite's 1e-6. A green run means nothing unless the targeted paths were
exercised — each phase prints or can print its coverage counts; check them.
