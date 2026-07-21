import React, { useEffect, useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from 'framer-motion';
import LogoTicker from './LogoTicker';

/**
 * Hero backdrop - "quiet ambition".
 *
 * Three ideas, no decoration:
 *  1. A fine graph-paper lattice - the visual grammar of terminals, models and
 *     spreadsheets. Precision, not ornament.
 *  2. Dawn light rising off the horizon line: warm at the top, clean below.
 *     Elevation and open sky rather than colour for colour's sake.
 *  3. A warm glow that tracks the cursor and locally lifts the grid, so the
 *     page responds to you and rewards moving through it.
 *
 * Near-monochrome by design: the ticker and the name accent are the only
 * places colour is spent.
 */
const HeroBackdrop: React.FC = () => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Start far off-canvas so nothing glows until the pointer actually arrives.
  const px = useMotionValue(-2000);
  const py = useMotionValue(-2000);
  const sx = useSpring(px, { stiffness: 55, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 55, damping: 18, mass: 0.6 });

  useEffect(() => {
    // Skip entirely for reduced-motion and for touch devices, where there is
    // no hover state to reward and the listener would just cost battery.
    if (reduce) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const el = ref.current;
    if (!el) return;

    let entered = false;

    const onMove = (e: PointerEvent) => {
      // Coordinates must be relative to the backdrop, not the viewport, or the
      // glow drifts out of alignment as soon as the page scrolls.
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      if (!entered) {
        // First sighting: snap the spring to the pointer. Without this it
        // eases all the way from the parked off-canvas position, so the glow
        // visibly flies in from the corner on the first mouse move.
        entered = true;
        sx.jump(x);
        sy.jump(y);
      }
      px.set(x);
      py.set(y);
    };
    const onLeave = () => {
      entered = false;
      px.set(-2000);
      py.set(-2000);
      sx.jump(-2000);
      sy.jump(-2000);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [reduce, px, py, sx, sy]);

  const glow = useMotionTemplate`radial-gradient(28rem 28rem at ${sx}px ${sy}px, rgba(255,163,66,0.30), rgba(255,181,107,0.11) 42%, transparent 72%)`;
  const gridReveal = useMotionTemplate`radial-gradient(21rem 21rem at ${sx}px ${sy}px, black 0%, rgba(0,0,0,0.45) 45%, transparent 72%)`;

  // Base lattice sits just at the edge of perception; the cursor layer uses a
  // stronger one so the grid visibly firms up under the pointer.
  const GRID =
    'linear-gradient(to right, rgba(26,26,34,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,26,34,0.055) 1px, transparent 1px)';
  const GRID_LIT =
    'linear-gradient(to right, rgba(26,26,34,0.115) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,26,34,0.115) 1px, transparent 1px)';

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden pointer-events-none bg-canvas"
      aria-hidden="true"
    >
      {/* Dawn light off the horizon - one warm hue, top-weighted */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,214,168,0.30) 0%, rgba(255,232,205,0.14) 22%, rgba(253,252,250,0) 52%)',
        }}
      />
      {/* the horizon itself: a wide, very low glow */}
      <div
        className="absolute -top-[38%] left-1/2 h-[75vh] w-[130vw] -translate-x-1/2 rounded-[50%] opacity-70 blur-[80px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(255,196,133,0.34), rgba(255,220,180,0.10) 55%, transparent)',
        }}
      />

      {/* Graph-paper lattice, faded out behind the type so nothing competes */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRID,
          backgroundSize: '64px 64px',
          WebkitMaskImage:
            'radial-gradient(ellipse 78% 62% at 50% 44%, transparent 22%, rgba(0,0,0,0.5) 58%, black 88%)',
          maskImage:
            'radial-gradient(ellipse 78% 62% at 50% 44%, transparent 22%, rgba(0,0,0,0.5) 58%, black 88%)',
        }}
      />

      {/* Cursor: a brighter patch of grid, revealed only near the pointer */}
      {!reduce && (
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: GRID_LIT,
            backgroundSize: '64px 64px',
            WebkitMaskImage: gridReveal,
            maskImage: gridReveal,
          }}
        />
      )}

      {/* Cursor: the warm light itself */}
      {!reduce && <motion.div className="absolute inset-0" style={{ background: glow }} />}

      {/* Legibility veil so the name and quote always sit on near-white */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(36rem 24rem at 50% 46%, rgba(253,252,250,0.86), rgba(253,252,250,0.40) 56%, transparent 80%)',
        }}
      />
    </div>
  );
};

const NAME = ['Mridul', 'Malani'];

const Hero: React.FC = () => {
  const reduce = useReducedMotion();

  // Explicit per-character entrance. A running index across both words drives
  // the stagger delay directly, so it doesn't depend on framer-motion variant
  // propagation surviving the plain word wrappers.
  let charIndex = -1;

  return (
    <div className="relative flex w-full min-h-[100svh] flex-col overflow-hidden">
      <HeroBackdrop />

      {/* Content takes the free space and centres inside it; the ticker keeps
          its natural height at the bottom of the fold. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-20 pb-4 text-center"
      >
        {/* Profile image - larger, framed for the light canvas */}
        <div className="relative mb-6 md:mb-8">
          {/* A neutral lift rather than a colour halo - the portrait should sit
              on the page, not glow. */}
          <div
            className="absolute -inset-6 rounded-full blur-2xl"
            style={{
              background:
                'radial-gradient(closest-side, rgba(26,26,34,0.10), transparent 72%)',
            }}
            aria-hidden="true"
          />
          <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden ring-1 ring-ink/10 shadow-[0_18px_45px_-18px_rgba(26,26,34,0.45)]">
            <img
              src="/mridul-photo.jpeg"
              alt="Mridul Malani"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </div>

        {/* Name - 3D per-character entrance */}
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
