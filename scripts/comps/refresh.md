# Refreshing the sector comps dataset (SPEC §21.3) — MANUAL, ANNUAL

Damodaran republishes the industry averages **once a year, in early January**. This is the one
manual step §21's design rests on, so it has a forcing function: the CI gate in
`tests/comps-regeneration.test.ts` **REDDENS once the committed vintage is more than 15 months
old** (§21.10(4)). A red there is the reminder to run this page.

The repo's `exceljs` cannot read Damodaran's legacy BIFF8 `.xls` (it returns zero worksheets),
so conversion happens **offline, here** — never at runtime and never in the build.

## Steps

1. Download the four VENDORED regions (the only ones a deal can select — §21.6; Global,
   Emerging and China are deliberately NOT vendored because currency is coerced to the five
   modelled values, so no deal can reach them):

   ```bash
   cd /tmp && for r in "US:vebitda" "Europe:vebitdaEurope" "Japan:vebitdaJapan" "India:vebitdaIndia"; do
     curl -sL -o "${r%%:*}.xls" "https://pages.stern.nyu.edu/~adamodar/pc/datasets/${r##*:}.xls"
   done
   ```

2. Convert to CSV with LibreOffice (any tool is fine as long as the byte layout matches — the
   SHA gate below is the check):

   ```bash
   soffice --headless --convert-to csv:"Text - txt - csv (StarCalc)":"44,34,76,1,,0,false,true,true,false,false,-1" --outdir /tmp/conv /tmp/*.xls
   ```

   Each workbook yields `<Region>-Industry Averages.csv` (the sheet we use) and a
   `Variables & FAQ.csv` (not vendored — read it, it documents the source's own method).

3. Copy the `Industry Averages` sheet for each region to `data/comps/raw/<Region>.csv`.

4. Regenerate and re-pin:

   ```bash
   python3 scripts/comps/derive_bands.py          # rewrites data/comps/bands.json
   shasum -a 256 data/comps/raw/*.csv             # paste into the table below
   npx vitest run tests/comps-regeneration.test.ts
   ```

5. **Re-adjudicate.** New numbers are NOT gospel until two independent blind passes sign them
   (§21.10(2), the `tests/goldens/DERIVATION.md` method). At minimum re-derive the pinned
   sample: the Japan Real Estate discriminator, US Financial Services, US Real Estate,
   US Consumer and the `Other` scalar. If the vintage changed the constituent set, check the
   §21.5 map still has **94 mapped / 0 unmapped / 0 phantom** — `derive_bands.py` asserts it.

## Committed vintage and integrity

Source: `https://pages.stern.nyu.edu/~adamodar/pc/datasets/vebitda*.xls`
Vintage (from each file's own `Date updated` cell): **5 Jan 26**

| region | source file | SHA-256 of the vendored CSV |
|---|---|---|
| US | `vebitda.xls` | `acdcf15ee968468dca0e976d86cccc80fe35ca3ed7889de80ff0a88aee5b2cc4` |
| Europe | `vebitdaEurope.xls` | `e55066e0d7195f04f0db3d8f7632706fd691f581b27f4c13064eafb04da2a189` |
| Japan | `vebitdaJapan.xls` | `5c22303d4f714eb33b32164f8387e8d4a01052d6a10c5a11c521d77f3dd6f009` |
| India | `vebitdaIndia.xls` | `835a077306a424fcaf22c82a713b47d973d88a4f5feda86ee167ac3eca1f0fbc` |

## Things that will bite you

- **The two source typos are part of the join key** — `Rubber& Tires` (no space) and
  `Heathcare Information and Technology` (sic). "Correcting" either in `sector-map.json` makes
  the join fail LOUDLY (the coverage assert), which is the intended behaviour, not a bug.
- **China and India publish a DUPLICATE `Total Market (without financials)` row** with different
  values (India: 17.56 and 16.35). §21.5 takes the FIRST in file order; `derive_bands.py`
  implements that. Do not "de-duplicate" by keeping the last.
- **`Number of firms` is one column serving BOTH ratio blocks** — it is the industry population,
  including firms outside the positive-EBITDA aggregate. Never relabel it as a positive-EBITDA
  count (§21.4/§21.9).
- Values that are `NA`, `<= 0` (live: Japan `Insurance (Life)` −9.78x) or on an `n = 0` row are
  excluded from BOTH the value set and the weight total.
