import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Send } from 'lucide-react';

/**
 * Ambient "passion motifs" - soft, blurred, pastel art in the same visual
 * language as the hero's flag corners. Each one hints at a part of who Mridul
 * is (finance, cars, basketball, travel) and lives behind a section heading.
 *
 * Ground rules, so they add character without turning gimmicky:
 *  • decorative only: aria-hidden, no tab stops, (almost) no pointer events
 *  • pastel + blur + dissolve - never saturated blocks
 *  • motion is gentle and respects prefers-reduced-motion via the app-level
 *    MotionConfig (transform animations are dropped automatically)
 */

/* ── Finance - an ascending pastel chart line (Projects) ─────────────────── */

export const FinanceMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
    {/* faint tonal wash, single hue - no pastel blend */}
    <div
      className="absolute -inset-10 opacity-50 blur-2xl"
      style={{
        background: 'radial-gradient(closest-side, rgba(47,75,124,0.16), transparent 72%)',
      }}
    />
    <svg viewBox="0 0 320 180" className="relative h-auto w-full">
      <defs>
        <linearGradient id="fin-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2F4B7C" stopOpacity="0.45" />
          <stop offset="1" stopColor="#2F4B7C" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="fin-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(47,75,124,0.16)" />
          <stop offset="1" stopColor="rgba(47,75,124,0)" />
        </linearGradient>
      </defs>
      <motion.path
        d="M8 150 C 60 150, 70 112, 108 104 S 160 118, 196 84 S 258 34, 312 22"
        fill="none"
        stroke="url(#fin-line)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />
      <motion.path
        d="M8 150 C 60 150, 70 112, 108 104 S 160 118, 196 84 S 258 34, 312 22 L 312 180 L 8 180 Z"
        fill="url(#fin-fill)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 0.7, duration: 0.9 }}
      />
      <motion.circle
        cx="312"
        cy="22"
        r="5.5"
        fill="#2F4B7C"
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 1.4, duration: 0.4 }}
      />
    </svg>
  </div>
);

/* ── Travel - dashed flight path with a paper plane (Contact, 404) ───────── */

export const TravelMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
    <div className="relative">
      <svg viewBox="0 0 360 160" className="h-auto w-full">
        {/* dotted trail - faded in rather than "drawn": framer's pathLength
            animation overwrites stroke-dasharray, which would erase the dots */}
        <motion.path
          d="M12 140 C 90 152, 150 96, 200 72 S 300 40, 330 26"
          fill="none"
          stroke="rgba(101,152,224,0.85)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.5 9"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
      </svg>
      {/* plane at the end of the trail, drifting gently */}
      <motion.div
        className="absolute right-[2%] top-[4%]"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 1.3, duration: 0.6 }}
      >
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, 4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Send className="h-6 w-6 md:h-8 md:w-8 rotate-12 text-[#5F97E0]" strokeWidth={1.75} />
        </motion.div>
      </motion.div>
    </div>
  </div>
);

/* ── Car - a sleek coupe that rides the career-timeline track ─────────────
   A low grand-tourer silhouette with a glass greenhouse, a headlight, a warm
   under-glow and wheels that actually spin as it drives, plus a short speed
   trail streaming off the tail. Body colour comes from currentColor so callers
   set it with a text-* class; the accent is the saffron the timeline uses.
   Wheels hold still for reduced-motion. */

const SpinWheel: React.FC<{ cx: number; cy: number; reduce: boolean | null }> = ({
  cx,
  cy,
  reduce,
}) => (
  <g transform={`translate(${cx} ${cy})`}>
    <circle r="5.6" fill="currentColor" />
    <circle r="3.5" fill="#FDFCFA" />
    <motion.g
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      <rect x="-0.55" y="-3.3" width="1.1" height="6.6" rx="0.55" fill="currentColor" />
      <rect x="-3.3" y="-0.55" width="6.6" height="1.1" rx="0.55" fill="currentColor" />
      <rect x="-0.55" y="-3.3" width="1.1" height="6.6" rx="0.55" fill="currentColor" transform="rotate(45)" />
      <rect x="-0.55" y="-3.3" width="1.1" height="6.6" rx="0.55" fill="currentColor" transform="rotate(-45)" />
    </motion.g>
    <circle r="1.15" fill="currentColor" />
  </g>
);

export const CarGlyph: React.FC<{ className?: string }> = ({ className = '' }) => {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 92 34" className={className} aria-hidden="true">
      {/* speed trail streaming off the tail */}
      {!reduce && (
        <g stroke="#E8873A" strokeLinecap="round">
          {[
            { y: 15, w: 10, o: 0.5, d: 0 },
            { y: 20, w: 14, o: 0.35, d: 0.15 },
            { y: 25, w: 8, o: 0.28, d: 0.3 },
          ].map((l, i) => (
            <motion.line
              key={i}
              x1={2}
              x2={2 + l.w}
              y1={l.y}
              y2={l.y}
              strokeWidth="1.4"
              strokeOpacity={l.o}
              animate={{ x: [-3, -9], opacity: [l.o, 0] }}
              transition={{ repeat: Infinity, duration: 0.6, ease: 'easeOut', delay: l.d }}
            />
          ))}
        </g>
      )}

      {/* warm under-glow */}
      <ellipse cx="48" cy="30" rx="30" ry="3.4" fill="#FFB56B" opacity="0.35" />

      {/* body - low grand-tourer profile */}
      <path
        d="M12 26 C 12 20, 18 18, 24 17.5 C 30 12, 40 9.5, 52 10 C 61 10.4, 68 12.6, 74 16 C 80 16.4, 85 18.4, 86 22 C 86.6 24.4, 85.5 26, 83 26 Z"
        fill="currentColor"
      />
      {/* glass greenhouse */}
      <path d="M31 16.4 C 35 12.6, 42 11, 50 11.4 L 55 16.4 Z" fill="#FFB56B" opacity="0.55" />
      <path d="M57 16.4 L 52 11.5 C 58 12, 63 13.6, 67 16.4 Z" fill="#FFB56B" opacity="0.4" />
      {/* headlight */}
      <circle cx="83" cy="20.5" r="1.5" fill="#FFE580" />
      <circle cx="83" cy="20.5" r="3" fill="#FFE580" opacity="0.3" />

      <SpinWheel cx={30} cy={26} reduce={reduce} />
      <SpinWheel cx={70} cy={26} reduce={reduce} />
    </svg>
  );
};
