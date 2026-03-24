import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

/* ─── Section data ────────────────────────────────────────────── */

const SECTIONS = [
  {
    num: '01',
    title: 'The Deal',
    titleItalic: 'Room',
    tag: 'Research Reports',
    byline:
      'Investment memos, deal analyses, and deep-dive research on the transactions reshaping industries.',
    to: '/research/reports',
    cta: 'Enter the Deal Room',
    accentColor: '#CC0000',
    accentGlow: 'rgba(204,0,0,0.15)',
  },
  {
    num: '02',
    title: 'The',
    titleItalic: 'Toolkit',
    tag: 'Models & Frameworks',
    byline:
      'Financial models, analytical frameworks, and curated insights from the books and resources that sharpen the edge.',
    to: '/research/toolkit',
    cta: 'Open the Toolkit',
    accentColor: '#D4A843',
    accentGlow: 'rgba(212,168,67,0.15)',
  },
  {
    num: '03',
    title: 'The',
    titleItalic: 'Dispatch',
    tag: 'Weekly Analysis',
    byline:
      'One story. Every angle. Weekly essays connecting markets, geopolitics, and business strategy into critical perspective.',
    to: '/research/dispatch',
    cta: 'Read the Dispatch',
    accentColor: '#F5F5F0',
    accentGlow: 'rgba(245,245,240,0.08)',
  },
] as const;

/* ─── 3‑D Prism CTA ──────────────────────────────────────────── */

const DEPTH = 14; // px – visible 3D edge thickness

interface PrismProps {
  section: (typeof SECTIONS)[number];
  index: number;
}

