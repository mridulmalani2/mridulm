import React, { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, BookOpen } from 'lucide-react';
import ResearchLayout from '../components/research/ResearchLayout';
import CategoryBadge from '../components/research/CategoryBadge';
import StatCard from '../components/research/StatCard';
import SectionRenderer from '../components/research/SectionRenderer';
import { ARTICLES } from '../data/research/articles';
import { ssrInitial } from '../ssg/utils';

// Article data imports - add new articles here
import { ARTICLE_CONTENT as broadcomContent } from '../data/research/broadcom-vmware/content';
import { MODEL_SHEETS as broadcomModel } from '../data/research/broadcom-vmware/model';

const articleData: Record<string, { content: any[]; model?: any[] }> = {
  'broadcom-vmware': { content: broadcomContent, model: broadcomModel },
};

const ResearchArticle: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const article = useMemo(() => ARTICLES.find((a) => a.slug === slug), [slug]);
  const data = slug ? articleData[slug] : undefined;

  if (!article || !data) {
    return (
      <ResearchLayout>
        <div className="pt-36 pb-24 text-center">
          <p className="font-playfair text-2xl text-[#111]/60">Article not found.</p>
          <button
            onClick={() => navigate('/research/reports')}
            className="mt-4 font-mono text-sm text-[#CC0000] hover:underline"
          >
            Back to Research
          </button>
        </div>
      </ResearchLayout>
    );
  }

  // Build table of contents from headings
  const toc = data.content
    .filter((s: any) => s.type === 'heading' || s.type === 'executive-summary' || s.type === 'conclusion')
    .map((s: any) => ({
      id: s.id || '',
      title: s.title || '',
    }))
    .filter((item: any) => item.id);

  return (
    <ResearchLayout>
      <article id="main-content" className="pt-28 md:pt-36 pb-16 md:pb-24">
        {/* ── Article Header ───────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <motion.div
            initial={ssrInitial({ opacity: 0, y: -10 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Back link */}
            <Link
              to="/research/reports"
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase text-[#111]/40 hover:text-[#CC0000] transition-colors mb-8 group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
              Back to Research
            </Link>

            {/* Category + meta */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <CategoryBadge category={article.category} size="md" />
              <div className="flex items-center gap-1.5 text-[#111]/35">
                <Clock size={12} />
                <span className="font-mono text-[10px] tracking-wider">{article.readingTime}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#111]/35">
                <BookOpen size={12} />
                <span className="font-mono text-[10px] tracking-wider">
                  Vol. {article.volume}, Ed. {article.edition}
                </span>
              </div>
            </div>

            {/* Title */}
            <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-[#111] leading-[1.05] tracking-tight mb-3">
              {article.title}
            </h1>

            {/* Date */}
            <p className="font-mono text-[11px] tracking-wider text-[#111]/35 uppercase mb-6">
              {article.date}
            </p>

            {/* Top rule */}
            <div className="border-t-[2px] border-[#111] mb-1" />
            <div className="border-t border-[#111]/15" />
          </motion.div>
        </div>

        {/* ── Key Metrics Strip ────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <motion.div
            initial={ssrInitial({ opacity: 0, y: 15 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 my-8 md:my-10"
          >
            {article.keyMetrics.map((m) => (
              <StatCard key={m.label} {...m} />
            ))}
          </motion.div>
        </div>

        {/* ── Table of Contents ────────────────────────────────── */}
        {toc.length > 0 && (
          <div className="max-w-3xl mx-auto px-5 md:px-8 mb-8">
            <motion.div
              initial={ssrInitial({ opacity: 0 })}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="border border-[#111]/10 p-4 md:p-5"
            >
              <p className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40 mb-3">
                Contents
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {toc.map((item: any) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="font-lora text-[13px] text-[#111]/55 hover:text-[#CC0000] transition-colors"
                  >
                    {item.title}
                  </a>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Article Body ─────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          {data.content.map((section: any, i: number) => (
            <SectionRenderer key={i} section={section} modelSheets={data.model} />
          ))}
        </div>

        {/* ── Footer Navigation ────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-5 md:px-8 mt-12 md:mt-16">
          <div className="border-t border-[#111]/15 pt-6 flex items-center justify-between">
            <Link
              to="/research/reports"
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase text-[#111]/40 hover:text-[#CC0000] transition-colors group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
              All Research
            </Link>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#111]/25">
              Mridul Malani &middot; Research
            </span>
          </div>
        </div>
      </article>
    </ResearchLayout>
  );
};

export default ResearchArticle;
