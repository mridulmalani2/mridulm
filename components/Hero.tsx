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
 * Full-bleed hero backdrop: the page divides diagonally — the Indian tricolour
 * (horizontal saffron/white/green, with the Ashoka Chakra in the white band)
 * holds the left, the French tricolour (vertical blue/white/red) holds the
 * right, meeting in a soft luminous seam. Everything is kept feather-light so
 * the content stays crisp; a white halo guards legibility at the centre.
 * Pure CSS; image swap option documented in docs/hero-image-prompt.md.
 */
const FlagDiagonalBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none bg-canvas" aria-hidden="true">
    {/* India — horizontal tricolour filling the left of the diagonal */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,153,71,0.34) 0%, rgba(255,166,85,0.26) 28%, rgba(255,255,255,0.55) 38%, rgba(255,255,255,0.55) 56%, rgba(101,192,132,0.24) 68%, rgba(96,190,128,0.32) 100%)',
        WebkitMaskImage: 'linear-gradient(108deg, black 40%, transparent 60%)',
        maskImage: 'linear-gradient(108deg, black 40%, transparent 60%)',
      }}
    />

    {/* Ashoka Chakra — resting in the white band of the Indian half */}
    <div className="absolute left-[4%] top-[35%] h-24 w-24 text-[#26428B] opacity-[0.15] md:left-[11%] md:top-[38%] md:h-44 md:w-44">
      <AshokaChakra className="h-full w-full" />
    </div>

    {/* France — vertical tricolour filling the right of the diagonal */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(to right, rgba(96,168,255,0.36) 0%, rgba(112,178,255,0.30) 52%, rgba(255,255,255,0.55) 61%, rgba(255,255,255,0.55) 71%, rgba(255,124,150,0.24) 82%, rgba(255,110,140,0.34) 100%)',
        WebkitMaskImage: 'linear-gradient(108deg, transparent 40%, black 60%)',
        maskImage: 'linear-gradient(108deg, transparent 40%, black 60%)',
      }}
    />

    {/* White halo so the name/quote sit on near-white */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(42rem 32rem at 50% 46%, rgba(253,252,250,0.72), rgba(253,252,250,0.30) 55%, transparent 78%)',
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
