# Hero background — Paris skyline

The hero ships a pure-CSS **aurora** backdrop (`AuroraBackdrop` in
[`components/Hero.tsx`](../components/Hero.tsx)) plus an **optional Paris
skyline** layer along the bottom.

The skyline is opt-in and self-removing: if `public/hero-skyline.png` doesn't
exist, the layer unmounts itself and the aurora alone still looks finished. So
you can generate and drop the file in whenever — nothing breaks in the meantime,
and no code change is needed.

## How to add it

1. Generate the image with the prompt below (ChatGPT / DALL·E, Midjourney, or
   Gemini all work).
2. Save it as **`public/hero-skyline.png`**
   - wide landscape, ideally ~2400×1000
   - **transparent PNG** is best (a white background also works fine)
   - keep it under ~500 KB
3. That's it. Reload — the code already applies the fade, opacity, and mask.

The layer renders at **14% opacity** and is masked to fade upward, so even a
fairly bold image lands as a whisper. If you want it stronger or softer after
seeing it, change `opacity-[0.14]` in `SkylineLayer`.

## The prompt

> A wide panoramic **line-art illustration of the Paris skyline**, drawn as a
> single-weight minimal outline — no fills, no shading. Include the **Eiffel
> Tower** roughly one-third from the left, plus **Haussmann rooftops**, the
> **Sacré-Cœur** dome, the **Arc de Triomphe**, and a few chimneys and mansard
> roofs. Thin, elegant, continuous strokes in a **soft warm grey**, on a
> **transparent background**. The buildings sit along the **bottom edge** of
> the frame with lots of empty space above them. Architectural, editorial,
> minimal — like a fine fineliner drawing. **No colour, no sky, no text, no
> people, no border.** Very wide aspect ratio, about 12:5.

### If you want a softer, less literal version

> …same as above, but rendered as a **pale watercolour wash** of the Paris
> skyline in muted warm greys and the faintest blush, edges dissolving into
> white, no hard outlines.

## Guardrails

- **Bottom-weighted**: buildings along the bottom edge, empty above. The centre
  of the hero must stay clear — the name, photo, and quote live there.
- **No colour** (or barely any). The aurora provides the colour; the skyline is
  structure. A saturated skyline will fight it.
- **Line art beats a photo.** A photographic skyline gets muddy at 14% opacity;
  clean strokes stay legible.
- **No text or watermarks** — this sits behind your name.
