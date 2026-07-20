import React, { useState } from 'react';
import { Car, Plane, TrendingUp, Film, Code2, Coffee } from 'lucide-react';
import {
  TICKER_COMPANIES,
  TICKER_INTERESTS,
  type TickerCompany,
  type TickerInterest,
} from '../data/ticker';

/* ── little inline marks for the sports lucide doesn't ship ──────────────── */

const BallBasketball: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19M12 2.5v19M5 5c3.6 3 3.6 11 0 14M19 5c-3.6 3-3.6 11 0 14" />
  </svg>
);

const BallCricket: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="8.5" cy="15.5" r="4.2" />
    <path d="M6.8 13.2a4.2 4.2 0 0 1 3.4-1.2M14 12.6 20.4 6.2a1.8 1.8 0 0 0 0-2.6 1.8 1.8 0 0 0-2.6 0L11.4 10" />
  </svg>
);

const ICONS: Record<TickerInterest['icon'], React.FC<{ className?: string }>> = {
  car: Car,
  plane: Plane,
  basketball: BallBasketball,
  cricket: BallCricket,
  markets: TrendingUp,
  film: Film,
  code: Code2,
  coffee: Coffee,
};

/* ── tiles ───────────────────────────────────────────────────────────────── */

const CompanyTile: React.FC<{ item: TickerCompany }> = ({ item }) => {
  // Fall back to the monogram if a logo path is missing or fails to load, so a
  // wrong filename degrades quietly instead of showing a broken image.
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!item.logo && !logoFailed;

  return (
    <div className="mx-2.5 flex w-[15.5rem] shrink-0 items-center gap-3.5 rounded-2xl border border-ink/10 bg-white/85 px-4 py-3.5 shadow-[0_10px_24px_-18px_rgba(26,26,34,0.55)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-ink/20 hover:shadow-[0_16px_30px_-16px_rgba(26,26,34,0.5)]">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl font-montserrat text-[11px] font-black tracking-tight text-ink"
        style={showLogo ? undefined : { background: `${item.tint}40` }}
      >
        {showLogo ? (
          <img
            src={item.logo}
            alt=""
            className="h-full w-full object-contain p-1"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          item.mark
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[15px] font-bold leading-tight text-ink">
          {item.name}
        </span>
        <span className="block truncate font-montserrat text-[10px] uppercase tracking-wider text-muted">
          {item.note}
        </span>
      </span>
    </div>
  );
};

const InterestTile: React.FC<{ item: TickerInterest }> = ({ item }) => {
  const Icon = ICONS[item.icon];
  return (
    <div
      className="mx-2 flex shrink-0 items-center gap-2.5 rounded-full border border-ink/10 px-4 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/20"
      style={{ background: `${item.tint}26` }}
    >
      <Icon className="h-4 w-4 shrink-0 text-ink/70" />
      <span className="whitespace-nowrap font-montserrat text-[11px] font-bold uppercase tracking-wider text-ink/80">
        {item.label}
      </span>
    </div>
  );
};

/* ── the band ────────────────────────────────────────────────────────────── */

interface RowProps {
  direction: 'left' | 'right';
  duration: number;
  children: React.ReactNode;
}

const Row: React.FC<RowProps> = ({ direction, duration, children }) => (
  <div
    className="ticker-row relative flex overflow-hidden"
    style={{
      // fade both ends into the page so items enter and leave, never pop
      WebkitMaskImage:
        'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
    }}
  >
    <div
      className="ticker-track flex w-max"
      style={{
        animationName: direction === 'left' ? 'ticker-scroll-left' : 'ticker-scroll-right',
        animationDuration: `${duration}s`,
      }}
    >
      {/* rendered twice — the -50% translate makes the seam invisible */}
      {children}
      {children}
    </div>
  </div>
);

const LogoTicker: React.FC = () => {
  const companies = TICKER_COMPANIES.map((c) => <CompanyTile key={c.name} item={c} />);
  const interests = TICKER_INTERESTS.map((i) => <InterestTile key={i.label} item={i} />);

  return (
    <div className="relative w-full select-none" aria-hidden="true">
      {/* A whisper of perspective so the band reads as a physical conveyor
          rather than flat text scrolling past. */}
      <div style={{ perspective: '900px' }}>
        <div
          className="flex flex-col gap-3"
          style={{ transform: 'rotateX(7deg)', transformStyle: 'preserve-3d' }}
        >
          <Row direction="left" duration={46}>
            {companies}
          </Row>
          <Row direction="right" duration={38}>
            {interests}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default LogoTicker;
