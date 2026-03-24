import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

/* ─── Section data ────────────────────────────────────────────── */

const SECTIONS = [
  {
    num: '01',
    title: 'The Research',
    titleItalic: 'Report',
    tag: 'Research Reports',
    byline:
      'Investment memos, deal analyses, and deep-dive research on the transactions reshaping industries.',
    to: '/research/reports',
    cta: 'Read the Research Report',
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
    titleItalic: 'Newsletter',
    tag: 'Weekly Analysis',
    byline:
      'One story. Every angle. Weekly essays connecting markets, geopolitics, and business strategy into critical perspective.',
    to: '/research/newsletter',
    cta: 'Read the Newsletter',
    accentColor: '#F5F5F0',
    accentGlow: 'rgba(245,245,240,0.08)',
  },
] as const;

/* ─── 3‑D Prism CTA ──────────────────────────────────────────── */

const DEPTH = 10; // px – visible 3D edge thickness

interface PrismProps {
  section: (typeof SECTIONS)[number];
  index: number;
}

const Prism3D: React.FC<PrismProps> = ({ section, index }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateY = useSpring(rawX, { stiffness: 150, damping: 20 });
  const rotateX = useSpring(rawY, { stiffness: 150, damping: 20 });

  const floatY = useMotionValue(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      rawX.set(x * 20);
      rawY.set(-y * 14);
    },
    [rawX, rawY],
  );

  const handleMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
    setHovered(false);
  }, [rawX, rawY]);

  const shadowX = useTransform(rotateY, [-10, 10], [12, -12]);
  const shadowY = useTransform(rotateX, [-7, 7], [-8, 8]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{
        delay: 0.35 + index * 0.18,
        duration: 1,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="w-full h-full"
    >
      <Link to={section.to} className="block group outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-black rounded h-full">
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={handleMouseLeave}
          style={{ perspective: '900px' }}
          className="relative h-full"
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
            className="relative h-full"
          >
            {/* ── FRONT FACE ──────────────────────────── */}
            <div
              className="relative overflow-hidden transition-colors duration-500 h-full flex flex-col"
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
                  opacity: hovered ? 1 : 0.5,
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

              <div className="relative z-10 p-6 md:p-7 lg:p-8 flex flex-col flex-1">
                {/* Number + Tag row */}
                <div className="flex items-center gap-3 mb-6">
                  <span
                    className="font-mono text-[11px] font-medium tracking-[0.3em] transition-colors duration-500"
                    style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.45)' }}
                  >
                    {section.num}
                  </span>
                  <span className="w-6 h-px bg-white/20" />
                  <span
                    className="font-mono text-[9px] tracking-[0.2em] uppercase px-2.5 py-1 border transition-all duration-500"
                    style={{
                      borderColor: hovered ? section.accentColor + '60' : 'rgba(255,255,255,0.15)',
                      color: hovered ? section.accentColor : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    {section.tag}
                  </span>
                </div>

                {/* Title */}
                <div className="mb-4">
                  <h2 className="font-playfair text-2xl md:text-3xl lg:text-[2rem] font-bold text-white leading-[1] tracking-tight">
                    {section.title}<br />
                    <span className="transition-colors duration-500">
                      {section.titleItalic}
                    </span>
                  </h2>
                </div>

                {/* Byline */}
                <p className="font-lora text-[13px] leading-[1.65] text-white/55 group-hover:text-white/70 transition-colors duration-500 mb-8 flex-1">
                  {section.byline}
                </p>

                {/* CTA */}
                <div className="flex items-center gap-3 mt-auto">
                  <span
                    className="font-mono text-[10px] tracking-[0.2em] uppercase transition-all duration-500"
                    style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.5)' }}
                  >
                    {section.cta}
                  </span>
                  <motion.div
                    animate={{ x: hovered ? 6 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <ArrowRight
                      size={13}
                      style={{ color: hovered ? section.accentColor : 'rgba(255,255,255,0.5)' }}
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

      <main id="main-content" className="relative z-10 pt-28 md:pt-32 pb-8 md:pb-12 min-h-screen flex flex-col">
        {/* ── Masthead ─────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-5 md:px-8 w-full mb-10 md:mb-14">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="border-t border-white/15 mb-5" />

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-3">
              <div>
                <span className="font-mono text-[9px] tracking-[0.35em] uppercase text-white/40 block mb-2">
                  Mridul Malani &middot; Research
                </span>
                <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[0.9] tracking-tight">
                  Research<br />
                  <span className="italic font-normal text-white/55">& Analysis</span>
                </h1>
              </div>

              <p className="font-lora text-[13px] leading-relaxed text-white/45 max-w-xs md:text-right">
                Institutional-quality thinking across deals, models, and the forces shaping markets.
              </p>
            </div>

            <div className="border-t border-white/15 mt-2" />
          </motion.div>
        </div>

        {/* ── 3D Section CTAs - 3-column grid ──────── */}
        <div className="max-w-6xl mx-auto px-5 md:px-8 w-full flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 h-full">
            {SECTIONS.map((section, i) => (
              <Prism3D key={section.num} section={section} index={i} />
            ))}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-5 md:px-8 w-full mt-10 md:mt-14">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <div className="border-t border-white/12 pt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-white/30">
                Vol. 1 &middot; 2025
              </span>
              <span className="font-lora text-[12px] italic text-white/30">
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
