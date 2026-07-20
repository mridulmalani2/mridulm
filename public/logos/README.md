# Logo assets for the landing-page ticker

These are wired up in [`data/ticker.ts`](../../data/ticker.ts) — each entry's
`logo:` field points at a file here.

| File | Ticker symbol |
|---|---|
| `HEC.png` | HEC |
| `reliance.png` | RIL |
| `IM.png` | IMART |
| `chanakya.webp` | CWC |
| `early.png` | ESV |
| `AU.png` | ASHOKA |
| `cfe.png` | CFE |
| `globalhealthx.png` | GHX |
| `mls.png` | MANTRA |
| `indfra-crop.png` | IN·FR |

## Swapping or adding one

1. Drop the file in this folder.
2. Update that entry's `logo:` path in `data/ticker.ts`.

Filenames are **case-sensitive** in production, so `HEC.png` ≠ `hec.png`.

## Notes

- Each logo renders inside a white chip at **max 24px tall / 84px wide**,
  scaled to fit — so both tall lockups and very wide wordmarks work without
  distortion.
- **Crop tight.** Surrounding whitespace makes a logo look shrunken next to
  the others. `indfra-crop.png` is the crossed-flags photo cropped to just the
  flags (the uncropped original had so much background it read as a smudge at
  this size).
- If a path is wrong or a file is missing, that entry shows **no chip at all**
  — just its symbol. It never renders a broken image. Note this can't rely on
  `onError`: the SPA rewrite answers missing files with `index.html` and a
  200, so the check is on whether the image actually decoded.
