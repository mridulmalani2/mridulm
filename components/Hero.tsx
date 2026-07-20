import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import LogoTicker from './LogoTicker';

/**
 * Optional Paris skyline wash along the bottom of the hero. Renders only if
 * public/hero-skyline.png exists — if it's absent the layer removes itself and
 * the aurora alone still reads as finished. See docs/hero-image-prompt.md.
 */
const SkylineLayer: React.FC = () => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src="/hero-skyline.png"
      alt=""
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[46vh] w-full object-cover object-bottom opacity-[0.14]"
      style={{
        // fade upward so the skyline emerges from the page rather than sitting on it
        WebkitMaskImage: 'linear-gradient(to top, black 4%, rgba(0,0,0,0.55) 45%, transparent 88%)',
        maskImage: 'linear-gradient(to top, black 4%, rgba(0,0,0,0.55) 45%, transparent 88%)',
      }}
    />
  );
};

/**
 * Hero backdrop: a minimal aurora. Three very large, very soft pastel blooms
 * drifting slowly on near-white — enough colour to feel considered, never
 * enough to compete with the type. The ticker below is the page's real colour
 * moment, so this stays deliberately quiet.
 *
 * Pure CSS; image swap option documented in docs/hero-image-prompt.md.
 */
const AuroraBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none bg-canvas" aria-hidden="true">
    {/* warm bloom, upper left */}
    <div
      className="absolute -left-[15%] -top-[25%] h-[70vh] w-[70vw] rounded-full opacity-70 blur-[90px]"
      style={{
        background:
          'radial-gradient(closest-side, rgba(255,181,107,0.55), rgba(255,229,128,0.22), transparent)',
        animation: 'aurora-a 34s ease-in-out infinite',
      }}
    />
    {/* cool bloom, upper right */}
    <div
      className="absolute -right-[18%] -top-[18%] h-[65vh] w-[62vw] rounded-full opacity-70 blur-[90px]"
      style={{
        background:
          'radial-gradient(closest-side, rgba(142,197,255,0.50), rgba(185,167,255,0.24), transparent)',
        animation: 'aurora-b 42s ease-in-out infinite',
      }}
    />
    {/* soft rose, lower centre-left — anchors the composition */}
    <div
      className="absolute -bottom-[28%] left-[8%] h-[60vh] w-[65vw] rounded-full opacity-60 blur-[100px]"
      style={{
        background:
          'radial-gradient(closest-side, rgba(255,159,182,0.42), rgba(127,230,196,0.20), transparent)',
        animation: 'aurora-c 38s ease-in-out infinite',
      }}
    />

    {/* Paris skyline, if supplied — sits under the veil so text stays crisp */}
    <SkylineLayer />

    {/* Legibility veil so the name and quote always sit on near-white */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(38rem 26rem at 50% 46%, rgba(253,252,250,0.80), rgba(253,252,250,0.35) 58%, transparent 82%)',
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
    <div className="relative flex w-full min-h-screen flex-col overflow-hidden">
      <AuroraBackdrop />

      {/* Content takes the free space and centres inside it; the ticker keeps
          its natural height at the bottom of the fold. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-20 pb-4 text-center"
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
          <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden ring-4 ring-white shadow-[0_20px_60px_-15px_rgba(26,26,34,0.35)]">
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
          className="font-display italic text-ink/80 text-lg md:text-2xl max-w-2xl leading-relaxed mb-6"
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

      {/* Where I've been, and what I'm into */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="relative z-10"
      >
        <LogoTicker />
      </motion.div>
    </div>
  );
};

export default Hero;
