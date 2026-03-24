import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ResearchLayout from '../components/research/ResearchLayout';
import CategoryBadge from '../components/research/CategoryBadge';
import { ARTICLES } from '../data/research/articles';

const ResearchIndex: React.FC = () => {
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
            {/* Top rule */}
            <div className="border-t-[3px] border-[#111] mb-4" />

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-3">
              <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold text-[#111] leading-[0.95] tracking-tight">
                The Research<br />
                <span className="font-playfair italic font-normal">Report</span>
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

            {/* Bottom rule */}
            <div className="border-t border-[#111]/20 mb-1" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#111]/30">
                Vol. 1 &middot; Financial Analysis &middot; Deal Research
              </span>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#111]/30">
                Ed. {ARTICLES.length}
              </span>
            </div>
            <div className="border-t border-[#111]/20 mt-1" />
          </motion.div>
        </div>

        {/* ── Articles ─────────────────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 mt-10 md:mt-14">
          {ARTICLES.map((article, i) => (
            <motion.div
              key={article.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
            >
              <Link
                to={`/research/reports/${article.slug}`}
                className="group block border border-[#111]/10 transition-all duration-300 hover:shadow-[4px_4px_0px_#111111] hover:translate-x-[-2px] hover:translate-y-[-2px]"
              >
                <div className="p-6 md:p-8 lg:p-10">
                  {/* Category + meta row */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <CategoryBadge category={article.category} size="md" />
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      {article.date}
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      &middot;
                    </span>
                    <span className="font-mono text-[10px] tracking-wider text-[#111]/35">
                      {article.readingTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="font-playfair text-2xl md:text-3xl lg:text-4xl font-bold text-[#111] leading-tight mb-3 group-hover:text-[#CC0000] transition-colors duration-300">
                    {article.title}
                  </h2>

                  {/* Excerpt */}
                  <p className="font-lora text-[14px] md:text-[15px] leading-relaxed text-[#111]/60 mb-6 max-w-3xl">
                    {article.excerpt}
                  </p>

                  {/* Key metrics strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {article.keyMetrics.map((m) => (
                      <div key={m.label} className="border border-[#111]/8 p-3">
                        <p className="font-mono text-[9px] tracking-widest uppercase text-[#111]/35 mb-1">
                          {m.label}
                        </p>
                        <p className="font-playfair text-xl font-bold text-[#111]">{m.value}</p>
                        {m.subtext && (
                          <p className="font-mono text-[9px] text-[#111]/30 mt-0.5">{m.subtext}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Read link */}
                  <div className="flex items-center gap-2 font-mono text-xs tracking-wider uppercase text-[#CC0000] group-hover:gap-3 transition-all duration-300">
                    <span>Read Analysis</span>
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
              Mridul Malani &middot; Research
            </p>
            <p className="font-lora text-[12px] italic text-[#111]/30">
              Institutional-quality analysis for investment banking and private equity
            </p>
          </div>
        </div>
      </main>
    </ResearchLayout>
  );
};

export default ResearchIndex;
