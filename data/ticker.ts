/**
 * Landing-page ticker content.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MRIDUL — to add a real logo:
 *   1. Drop the file in  public/logos/   (SVG preferred, else transparent PNG)
 *   2. Set  logo: '/logos/reliance.svg'  on that entry below
 *  Until then each tile renders a clean monogram, and if a logo path 404s the
 *  tile falls back to the monogram automatically — so nothing ever breaks.
 *
 *  Prefer official press-kit / brand-page assets over web grabs: they're the
 *  versions companies publish for exactly this use, and they look sharper.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface TickerCompany {
  name: string;
  mark: string; // monogram shown until a logo is supplied
  note: string; // small line under the name (role or context)
  tint: string; // pastel accent for the monogram chip
  logo?: string; // e.g. '/logos/reliance.svg'
}

export interface TickerInterest {
  label: string;
  icon: 'car' | 'plane' | 'basketball' | 'cricket' | 'markets' | 'film' | 'code' | 'coffee';
  tint: string;
}

export const TICKER_COMPANIES: TickerCompany[] = [
  { name: 'HEC Paris', mark: 'HEC', note: 'MiM · International Finance', tint: '#8EC5FF' },
  { name: 'Reliance Industries', mark: 'RIL', note: 'FC&A · Green Energy', tint: '#FFB56B' },
  { name: 'IndiaMART', mark: 'IM', note: 'Corporate Strategy', tint: '#7FE6C4' },
  { name: 'Chanakya Wealth', mark: 'CW', note: 'Portfolio Management', tint: '#B9A7FF' },
  { name: 'Global HealthX', mark: 'GHX', note: 'Accelerator & Fund', tint: '#FF9FB6' },
  { name: 'Earlyseed Ventures', mark: 'ES', note: 'Deal Sourcing', tint: '#FFE580' },
  { name: 'Ashoka University', mark: 'AU', note: 'B.Sc. Economics & Finance', tint: '#8EC5FF' },
];

export const TICKER_INTERESTS: TickerInterest[] = [
  { label: 'Cars', icon: 'car', tint: '#FFB56B' },
  { label: 'Travel', icon: 'plane', tint: '#8EC5FF' },
  { label: 'Basketball', icon: 'basketball', tint: '#FF9FB6' },
  { label: 'Cricket', icon: 'cricket', tint: '#7FE6C4' },
  { label: 'Markets', icon: 'markets', tint: '#B9A7FF' },
  { label: 'Cinema', icon: 'film', tint: '#FFE580' },
  { label: 'Vibe coding', icon: 'code', tint: '#8EC5FF' },
];
