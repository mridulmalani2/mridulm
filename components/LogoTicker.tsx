import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/* ── one quote on the tape ───────────────────────────────────────────────── */

const Quote: React.FC<{ item: TickerCompany; onLogoShown?: () => void }> = ({
  item,
  onLogoShown,
}) => {
  // Opt-in rather than opt-out: the chip stays hidden until an image actually
  // decodes. A missing file can't be detected by onError alone — the SPA
  // rewrite serves index.html with a 200, so the request "succeeds" and only
  // fails at decode time. Gating on a real naturalWidth handles every case:
  // missing file, typo'd name, or corrupt image all just stay hidden.
  const [logoOk, setLogoOk] = useState(false);
  const isCurrent = item.status === 'current';

  // Tell the row once the chip is actually laid out. Measuring on the image's
  // own load event is too early — the chip only becomes visible after React
  // commits this state, so the row would measure its pre-chip width.
  useEffect(() => {
    if (logoOk) onLogoShown?.();
  }, [logoOk, onLogoShown]);

  return (
    <div className="flex shrink-0 items-center gap-3 px-5" title={item.name}>
      {/* logo sits in a white chip — how financial tickers show marks, and it
          keeps dark wordmarks (Chanakya, Earlyseed) legible on the dark tape.
          Until one loads we show no chip at all, rather than the monogram,
          which would just repeat the symbol sitting right next to it. */}
      {item.logo && (
        <span
          className={`h-8 shrink-0 items-center justify-center rounded bg-white px-2 ${
            logoOk ? 'flex' : 'hidden'
          }`}
        >
          {/* bound BOTH axes: these logos range from an 8.6:1 wordmark
              (Chanakya) to a stacked lockup (Reliance), so scale-to-fit keeps
              every mark inside the same chip without distorting any of them */}
          <img
            src={item.logo}
            alt=""
            className="max-h-6 max-w-[84px] object-contain"
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth > 0) setLogoOk(true);
            }}
            onError={() => setLogoOk(false)}
          />
        </span>
      )}

      <span className="font-mono text-[13px] font-bold uppercase tracking-[0.12em] text-white/95">
        {item.symbol}
      </span>

      <span
        className={`flex items-center gap-1 font-mono text-[12px] tracking-wider ${
          isCurrent ? 'text-[#5BD6A8]' : 'text-white/45'
        }`}
      >
        {isCurrent && <span aria-hidden="true">▲</span>}
        {item.period}
      </span>
    </div>
  );
};

const Divider: React.FC = () => (
  <span className="h-6 w-px shrink-0 self-center bg-white/12" aria-hidden="true" />
);

const InterestQuote: React.FC<{ item: TickerInterest }> = ({ item }) => {
  const Icon = ICONS[item.icon];
  return (
    <span className="flex shrink-0 items-center gap-2 px-4">
      <Icon className="h-3.5 w-3.5 text-white/35" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
        {item.label}
      </span>
    </span>
  );
};

/* ── the tape ────────────────────────────────────────────────────────────── */

const Row: React.FC<{
  direction: 'left' | 'right';
  duration: number;
  className?: string;
  /** Bump to force a re-measure after content changes size (e.g. logos appear). */
  remeasureKey?: number;
  children: React.ReactNode;
}> = ({ direction, duration, className = '', remeasureKey = 0, children }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(2);
  const [shift, setShift] = useState<number | null>(null);

  // Two things to get right, both of which were broken:
  //
  // 1. Repeat the group enough times to always cover the viewport, plus one
  //    more to scroll into. Two copies only suffices when a single group is
  //    already wider than the row — the interests row (~816px) is not, so on a
  //    wide screen it ran out mid-loop and left a visible gap.
  //
  // 2. Shift by an exact PIXEL width, not a percentage. The track is a flex
  //    item and gets shrunk by its container, so its used width is not
  //    copies x groupWidth (measured 5912 vs 6147). A percentage resolves
  //    against that shrunken width and lands short of one group, jumping on
  //    every loop.
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const group = groupRef.current;
      if (!row || !group) return;
      // fractional widths keep the loop from jittering by a sub-pixel each cycle
      const rowW = row.getBoundingClientRect().width;
      const groupW = group.getBoundingClientRect().width;
      if (!rowW || !groupW) return;
      setCopies(Math.max(2, Math.ceil(rowW / groupW) + 1));
      setShift(groupW);
    };
    measure();

    // Re-measure on any later size change (fonts settling, viewport resize).
    // Note this can't be the only safety net: ResizeObserver callbacks are
    // delivered with the frame loop, which is throttled in background tabs —
    // hence the explicit remeasureKey below.
    const ro = new ResizeObserver(measure);
    if (groupRef.current) ro.observe(groupRef.current);
    if (rowRef.current) ro.observe(rowRef.current);

    // Explicit listeners as well as the observer: these are event-driven, so
    // a viewport change still re-measures even when frame callbacks are being
    // throttled (background tab, low-power mode).
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('load', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('load', measure);
    };
    // `children` is deliberately not a dependency: it's a fresh array on every
    // render, and depending on it tore the observer down and rebuilt it
    // constantly, letting the logo-decode resize slip through the gap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remeasureKey]);

  return (
    <div ref={rowRef} className={`ticker-row relative flex overflow-hidden ${className}`}>
      <div
        className="ticker-track flex w-max shrink-0 items-center"
        style={
          {
            animationName: direction === 'left' ? 'ticker-scroll-left' : 'ticker-scroll-right',
            animationDuration: `${duration}s`,
            // exactly one group wide, so group 2 lands where group 1 began.
            // Hold the animation until measured, or the first cycle would run
            // against the -50% fallback and visibly jump.
            '--ticker-shift': shift === null ? '0px' : `-${shift}px`,
            animationPlayState: shift === null ? 'paused' : undefined,
          } as React.CSSProperties
        }
      >
        {Array.from({ length: copies }, (_, i) => (
          <div
            key={i}
            ref={i === 0 ? groupRef : undefined}
            className="flex shrink-0 items-center"
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
};

const LogoTicker: React.FC = () => {
  // Each logo that becomes visible widens the row, so count them and use the
  // count to trigger a re-measure after React has committed the layout.
  const [logosShown, setLogosShown] = useState(0);
  const handleLogoShown = useCallback(() => setLogosShown((n) => n + 1), []);

  const quotes = TICKER_COMPANIES.map((c) => (
    <React.Fragment key={c.symbol}>
      <Quote item={c} onLogoShown={handleLogoShown} />
      <Divider />
    </React.Fragment>
  ));

  const interests = TICKER_INTERESTS.map((i) => <InterestQuote key={i.label} item={i} />);

  return (
    <div
      className="relative w-full select-none border-y border-white/10 bg-[#15151C] shadow-[0_-10px_40px_-20px_rgba(26,26,34,0.5)]"
      aria-hidden="true"
    >
      {/* main tape — where I've been */}
      <Row direction="left" duration={52} className="py-3" remeasureKey={logosShown}>
        {quotes}
      </Row>

      {/* secondary tape — what I'm into, deliberately quieter */}
      <Row direction="right" duration={44} className="border-t border-white/[0.07] py-2">
        {interests}
      </Row>

      {/* soften both ends in the tape's own colour so items fade rather than
          hard-clip at the edges */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-16"
        style={{ background: 'linear-gradient(to right, #15151C, transparent)' }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-16"
        style={{ background: 'linear-gradient(to left, #15151C, transparent)' }}
      />
    </div>
  );
};

export default LogoTicker;
