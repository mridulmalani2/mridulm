/**
 * Landing-page ticker content.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MRIDUL - logos live in public/logos/ and are wired up below. To swap one,
 *  drop the new file in that folder and update its `logo:` path here.
 *
 *  If a path is wrong or the file is missing, that entry simply shows no logo
 *  chip (just the symbol) rather than a broken image - see LogoTicker.
 *
 *  Order below = display order. Biggest / most finance-relevant names first.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface TickerCompany {
  /** Short mono symbol, ticker-style. */
  symbol: string;
  /** Full name - used for the tooltip/aria label. */
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
    logo: '/logos/HEC.png',
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
    logo: '/logos/IM.png',
  },
  {
    symbol: 'CWC',
    name: 'Chanakya Wealth Creation',
    period: "'24",
    status: 'past',
    mark: 'CW',
    logo: '/logos/chanakya.webp',
  },
  {
    symbol: 'ESV',
    name: 'Earlyseed Ventures',
    period: "'23–24",
    status: 'past',
    mark: 'ES',
    logo: '/logos/early.png',
  },
  {
    symbol: 'ASHOKA',
    name: 'Ashoka University',
    period: "'22–25",
    status: 'past',
    mark: 'AU',
    logo: '/logos/AU.png',
  },
  {
    symbol: 'CFE',
    name: 'InfoEdge Centre for Entrepreneurship',
    period: "'23–25",
    status: 'past',
    mark: 'CFE',
    logo: '/logos/cfe.png',
  },
  {
    symbol: 'GHX',
    name: 'Global HealthX',
    period: "'25",
    status: 'past',
    mark: 'GHX',
    logo: '/logos/globalhealthx.png',
  },
  {
    symbol: 'MANTRA',
    name: 'Mantra Launchspace',
    period: "'24–25",
    status: 'past',
    mark: 'ML',
    logo: '/logos/mls.png',
  },
  {
    symbol: 'IN·FR',
    name: 'India × France',
    period: 'HOME',
    status: 'current',
    mark: '🇮🇳',
    logo: '/logos/indfra-crop.png',
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
