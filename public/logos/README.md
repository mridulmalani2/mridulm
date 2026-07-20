# Logo assets for the landing-page ticker

Drop company logos here, then point at them from `data/ticker.ts`:

```ts
{ name: 'Reliance Industries', mark: 'RIL', note: '…', tint: '…',
  logo: '/logos/reliance.svg' }
```

**Guidelines**
- SVG preferred; otherwise transparent PNG at ~2x the rendered size (≈88px tall).
- Use the company's official press-kit / brand-page asset, not a web grab —
  those are the versions published for exactly this use and they look sharper.
- Monochrome or full-colour both work; tiles are white so either reads well.
- Until a `logo` is set (or if the path 404s) the tile falls back to the
  monogram automatically, so nothing breaks while assets are pending.
