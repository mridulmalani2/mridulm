import React from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

/**
 * Ambient "passion motifs" — soft, blurred, pastel art in the same visual
 * language as the hero's flag corners. Each one hints at a part of who Mridul
 * is (finance, cars, basketball, travel) and lives behind a section heading.
 *
 * Ground rules, so they add character without turning gimmicky:
 *  • decorative only: aria-hidden, no tab stops, (almost) no pointer events
 *  • pastel + blur + dissolve — never saturated blocks
 *  • motion is gentle and respects prefers-reduced-motion via the app-level
 *    MotionConfig (transform animations are dropped automatically)
 */

/* ── Finance — an ascending pastel chart line (Projects) ─────────────────── */

export const FinanceMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
    {/* soft wash behind the line, echoing the flag-corner language */}
    <div
      className="absolute -inset-10 opacity-60 blur-2xl"
      style={{
        background:
          'radial-gradient(closest-side, rgba(142,197,255,0.35), rgba(185,167,255,0.18), transparent)',
      }}
    />
    <svg viewBox="0 0 320 180" className="relative h-auto w-full">
      <defs>
        <linearGradient id="fin-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8EC5FF" />
          <stop offset="1" stopColor="#B9A7FF" />
        </linearGradient>
        <linearGradient id="fin-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(142,197,255,0.30)" />
          <stop offset="1" stopColor="rgba(142,197,255,0)" />
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
        r="6"
        fill="#B9A7FF"
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 1.4, duration: 0.4 }}
      />
    </svg>
  </div>
);

/* ── Basketball — pastel ball with seams, floats and bounces on hover ────── */

export const BasketballMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <motion.div
    aria-hidden="true"
    className={`absolute ${className}`}
    animate={{ y: [0, -8, 0] }}
    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    whileHover={{ scale: 1.12, rotate: 10 }}
  >
    <div
      className="absolute -inset-4 rounded-full opacity-60 blur-2xl"
      style={{ background: 'radial-gradient(closest-side, rgba(255,181,107,0.5), transparent)' }}
    />
    {/* ball body as CSS so no SVG gradient defs are needed */}
    <div
      className="relative h-full w-full rounded-full"
      style={{
        background: 'radial-gradient(circle at 35% 30%, #FFD2A3, #F9A55C 75%)',
        boxShadow: '0 10px 24px -12px rgba(162,86,0,0.45)',
      }}
    >
      <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="rgba(162,86,0,0.35)" strokeWidth="2.5">
          <path d="M2 48 H94" />
          <path d="M48 2 V94" />
          <path d="M15 15 C 36 34, 36 62, 15 81" />
          <path d="M81 15 C 60 34, 60 62, 81 81" />
        </g>
      </svg>
    </div>
  </motion.div>
);

/* ── Travel — dashed flight path with a paper plane (Contact, 404) ───────── */

export const TravelMotif: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
    <div className="relative">
      <svg viewBox="0 0 360 160" className="h-auto w-full">
        {/* dotted trail — faded in rather than "drawn": framer's pathLength
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

/* ── Car — a small silhouette that rides the career-timeline track ────────
   Colour comes from currentColor so callers set it with a text-* class. */

export const CarGlyph: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 64 26" className={className} aria-hidden="true">
    <path
      d="M3 19 C 5 13, 11 12, 17 11 C 22 5.5, 30 4.5, 37 6 C 43 7, 46 9, 49 11.5 C 55 12.5, 60 15, 61 18.5 L 61 20 L 3 20 Z"
      fill="currentColor"
    />
    <circle cx="15" cy="20" r="4.5" fill="currentColor" />
    <circle cx="47" cy="20" r="4.5" fill="currentColor" />
    <circle cx="15" cy="20" r="1.6" fill="#FDFCFA" />
    <circle cx="47" cy="20" r="1.6" fill="#FDFCFA" />
  </svg>
);
