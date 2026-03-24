import React, { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import ResearchLayout from '../components/research/ResearchLayout';
import { NEWSLETTERS } from '../data/research/newsletters';
import type { NewsletterNode } from '../data/research/newsletters';

/* ─── Node component for the web visualization ──────────────── */

interface NodeCardProps {
  node: NewsletterNode;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, index, isExpanded, onToggle }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: 0.1 + index * 0.08, duration: 0.5 }}
  >
    <button
      onClick={onToggle}
      className="w-full text-left group border border-[#111]/10 transition-all duration-300 hover:border-[#111]/25 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F7]"
      style={{
        borderLeft: `3px solid ${node.accentColor}`,
      }}
    >
      <div className="p-5 md:p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <span
            className="font-mono text-[11px] font-semibold tracking-[0.2em] mt-0.5 shrink-0"
            style={{ color: node.accentColor }}
          >
            {node.id}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-playfair text-lg md:text-xl font-bold text-[#111] leading-tight mb-1">
              {node.title}
            </h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-wider uppercase text-[#111]/40">
                {node.source}
              </span>
              <span className="text-[#111]/20">&middot;</span>
              <span className="font-mono text-[9px] tracking-wider text-[#111]/30">
                {node.date}
              </span>
            </div>
          </div>
        </div>

        {/* Expandable commentary */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-[#111]/8">
                <p className="font-lora text-[14px] leading-[1.75] text-[#111]/65">
                  {node.commentary}
                </p>
                <a
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 mt-3 font-mono text-[10px] tracking-wider uppercase hover:text-[#111] transition-colors"
                  style={{ color: node.accentColor }}
                >
                  <span>Source</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand hint */}
        {!isExpanded && (
          <p className="font-mono text-[9px] tracking-wider uppercase text-[#111]/25 mt-2">
            Click to expand
          </p>
        )}
      </div>
    </button>
  </motion.div>
);

/* ─── Newsletter Article Page ──────────────────────────────── */

const NewsletterArticle: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const newsletter = NEWSLETTERS.find((n) => n.slug === slug);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  if (!newsletter) {
    return <Navigate to="/research/newsletter" replace />;
  }

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ResearchLayout>
      <main id="main-content" className="pt-28 md:pt-36 pb-16 md:pb-24">
        <div className="max-w-4xl mx-auto px-5 md:px-8">
          {/* ── Back nav ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <Link
              to="/research/newsletter"
              className="inline-flex items-center gap-2 font-mono text-[10px] tracking-wider uppercase text-[#111]/40 hover:text-[#111]/70 transition-colors"
            >
              <ArrowLeft size={12} />
              <span>All Issues</span>
            </Link>
          </motion.div>

          {/* ── Article header ───────────────────────────── */}
          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="border-t-[3px] border-[#111] mb-5" />

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

            <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-[#111] leading-[1.05] tracking-tight mb-3">
              {newsletter.title}
            </h1>
            <p className="font-playfair text-xl md:text-2xl italic text-[#111]/45 mb-4">
              {newsletter.subtitle}
            </p>

            <div className="flex items-center gap-3 mb-6">
              <span className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40">
                By {newsletter.author}
              </span>
            </div>

            <div className="border-t border-[#111]/15 mb-1" />
            <div className="border-t border-[#111]/15 mt-1" />
          </motion.header>

          {/* ── The Format ───────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-10 mb-12"
          >
            <p className="font-lora text-[15px] md:text-[16px] leading-[1.8] text-[#111]/55">
              This issue takes one article and pulls it apart into a web of connected
              angles. The center node is the article. The satellites are the assumptions,
              findings, and counter-narratives buried inside it - each backed by a separate
              source. The essay at the bottom ties it all together.
            </p>
          </motion.div>

          {/* ── Center node ──────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="border-2 border-[#111]/20 p-6 md:p-8 mb-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-1 border border-[#111]/20 text-[#111]/50">
                Center Node
              </span>
              <span className="w-6 h-px bg-[#111]/15" />
              <span className="font-mono text-[9px] tracking-wider uppercase text-[#111]/35">
                {newsletter.centerNode.source}
              </span>
            </div>

            <h2 className="font-playfair text-xl md:text-2xl font-bold text-[#111] leading-tight mb-1">
              {newsletter.centerNode.title}
            </h2>
            <p className="font-mono text-[9px] tracking-wider text-[#111]/30 mb-4">
              {newsletter.centerNode.date}
            </p>

            <p className="font-lora text-[14px] md:text-[15px] leading-[1.75] text-[#111]/65">
              {newsletter.centerNode.summary}
            </p>

            <a
              href={newsletter.centerNode.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 font-mono text-[10px] tracking-wider uppercase text-[#111]/40 hover:text-[#111]/70 transition-colors"
            >
              <span>Read original</span>
              <ExternalLink size={10} />
            </a>
          </motion.div>

          {/* ── Connecting line ───────────────────────────── */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-[#111]/15" />
          </div>

          {/* ── Satellite nodes ──────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {newsletter.nodes.map((node, i) => (
              <NodeCard
                key={node.id}
                node={node}
                index={i}
                isExpanded={expandedNodes.has(node.id)}
                onToggle={() => toggleNode(node.id)}
              />
            ))}
          </div>

          {/* ── Divider ──────────────────────────────────── */}
          <div className="my-14 md:my-18 flex items-center gap-4">
            <div className="flex-1 border-t border-[#111]/15" />
            <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#111]/25">
              The Essay
            </span>
            <div className="flex-1 border-t border-[#111]/15" />
          </div>

          {/* ── Essay ────────────────────────────────────── */}
          <motion.article
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-[680px] mx-auto"
          >
            <h2 className="font-playfair text-2xl md:text-3xl font-bold text-[#111] leading-tight mb-8">
              {newsletter.essay.title}
            </h2>

            {newsletter.essay.paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className={`font-lora text-[15px] md:text-[16px] leading-[1.85] text-[#111]/75 mb-6 ${
                  i === 0 ? 'first-letter:text-5xl first-letter:font-playfair first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:leading-[0.8] first-letter:text-[#111]' : ''
                }`}
              >
                {paragraph}
              </p>
            ))}

            {/* Closing note */}
            <div className="border-t border-[#111]/15 mt-10 pt-6">
              <p className="font-lora text-[13px] italic leading-relaxed text-[#111]/40">
                {newsletter.essay.closingNote}
              </p>
            </div>
          </motion.article>

          {/* ── Footer ───────────────────────────────────── */}
          <div className="mt-16 md:mt-20">
            <div className="border-t border-[#111]/15 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#111]/30">
                Mridul Malani &middot; Newsletter #{newsletter.number}
              </p>
              <Link
                to="/research/newsletter"
                className="font-mono text-[10px] tracking-wider uppercase text-[#111]/40 hover:text-[#111]/70 transition-colors"
              >
                &larr; All Issues
              </Link>
            </div>
          </div>
        </div>
      </main>
    </ResearchLayout>
  );
};

export default NewsletterArticle;
