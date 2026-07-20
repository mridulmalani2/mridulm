/**
 * Landing-page ticker content.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MRIDUL — the logo files go in  public/logos/  with these exact names:
 *
 *      hec-paris.png          reliance.png         indiamart.png
 *      chanakya.png           earlyseed.png        ashoka.png
 *      infoedge-cfe.png       global-healthx.png   mantra-launchspace.png
 *      india-france.png
 *
 *  SVG is better than PNG if you have it — just change the extension here to
 *  match. Transparent background preferred; the tile sits on white either way.
 *
 *  Until a file exists (or if a path is wrong) the tile shows its monogram
 *  instead, so a missing logo never renders as a broken image.
 *
 *  Order below = display order. Biggest / most finance-relevant names first.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface TickerCompany {
  /** Short mono symbol, ticker-style. */
  symbol: string;
  /** Full name — used for the tooltip/aria label. */
  name: string;
  /** Years, shown as the "quote" value. */
  period: string;
  /** `current` gets the green up-tick, `past` a neutral mark. */
  status: 'current' | 'past';
  /** Monogram fallback until a logo is dropped in. */
  mark: string;
  logo?: string;
}

export interface TickerInterest {
  label: string;
  icon: 'car' | 'plane' | 'basketball' | 'cricket' | 'markets' | 'film' | 'code' | 'coffee';
}

export const TICKER_COMPANIES: TickerCompany[] = [
  {
    symbol: 'HEC',
    name: 'HEC Paris',
    period: "'25–27",
    status: 'current',
    mark: 'HEC',
    logo: '/logos/hec-paris.png',
  },
  {
    symbol: 'RIL',
    name: 'Reliance Industries',
    period: "'23",
    status: 'past',
    mark: 'RIL',
    logo: '/logos/reliance.png',
  },
  {
    symbol: 'IMART',
    name: 'IndiaMART InterMESH',
    period: "'24",
    status: 'past',
    mark: 'IM',
    logo: '/logos/indiamart.png',
  },
  {
    symbol: 'CWC',
    name: 'Chanakya Wealth Creation',
    period: "'24",
    status: 'past',
    mark: 'CW',
    logo: '/logos/chanakya.png',
  },
  {
    symbol: 'ESV',
    name: 'Earlyseed Ventures',
    period: "'23–24",
    status: 'past',
    mark: 'ES',
    logo: '/logos/earlyseed.png',
  },
  {
    symbol: 'ASHOKA',
    name: 'Ashoka University',
    period: "'22–25",
    status: 'past',
    mark: 'AU',
    logo: '/logos/ashoka.png',
  },
  {
    symbol: 'CFE',
    name: 'InfoEdge Centre for Entrepreneurship',
    period: "'23–25",
    status: 'past',
    mark: 'CFE',
    logo: '/logos/infoedge-cfe.png',
  },
  {
    symbol: 'GHX',
    name: 'Global HealthX',
    period: "'25",
    status: 'past',
    mark: 'GHX',
    logo: '/logos/global-healthx.png',
  },
  {
    symbol: 'MANTRA',
    name: 'Mantra Launchspace',
    period: "'24–25",
    status: 'past',
    mark: 'ML',
    logo: '/logos/mantra-launchspace.png',
  },
  {
    symbol: 'IN·FR',
    name: 'India × France',
    period: 'HOME',
    status: 'current',
    mark: '🇮🇳',
    logo: '/logos/india-france.png',
  },
];

export const TICKER_INTERESTS: TickerInterest[] = [
  { label: 'Markets', icon: 'markets' },
  { label: 'Cars', icon: 'car' },
  { label: 'Travel', icon: 'plane' },
  { label: 'Basketball', icon: 'basketball' },
  { label: 'Cricket', icon: 'cricket' },
  { label: 'Cinema', icon: 'film' },
  { label: 'Vibe coding', icon: 'code' },
];