const Prism3D: React.FC<PrismProps> = ({ section, index }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  // Mouse‑tracking rotation
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateY = useSpring(rawX, { stiffness: 150, damping: 20 });
  const rotateX = useSpring(rawY, { stiffness: 150, damping: 20 });

  // Floating idle animation offset (subtle bob)
  const floatY = useMotionValue(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 → 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      rawX.set(x * 20); // max ±10°
      rawY.set(-y * 14);
    },
    [rawX, rawY],
  );

  const handleMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
    setHovered(false);
  }, [rawX, rawY]);

  // Shadow reacts to tilt
  const shadowX = useTransform(rotateY, [-10, 10], [12, -12]);
  const shadowY = useTransform(rotateX, [-7, 7], [-8, 8]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{
        delay: 0.35 + index * 0.18,
        duration: 1,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="w-full"
    >
      <Link to={section.to} className="block group outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-black rounded">
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
          style={{ perspective: '900px' }}
          className="relative"
        >
          <motion.div
            style={{
              rotateX,
              rotateY,
              y: floatY,
              transformStyle: 'preserve-3d',
            }}
            animate={{
              y: hovered ? -6 : [0, -4, 0],
            }}
            transition={
              hovered
                ? { type: 'spring', stiffness: 300, damping: 22 }
                : { duration: 4 + index, repeat: Infinity, ease: 'easeInOut' }
            }
            className="relative"
          >
            {/* ── FRONT FACE ──────────────────────────── */}
            <div
              className="relative overflow-hidden transition-colors duration-500"
              style={{
                background: hovered
                  ? `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)`
                  : `linear-gradient(135deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.008) 100%)`,
                border: `1px solid ${hovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Accent top-edge */}
              <div
                className="absolute top-0 left-0 right-0 transition-all duration-700"
                style={{
                  height: '2px',
                  background: section.accentColor,
                  opacity: hovered ? 1 : 0.35,
                  boxShadow: hovered ? `0 0 20px ${section.accentGlow}` : 'none',
                }}
              />

              {/* Glow effect on hover */}
              <div
                className="absolute inset-0 transition-opacity duration-700 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 30% 20%, ${section.accentGlow} 0%, transparent 70%)`,
                  opacity: hovered ? 1 : 0,
                }}
              />

              <div className="relative z-10 p-8 md:p-10 lg:p-12">
                {/* Number + Tag row */}
                <div className="flex items-center gap-4 mb-10">
                  <span
                    className="font-mono text-[11px] font-medium tracking-[0.3em] transition-colors duration-500"
                    style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.2)' }}
                  >
                    {section.num}
                  </span>
                  <span className="w-8 h-px bg-white/10" />
                  <span
                    className="font-mono text-[9px] tracking-[0.25em] uppercase px-3 py-1 border transition-all duration-500"
                    style={{
                      borderColor: hovered ? section.accentColor + '60' : 'rgba(255,255,255,0.1)',
                      color: hovered ? section.accentColor : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {section.tag}
                  </span>
                </div>

                {/* Title */}
                <div className="mb-6">
                  <h2 className="font-playfair text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-white leading-[0.95] tracking-tight">
                    {section.title}{' '}
                    <span className="italic font-normal text-white/50 group-hover:text-white/70 transition-colors duration-500">
                      {section.titleItalic}
                    </span>
                  </h2>
                </div>

                {/* Byline */}
                <p className="font-lora text-[14px] md:text-[15px] leading-[1.7] text-white/35 group-hover:text-white/50 transition-colors duration-500 max-w-lg mb-10">
                  {section.byline}
                </p>

                {/* CTA */}
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono text-[10px] tracking-[0.2em] uppercase transition-all duration-500"
                    style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.3)' }}
                  >
                    {section.cta}
                  </span>
                  <motion.div
                    animate={{ x: hovered ? 6 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <ArrowRight
                      size={13}
                      style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.3)' }}
                      className="transition-colors duration-500"
                    />
                  </motion.div>
                </div>
              </div>
            </div>

            {/* ── RIGHT FACE (3D edge) ────────────────── */}
            <div
              className="absolute top-0 h-full transition-colors duration-500"
              style={{
                right: 0,
                width: `${DEPTH}px`,
                background: hovered
                  ? `linear-gradient(to left, ${section.accentColor}08, rgba(255,255,255,0.04))`
                  : 'linear-gradient(to left, rgba(255,255,255,0.01), rgba(255,255,255,0.025))',
                borderRight: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                borderTop: `1px solid ${hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
                borderBottom: `1px solid ${hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'}`,
                transform: `translateX(${DEPTH}px) rotateY(90deg)`,
                transformOrigin: 'left center',
              }}
            />

            {/* ── BOTTOM FACE (3D edge) ───────────────── */}
            <div
              className="absolute left-0 w-full transition-colors duration-500"
              style={{
                bottom: 0,
                height: `${DEPTH}px`,
                background: hovered
                  ? `linear-gradient(to top, ${section.accentColor}05, rgba(255,255,255,0.025))`
                  : 'linear-gradient(to top, rgba(255,255,255,0.005), rgba(255,255,255,0.015))',
                borderBottom: `1px solid ${hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
                borderLeft: `1px solid ${hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'}`,
                borderRight: `1px solid ${hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'}`,
                transform: `translateY(${DEPTH}px) rotateX(-90deg)`,
                transformOrigin: 'top center',
              }}
            />
          </motion.div>

          {/* ── Drop shadow (reacts to tilt) ──────────── */}
          <motion.div
            className="absolute inset-0 -z-10 rounded-sm"
            style={{
              x: shadowX,
              y: shadowY,
              filter: hovered ? 'blur(40px)' : 'blur(25px)',
              background: hovered ? section.accentGlow : 'rgba(0,0,0,0.3)',
              opacity: hovered ? 0.6 : 0.3,
              scale: 0.95,
            }}
          />
        </div>
      </Link>
    </motion.div>
  );
};

/* ─── Landing Page ────────────────────────────────────────────── */

const ResearchLanding: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-amber-500 selection:text-black overflow-hidden">
      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Ambient top glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none z-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse, rgba(204,0,0,0.08) 0%, transparent 70%)',
        }}
      />

      <main id="main-content" className="relative z-10 pt-32 md:pt-40 pb-20 md:pb-28">
        {/* ── Masthead ─────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mb-20 md:mb-28">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="border-t border-white/10 mb-6" />

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
              <div>
                <span className="font-mono text-[9px] tracking-[0.35em] uppercase text-white/20 block mb-3">
                  Mridul Malani &middot; Research
                </span>
                <h1 className="font-playfair text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[0.9] tracking-tight">
                  Research<br />
                  <span className="italic font-normal text-white/40">& Analysis</span>
                </h1>
              </div>

              <p className="font-lora text-[13px] md:text-[14px] leading-relaxed text-white/25 max-w-xs md:text-right">
                Institutional-quality thinking across deals, models, and the forces shaping markets.
              </p>
            </div>

            <div className="border-t border-white/10 mt-2" />
          </motion.div>
        </div>

        {/* ── 3D Section CTAs ──────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 space-y-8 md:space-y-10">
          {SECTIONS.map((section, i) => (
            <Prism3D key={section.num} section={section} index={i} />
          ))}
        </div>

        {/* ── Footer ───────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mt-20 md:mt-28">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <div className="border-t border-white/8 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-white/15">
                Vol. 1 &middot; 2025
              </span>
              <span className="font-lora text-[12px] italic text-white/15">
                In pursuit of better questions, not just better answers.
              </span>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default ResearchLanding;
