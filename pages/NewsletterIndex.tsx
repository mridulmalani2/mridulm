import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ResearchLayout from '../components/research/ResearchLayout';
import { NEWSLETTERS } from '../data/research/newsletters';

const NewsletterIndex: React.FC = () => {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ResearchLayout>
      <main id="main-content" className="pt-28 md:pt-36 pb-16 md:pb-24">
        {/* ── Masthead ─────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="border-t-[3px] border-[#111] mb-4" />

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-3">
              <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold text-[#111] leading-[0.95] tracking-tight">
                The<br />
                <span className="font-playfair italic font-normal">Newsletter</span>
              </h1>
              <div className="flex flex-col items-start md:items-end gap-0.5">
                <span className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40">
                  Mridul Malani
                </span>
                <span className="font-mono text-[10px] tracking-widest text-[#111]/30">
                  {dateStr}
                </span>
              </div>
            </div>

            <div className="border-t border-[#111]/20 mb-1" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#111]/30">
                Weekly Analysis &middot; One Story, Every Angle
              </span>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#111]/30">
                {NEWSLETTERS.length} {NEWSLETTERS.length === 1 ? 'Issue' : 'Issues'}
              </span>
            </div>
            <div className="border-t border-[#111]/20 mt-1" />
          </motion.div>
        </div>

        {/* ── Format description ──────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mt-8 md:mt-10">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="font-lora text-[14px] md:text-[15px] leading-relaxed text-[#111]/50 max-w-2xl"
          >
            Each issue takes one article and pulls it apart into a web of connected angles.
            The center is the story. The satellites are the assumptions, findings, and
            counter-narratives buried inside it. The essay ties it all together.
          </motion.p>
        </div>

        {/* ── Newsletter cards ────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mt-10 md:mt-14">
          {NEWSLETTERS.map((newsletter, i) => (
            <motion.div
              key={newsletter.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
            >
              <Link
                to={`/research/newsletter/${newsletter.slug}`}
                className="group block border border-[#111]/10 transition-all duration-300 hover:shadow-[4px_4px_0px_#111111] hover:translate-x-[-2px] hover:translate-y-[-2px] mb-5"
              >
                <div className="p-6 md:p-8 lg:p-10">
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="font-mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 border border-[#111]/15 text-[#111]/50">
                      Issue #{newsletter.number}
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      {newsletter.date}
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      &middot;
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      {newsletter.readingTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-playfair text-2xl md:text-3xl lg:text-4xl font-bold text-[#111] leading-tight mb-2 group-hover:text-[#111]/70 transition-colors duration-300">
                    {newsletter.title}
                  </h2>

                  {/* Subtitle */}
                  <p className="font-playfair text-lg md:text-xl italic text-[#111]/45 mb-4">
                    {newsletter.subtitle}
                  </p>

                  {/* Excerpt */}
                  <p className="font-lora text-[14px] md:text-[15px] leading-relaxed text-[#111]/60 mb-6 max-w-3xl">
                    {newsletter.excerpt}
                  </p>

                  {/* Node preview strip */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <span
                      className="font-mono text-[9px] tracking-wider uppercase text-[#111]/35 border border-[#111]/10 px-2 py-1"
                    >
                      {newsletter.centerNode.source}
                    </span>
                    {newsletter.nodes.map((node) => (
                      <span
                        key={node.id}
                        className="font-mono text-[9px] tracking-wider uppercase px-2 py-1 border"
                        style={{
                          borderColor: node.accentColor + '30',
                          color: node.accentColor,
                        }}
                      >
                        {node.source}
                      </span>
                    ))}
                  </div>

                  {/* Read link */}
                  <div className="flex items-center gap-2 font-mono text-xs tracking-wider uppercase text-[#111]/60 group-hover:text-[#111] group-hover:gap-3 transition-all duration-300">
                    <span>Read Issue #{newsletter.number}</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mt-16 md:mt-20">
          <div className="border-t border-[#111]/15 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#111]/30">
              Mridul Malani &middot; Newsletter
            </p>
            <p className="font-lora text-[12px] italic text-[#111]/30">
              One story. Every angle. Weekly.
            </p>
          </div>
        </div>
      </main>
    </ResearchLayout>
  );
};

export default NewsletterIndex;
