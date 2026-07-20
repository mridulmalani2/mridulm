# Logo assets for the landing-page ticker

Drop the files here with **these exact names** and they appear automatically —
no code change needed:

| File | Shows as |
|---|---|
| `hec-paris.png` | HEC |
| `reliance.png` | RIL |
| `indiamart.png` | IMART |
| `chanakya.png` | CWC |
| `earlyseed.png` | ESV |
| `ashoka.png` | ASHOKA |
| `infoedge-cfe.png` | CFE |
| `global-healthx.png` | GHX |
| `mantra-launchspace.png` | MANTRA |
| `india-france.png` | IN·FR |

Prefer **SVG** if you have it — just change the extension in
[`data/ticker.ts`](../../data/ticker.ts) to match (e.g. `/logos/hec-paris.svg`).

## Guidelines

- **Transparent background** preferred; each logo sits in a white chip on the
  dark tape, so a white background also works.
- Rendered at **24px tall**, auto width, capped at 92px. Supply ~2–3× that
  (roughly 300×150) so it stays sharp on retina.
- **Crop tight** — trim surrounding whitespace, or the logo will look small
  next to the others.
- Use the company's official **press-kit / brand-page** asset where possible.
- The `india-france.png` entry is the crossed-flags image; a tightly cropped
  version of just the two flags works best at this size.

Until a file exists — or if a name doesn't match — that tile falls back to its
monogram, so a missing logo never renders as a broken image.
