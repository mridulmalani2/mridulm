# Hero background — image-generation prompt

The hero currently ships a **pure-CSS** backdrop (`FlagDiagonalBackdrop` in
[`components/Hero.tsx`](../components/Hero.tsx)): the page divides diagonally,
with the Indian tricolour (plus a soft Ashoka Chakra) filling the left and the
French tricolour filling the right, both feather-light and meeting in a
luminous seam. Nothing is blocked on an image. If you'd rather use a generated
illustration, produce one with the prompt below and drop it in — it's a
one-line swap.

## How to swap it in

1. Generate the image (Gemini / Imagen / Midjourney — prompt below).
2. Save it to `public/hero-flags.jpg` (landscape, ≥ 2400×1400, < 400 KB after
   compression).
3. In `components/Hero.tsx`, inside `FlagCornersBackdrop`, add as the **first**
   layer (keep the two CSS corner divs or remove them once the image covers it):
   ```tsx
   <img src="/hero-flags.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
   ```

## The prompt

> A wide, minimal, luxurious background illustration on a **warm near-white
> (#FDFCFA) canvas**, divided **diagonally** with a soft luminous seam. The
> **left half** is the Indian flag as watercolour mist — extremely pale
> horizontal bands of **saffron**, **white**, and **green**, with a very
> faint navy **Ashoka Chakra** (24-spoke wheel) resting in the white band.
> The **right half** is the French flag the same way — extremely pale
> vertical bands of **blue**, **white**, and **rose-red**. Both flags fill
> their halves edge-to-edge but stay feather-light, almost white in the
> centre so dark text remains readable. Elegant, editorial, dreamy. No
> fabric, no poles, no text, no figures. Subtle film grain. 3:2 landscape.

## Guardrails

- **Corners only** — the middle of the frame must stay near-white so the name,
  photo, and quote read at ≥ 4.5:1.
- **Pastel, not saturated**; the fades should feel airy, not painted-on.
- **No literal flags** (no fabric, poles, borders) — just colour bands melting
  into white.
- Palette anchors: saffron `#FFB56B`, green `#86D69D`, sky `#8EC5FF`,
  rose `#FF9FB6` on canvas `#FDFCFA`.
