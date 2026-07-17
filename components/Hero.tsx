import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** The 24-spoke Ashoka Chakra, drawn minimally. Colour via currentColor. */
const AshokaChakra: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
    <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="7" />
    <circle cx="100" cy="100" r="11" fill="currentColor" />
    {Array.from({ length: 24 }, (_, i) => (
      <line
        key={i}
        x1="100"
        y1="100"
        x2="100"
        y2="13"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        transform={`rotate(${i * 15} 100 100)`}
      />
    ))}
  </svg>
);

/**
 * Full-bleed hero backdrop. The page is split by a single diagonal running
 * corner to corner — top-right down to bottom-left. The Indian tricolour
 * (horizontal saffron/white/green, Ashoka Chakra in the white band) holds the
 * upper-left of that line; the French tricolour (vertical blue/white/red)
 * holds the lower-right. Both are feather-light and dissolve into a soft seam.
 *
 * The masks use the `to bottom right` corner keyword deliberately: CSS's
 * magic-corner rule puts the transition band exactly through the other two
 * corners (top-right and bottom-left), so the seam tracks the real diagonal at
 * any aspect ratio rather than a fixed angle.
 *
 * Pure CSS; image swap option documented in docs/hero-image-prompt.md.
 */
const FlagDiagonalBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none bg-canvas" aria-hidden="true">
    {/* India — horizontal tricolour, upper-left of the diagonal. Bands read
        down the full left edge, which sits entirely inside this half. */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,150,64,0.44) 0%, rgba(255,163,82,0.34) 22%, rgba(255,255,255,0.40) 38%, rgba(255,255,255,0.40) 50%, rgba(101,192,132,0.36) 64%, rgba(90,187,124,0.34) 82%, rgba(90,187,124,0) 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom right, black 36%, transparent 66%)',
        maskImage: 'linear-gradient(to bottom right, black 36%, transparent 66%)',
      }}
    />

    {/* Ashoka Chakra — softened with a blur and a radial fade so it dissolves
        into the wash like everything else, rather than reading as an object. */}
    <div
      className="absolute left-[6%] top-[36%] h-28 w-28 text-[#2A4A9B] opacity-[0.13] md:left-[12%] md:top-[40%] md:h-44 md:w-44"
      style={{
        filter: 'blur(1.2px)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 52%, transparent 84%)',
        maskImage: 'radial-gradient(circle at center, black 52%, transparent 84%)',
      }}
    >
      <AshokaChakra className="h-full w-full" />
    </div>

    {/* France — vertical tricolour, lower-right of the diagonal. Bands are
        packed into the right-hand side so all three clear the seam and the
        centre halo (at full width the blue fell under both and vanished). */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(to right, rgba(74,150,255,0) 20%, rgba(74,150,255,0.44) 46%, rgba(96,168,255,0.38) 58%, rgba(255,255,255,0.40) 70%, rgba(255,255,255,0.40) 79%, rgba(255,120,148,0.34) 90%, rgba(255,102,134,0.46) 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom right, transparent 36%, black 66%)',
        maskImage: 'linear-gradient(to bottom right, transparent 36%, black 66%)',
      }}
    />

    {/* Legibility halo — tight enough to protect the name/quote without
        washing the flags out of the surrounding thirds. */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(30rem 20rem at 50% 52%, rgba(253,252,250,0.66), rgba(253,252,250,0.24) 58%, transparent 80%)',
      }}
    />

    {/* Fade into the page below the fold */}
    <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-canvas" />
  </div>
);

const NAME = ['Mridul', 'Malani'];

const Hero: React.FC = () => {
  const reduce = useReducedMotion();

  // Explicit per-character entrance. A running index across both words drives
  // the stagger delay directly, so it doesn't depend on framer-motion variant
  // propagation surviving the plain word wrappers.
  let charIndex = -1;

  return (
    <div className="relative w-full min-h-screen px-6 pt-28 pb-12 flex flex-col items-center justify-center">
      <FlagDiagonalBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center flex flex-col items-center max-w-4xl"
      >
        {/* Profile image — larger, framed for the light canvas */}
        <div className="relative mb-6 md:mb-8">
          <div
            className="absolute -inset-3 rounded-full opacity-70 blur-2xl"
            style={{
              background:
                'conic-gradient(from 210deg, #FFB56B, #7FE6C4, #8EC5FF, #FF9FB6, #FFB56B)',
            }}
            aria-hidden="true"
          />
          <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-full overflow-hidden ring-4 ring-white shadow-[0_20px_60px_-15px_rgba(26,26,34,0.35)]">
            <img
              src="/mridul-photo.jpeg"
              alt="Mridul Malani"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </div>

        {/* Name — 3D per-character entrance */}
        <h1
          aria-label="Mridul Malani"
          className="font-display font-black tracking-tight text-ink mb-5 leading-[0.95]"
          style={{ perspective: 700, fontSize: 'clamp(2.5rem, 8vw, 7rem)' }}
        >
          {NAME.map((word, wi) => (
            <span
              key={word}
              className="inline-block whitespace-nowrap"
              style={{ marginRight: wi === 0 ? '0.28em' : 0 }}
            >
              {word.split('').map((ch) => {
                charIndex += 1;
                const i = charIndex;
                return (
                  <motion.span
                    key={`${word}-${i}`}
                    className="inline-block"
                    style={{
                      transformStyle: 'preserve-3d',
                      transformOrigin: 'bottom',
                      color: wi === 1 ? '#A25600' : undefined,
                    }}
                    initial={
                      reduce
                        ? { opacity: 0 }
                        : { opacity: 0, rotateX: -85, y: '0.35em', z: -80 }
                    }
                    animate={
                      reduce
                        ? { opacity: 1 }
                        : { opacity: 1, rotateX: 0, y: 0, z: 0 }
                    }
                    transition={{
                      delay: 0.15 + i * 0.045,
                      duration: reduce ? 0.4 : 0.62,
                      ease: [0.2, 0.65, 0.3, 0.9],
                    }}
                  >
                    {ch}
                  </motion.span>
                );
              })}
            </span>
          ))}
        </h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="font-montserrat text-sm md:text-base tracking-[0.22em] text-muted uppercase mb-5"
        >
          HEC Paris MiM '27/28 • Corporate Finance and Private Markets
        </motion.p>

        {/* Quote */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.6 }}
          className="font-display italic text-ink/80 text-lg md:text-2xl max-w-2xl leading-relaxed mb-8"
        >
          I learn by building, and I build by doing. Currently at the intersection of finance, technology and entrepreneurship.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.6 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <a
            href="#projects"
            className="px-8 py-4 bg-saffron text-ink font-montserrat text-sm font-bold tracking-wider rounded-full hover:brightness-105 transition-all min-h-[48px] flex items-center shadow-[0_12px_30px_-10px_rgba(255,181,107,0.9)]"
          >
            View Projects
          </a>
          <a
            href="#contact"
            className="px-8 py-4 border border-ink/15 text-ink font-montserrat text-sm font-medium tracking-wider rounded-full hover:border-ink/40 hover:bg-ink/[0.03] transition-all min-h-[48px] flex items-center"
          >
            Get in Touch
          </a>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Hero;
