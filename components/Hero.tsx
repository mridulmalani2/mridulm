import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Clean white hero backdrop. The Indian tricolour (saffron/white/green) melts
 * out of the top-left corner and the French tricolour (blue/white/red) out of
 * the top-right — soft pastel bands, heavily blurred and radially masked so
 * both dissolve into the canvas. Pure CSS; swap in a generated image later if
 * desired (see docs/hero-image-prompt.md).
 */
const FlagCornersBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none bg-canvas" aria-hidden="true">
    {/* India — horizontal saffron/white/green, dissolving out of the top-left.
        The tricolour fades via its own gradient tail plus a generous radial
        mask, so all three bands stay legible before melting into white. */}
    <div
      className="absolute left-0 top-0 h-[10rem] w-[9rem] md:h-[22rem] md:w-[20rem]"
      style={{
        background:
          'linear-gradient(to bottom, rgba(255,153,71,0.62) 0%, rgba(255,166,85,0.58) 30%, rgba(255,255,255,0.85) 40%, rgba(255,255,255,0.85) 46%, rgba(101,192,132,0.52) 56%, rgba(96,190,128,0.50) 78%, rgba(96,190,128,0) 94%)',
        WebkitMaskImage:
          'radial-gradient(140% 120% at 0% 0%, black 38%, rgba(0,0,0,0.5) 68%, transparent 98%)',
        maskImage:
          'radial-gradient(140% 120% at 0% 0%, black 38%, rgba(0,0,0,0.5) 68%, transparent 98%)',
        filter: 'blur(14px)',
      }}
    />

    {/* France — vertical blue/white/red, dissolving out of the top-right */}
    <div
      className="absolute right-0 top-0 h-[10rem] w-[11rem] md:h-[22rem] md:w-[28rem]"
      style={{
        background:
          'linear-gradient(to left, rgba(255,110,140,0.58) 0%, rgba(255,124,150,0.52) 26%, rgba(255,255,255,0.92) 40%, rgba(255,255,255,0.92) 56%, rgba(108,175,255,0.55) 68%, rgba(96,168,255,0.52) 84%, rgba(96,168,255,0) 100%)',
        WebkitMaskImage:
          'radial-gradient(150% 150% at 100% 0%, black 40%, rgba(0,0,0,0.5) 70%, transparent 100%)',
        maskImage:
          'radial-gradient(150% 150% at 100% 0%, black 40%, rgba(0,0,0,0.5) 70%, transparent 100%)',
        filter: 'blur(12px)',
      }}
    />
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
      <FlagCornersBackdrop />

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
