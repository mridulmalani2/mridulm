import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/**
 * Ambient Paris skyline behind the projects section.
 *
 * Mridul builds out of Paris (HEC), so the city sits quietly behind the work -
 * a faint sepia line-drawing anchored along the foot of the section, with a
 * warm dawn glow rising off the rooftops to fill the white space above where
 * the cards float. The skyline drifts a little slower than the page as you
 * scroll, so it reads as distance rather than decoration - depth without a
 * heavyweight 3D scene. Purely decorative: aria-hidden, no pointer events,
 * and the parallax is dropped for reduced-motion.
 */
const ParisBackdrop: React.FC = () => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  // The skyline lags the scroll; the glow lifts a touch the other way.
  const skylineY = useTransform(scrollYProgress, [0, 1], [48, -48]);
  const glowY = useTransform(scrollYProgress, [0, 1], [-24, 24]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Dawn light off the rooftops - warm, low, wide; fills the upper white
          space so the cards sit in a lit room rather than a blank one. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-[78%]"
        style={{
          y: reduce ? 0 : glowY,
          background:
            'radial-gradient(120% 82% at 50% 108%, rgba(255,193,128,0.30) 0%, rgba(255,214,170,0.14) 34%, rgba(253,252,250,0) 68%)',
        }}
      />

      {/* A faint horizon line the skyline stands on. */}
      <div
        className="absolute inset-x-0 bottom-[16%] h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(120,86,42,0.18) 22%, rgba(120,86,42,0.18) 78%, transparent)',
        }}
      />

      {/* The skyline itself - full-bleed, anchored to the foot, drifting slowly.
          Its top is transparent sky, so it dissolves on its own; a mask softens
          the very top edge just in case a stray line reaches up. */}
      <motion.img
        src="/logos/paris.png"
        alt=""
        decoding="async"
        className="absolute inset-x-0 bottom-0 w-full select-none"
        style={{
          y: reduce ? 0 : skylineY,
          opacity: 0.17,
          WebkitMaskImage: 'linear-gradient(to top, black 62%, transparent 100%)',
          maskImage: 'linear-gradient(to top, black 62%, transparent 100%)',
        }}
      />
    </div>
  );
};

export default ParisBackdrop;
