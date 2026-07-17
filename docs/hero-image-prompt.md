# Hero background — image-generation prompt

The hero currently ships a **pure-CSS** backdrop (`FlagCornersBackdrop` in
[`components/Hero.tsx`](../components/Hero.tsx)): a clean white canvas with the
Indian tricolour dissolving out of the top-left corner and the French tricolour
out of the top-right. Nothing is blocked on an image. If you'd rather use a
generated illustration, produce one with the prompt below and drop it in — it's
a one-line swap.

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

> A wide, minimal, luxurious background illustration on a **clean warm-white
> (#FDFCFA) canvas**. In the **top-left corner only**, the Indian flag —
> soft pastel **saffron**, **white**, and gentle **green** horizontal bands —
> dissolves diagonally into the white background like watercolour mist, heavily
> blurred, with no hard edges. In the **top-right corner only**, the French
> flag — pastel **blue**, **white**, and soft **rose-red** vertical bands —
> dissolves the same way, mirroring the left corner. The entire center and
> bottom two-thirds of the image stay **pure clean white** with generous
> negative space. Elegant, editorial, fashionable, dreamy. No literal flag
> shapes, no fabric, no poles, no text, no figures. Subtle film grain.
> 3:2 landscape.

## Guardrails

- **Corners only** — the middle of the frame must stay near-white so the name,
  photo, and quote read at ≥ 4.5:1.
- **Pastel, not saturated**; the fades should feel airy, not painted-on.
- **No literal flags** (no fabric, poles, borders) — just colour bands melting
  into white.
- Palette anchors: saffron `#FFB56B`, green `#86D69D`, sky `#8EC5FF`,
  rose `#FF9FB6` on canvas `#FDFCFA`.
