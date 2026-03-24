import React from 'react';
import { motion } from 'framer-motion';
import type { ContentSection } from '../../data/research/broadcom-vmware/content';
import type { ModelSheet } from '../../data/research/broadcom-vmware/model';
import ModelViewer from './ModelViewer';
import ScenarioCard from './ScenarioCard';

interface SectionRendererProps {
  section: ContentSection;
  modelSheets?: ModelSheet[];
}

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5 },
};

const SectionRenderer: React.FC<SectionRendererProps> = ({ section, modelSheets }) => {
  switch (section.type) {
    case 'executive-summary': {
      const paragraphs = Array.isArray(section.content) ? section.content : [section.content || ''];
      return (
        <motion.div {...fadeIn} id={section.id} className="my-10 md:my-14">
          <div className="border-l-[3px] border-[#CC0000] pl-5 md:pl-8 py-2">
            <p className="font-mono text-[10px] tracking-widest uppercase text-[#111]/40 mb-4">
              Executive Summary
            </p>
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="font-lora text-[15px] md:text-[16px] leading-[1.8] text-[#111]/85 mb-4 last:mb-0"
              >
                {p}
              </p>
            ))}
          </div>
        </motion.div>
      );
    }

    case 'heading':
      return (
        <motion.div {...fadeIn} id={section.id} className="mt-12 md:mt-16 mb-6">
          <h2 className="font-playfair text-2xl md:text-3xl lg:text-4xl font-bold text-[#111] leading-tight">
            {section.title}
          </h2>
          <div className="mt-3 h-[2px] bg-[#111] w-16" />
        </motion.div>
      );

    case 'subheading':
      return (
        <motion.h3
          {...fadeIn}
          className="font-playfair text-lg md:text-xl font-semibold text-[#111] mt-8 mb-3"
        >
          {section.title}
        </motion.h3>
      );

    case 'prose': {
      const paragraphs = Array.isArray(section.content) ? section.content : [section.content || ''];
      return (
        <motion.div {...fadeIn}>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="font-lora text-[14px] md:text-[15px] leading-[1.85] text-[#111]/75 mb-4 last:mb-0"
            >
              {p}
            </p>
          ))}
        </motion.div>
      );
    }

    case 'numbered-points':
      return (
        <motion.div {...fadeIn} className="space-y-6 my-4">
          {(section.items || []).map((item: any, i: number) => (
            <div key={i} className="flex gap-4">
              <div className="w-7 h-7 bg-[#CC0000] text-white flex items-center justify-center shrink-0 mt-0.5">
                <span className="font-mono text-xs font-bold">{i + 1}</span>
              </div>
              <div>
                <p className="font-lora text-[15px] font-semibold text-[#111] mb-1">{item.title}</p>
                <p className="font-lora text-[14px] leading-[1.85] text-[#111]/75">{item.body}</p>
              </div>
            </div>
          ))}
        </motion.div>
      );

    case 'bullet-list':
      return (
        <motion.ul {...fadeIn} className="space-y-2 my-4 ml-1">
          {(section.items || []).map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 bg-[#111]/25 mt-2 shrink-0" />
              <span className="font-lora text-[14px] leading-[1.8] text-[#111]/75">{item}</span>
            </li>
          ))}
        </motion.ul>
      );

    case 'scenario':
      return (
        <motion.div {...fadeIn} className="grid grid-cols-1 lg:grid-cols-3 gap-5 my-8">
          {(section.items || []).map((scenario: any, i: number) => (
            <ScenarioCard key={i} scenario={scenario} index={i} />
          ))}
        </motion.div>
      );

    case 'conclusion': {
      const paragraphs = Array.isArray(section.content) ? section.content : [section.content || ''];
      return (
        <motion.div {...fadeIn} id={section.id} className="my-10 md:my-14">
          <h2 className="font-playfair text-2xl md:text-3xl font-bold text-[#111] mb-3">
            {section.title}
          </h2>
          <div className="h-[2px] bg-[#111] w-16 mb-6" />
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="font-lora text-[14px] md:text-[15px] leading-[1.85] text-[#111]/75 mb-4 last:mb-0"
            >
              {p}
            </p>
          ))}
          <div className="mt-8 pt-6 border-t border-[#111]/10">
            <p className="font-mono text-[11px] text-[#111]/35 tracking-wide italic">
              Analysis date: March 24, 2026. Based on publicly available financial data, regulatory
              filings, and industry reports.
            </p>
          </div>
        </motion.div>
      );
    }

    case 'model-insert':
      return modelSheets ? <ModelViewer sheets={modelSheets} /> : null;

    case 'divider':
      return <hr className="my-8 md:my-12 border-t border-[#111]/10" />;

    default:
      return null;
  }
};

export default SectionRenderer;
