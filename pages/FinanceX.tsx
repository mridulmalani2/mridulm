import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type PathType = 'professionals' | 'explore' | null;

const FinanceX: React.FC = () => {
  const [selectedPath, setSelectedPath] = useState<PathType>(null);
  const [showContactModal, setShowContactModal] = useState(false);

  const handlePathSelect = (path: PathType) => {
    setSelectedPath(path);
    // Scroll to top when path is selected
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToStart = () => {
    setSelectedPath(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div id="main-content" className="min-h-screen">
      <AnimatePresence mode="wait">
        {selectedPath === null && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
            className="min-h-screen flex flex-col items-center justify-center page-container"
          >
            {/* Hero Section */}
            <div className="text-center mb-16 md:mb-24">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-fluid-h2 font-playfair italic text-white mb-6"
              >
                FinanceX
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-fluid-body font-montserrat text-white/60 max-w-3xl mx-auto px-4"
              >
                A hands-on systems project in financial data standardization and analyst-aligned automation.
              </motion.p>
            </div>

            {/* CTA Cards */}
            <div className="grid md:grid-cols-2 gap-6 md:gap-8 w-full max-w-5xl px-4">
              <motion.button
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                whileHover={{ scale: 1.02, y: -8 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePathSelect('explore')}
                className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 text-left transition-all duration-500 hover:bg-white/10 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/20 min-h-[280px] flex flex-col justify-center"
              >
                <div className="relative z-10">
                  <h2 className="text-2xl md:text-3xl font-montserrat font-bold text-white mb-4 group-hover:text-amber-500 transition-colors duration-500">
                    Explore FinanceX
                  </h2>
                  <p className="text-base md:text-lg font-montserrat text-white/60 leading-relaxed">
                    Learn what it does, how it works, and how you can use or contribute.
                  </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 via-amber-500/0 to-amber-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                whileHover={{ scale: 1.02, y: -8 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePathSelect('professionals')}
                className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 text-left transition-all duration-500 hover:bg-white/10 hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/20 min-h-[280px] flex flex-col justify-center"
              >
                <div className="relative z-10">
                  <h2 className="text-2xl md:text-3xl font-montserrat font-bold text-white mb-4 group-hover:text-amber-500 transition-colors duration-500">
                    For Finance Professionals
                  </h2>
                  <p className="text-base md:text-lg font-montserrat text-white/60 leading-relaxed">
                    System design, analytical philosophy, and practical applications.
                  </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 via-amber-500/0 to-amber-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {selectedPath === 'professionals' && (
          <ProfessionalsPath onBack={handleBackToStart} onShowContact={() => setShowContactModal(true)} />
        )}

        {selectedPath === 'explore' && (
          <ExplorePath onBack={handleBackToStart} />
        )}
      </AnimatePresence>

      {/* Contact Modal */}
      <AnimatePresence>
        {showContactModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowContactModal(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-black border border-white/20 rounded-2xl p-8 md:p-12 max-w-lg w-full"
            >
              <h3 className="text-2xl md:text-3xl font-montserrat font-bold text-white mb-6">
                Start a conversation
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="font-montserrat text-white/60 mb-2">Email:</p>
                  <a
                    href="mailto:mridul.malani@alumni.ashoka.edu.in"
                    className="font-montserrat text-amber-500 hover:text-amber-400 transition-colors text-lg break-all"
                  >
                    mridul.malani@alumni.ashoka.edu.in
                  </a>
                </div>
              </div>
              <button
                onClick={() => setShowContactModal(false)}
                className="mt-8 w-full bg-amber-500 hover:bg-amber-600 text-black font-montserrat font-bold py-3 px-6 rounded-xl transition-colors duration-300"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Professionals Path Component
const ProfessionalsPath: React.FC<{ onBack: () => void; onShowContact: () => void }> = ({ onBack, onShowContact }) => {
  const [expandedDeepDive, setExpandedDeepDive] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen page-container section-v-padding"
    >
      {/* Back Button */}
      <motion.button
        type="button"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        onClick={onBack}
        className="mb-12 py-2 text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-2 font-montserrat cursor-pointer relative z-50"
      >
        <span>←</span> Back to selection
      </motion.button>

      {/* Primary Principle Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 mb-8"
      >
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed mb-6">
          FinanceX is a hands-on systems project designed to reduce friction in financial analysis by automating repetitive, error-prone data workflows while keeping analyst judgment central.
        </p>
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed">
          The system focuses on deterministic, analyst-aligned logic — not black-box generation and not analyst replacement. It is one example of how I approach financial problems, learn quickly, and translate theory into usable tools. If this kind of work feels relevant to your team, I would genuinely value a conversation.
        </p>
      </motion.div>

      {/* Secondary Clarification Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 md:p-8 mb-12"
      >
        <p className="text-base md:text-lg font-montserrat text-white/80 leading-relaxed">
          FinanceX is not a commercial product or a sales pitch. It is a working system built to demonstrate how I think, learn, and build in finance-adjacent systems.
        </p>
      </motion.div>

      {/* System Workflow Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-playfair italic text-white mb-8">
          The FinanceX Workflow
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              stage: 'Stage 1',
              title: 'Extraction',
              description: 'Raw Excel files or OCR\'d PDFs are cleaned and structured automatically.'
            },
            {
              stage: 'Stage 2',
              title: 'Mapping & Normalization',
              description: 'Each line item is mapped to a standard accounting concept, prioritizing user-defined logic.'
            },
            {
              stage: 'Stage 3',
              title: 'Financial Modeling',
              description: 'DCF, LBO, and trading comparables are generated using iterative, rule-based logic.'
            },
            {
              stage: 'Stage 4',
              title: 'Validation & Audit',
              description: '100+ checks verify accounting identities, data integrity, and internal consistency.'
            }
          ].map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 hover:border-amber-500/30 transition-colors duration-500"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-amber-500 font-montserrat font-bold text-sm">
                  {item.stage}
                </span>
                <span className="text-white/30">—</span>
                <h3 className="font-montserrat font-bold text-white text-lg">
                  {item.title}
                </h3>
              </div>
              <p className="font-montserrat text-white/60 leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Feature Spotlight: The Analyst Brain */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-gradient-to-br from-amber-500/10 to-white/5 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-8 md:p-12 mb-12"
      >
        <h2 className="text-2xl md:text-3xl font-playfair italic text-amber-500 mb-6">
          Feature Spotlight: The Analyst Brain (BYOB)
        </h2>
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed">
          The Analyst Brain (Bring Your Own Brain) is a portable, user-owned configuration file that stores mappings, corrections, and preferences.
        </p>
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed mt-4">
          It remains fully local, reusable across sessions, and shareable across teams — preserving analyst judgment without centralizing proprietary logic.
        </p>
      </motion.div>

      {/* Transparency & Control Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-playfair italic text-white mb-8">
          Transparency & Control
        </h2>
        <div className="space-y-4">
          {[
            {
              title: 'Decision Hierarchy',
              description: 'Mapping follows a strict priority order where explicit analyst inputs always override defaults.'
            },
            {
              title: 'Non-Blocking Validation',
              description: 'Partial models are generated even when issues exist, enabling iterative correction.'
            },
            {
              title: 'Full Traceability',
              description: 'Every output can be traced back to its source data and transformation logic.'
            }
          ].map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8"
            >
              <h3 className="font-montserrat font-bold text-white text-lg mb-3">
                {item.title}
              </h3>
              <p className="font-montserrat text-white/60 leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Video Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <h2 className="text-2xl md:text-3xl font-playfair italic text-white mb-6">
          Watch the system in action
        </h2>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden">
          <video
            controls
            className="w-full rounded-xl"
            preload="metadata"
          >
            <source src="/FinanceX__Automated_Analysis.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </motion.div>

      {/* Deep Dive Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <button
          onClick={() => setExpandedDeepDive(!expandedDeepDive)}
          className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 text-left hover:border-amber-500/30 transition-colors duration-500 flex items-center justify-between"
        >
          <h2 className="text-2xl md:text-3xl font-playfair italic text-white">
            Read the full system write-up
          </h2>
          <span className="text-amber-500 text-2xl">
            {expandedDeepDive ? '−' : '+'}
          </span>
        </button>
        <AnimatePresence>
          {expandedDeepDive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 border-t-0 rounded-b-2xl p-6 md:p-8 mt-[-1px]">
                <div className="prose prose-invert max-w-none font-montserrat text-white/80 leading-relaxed space-y-6">
                  <h3 className="text-2xl font-bold text-white mt-0">Forget Black-Box AI. Build Tools That Make Experts Better.</h3>

                  <p>
                    Modern finance depends on precision. Yet much of an analyst's time is still spent on work that is repetitive, manual, and fragile: converting PDFs into usable data, mapping thousands of idiosyncratic line items to standard accounting concepts, and rebuilding foundational models from scratch for every new company.
                  </p>

                  <p>
                    FinanceX is a systems project designed to reduce this friction. It automates the transformation of raw financial statements into structured, analysis-ready outputs while preserving analyst judgment at every step. What typically takes hours can be reduced to minutes — not by replacing the analyst, but by aligning automation with how analysts actually think and work.
                  </p>

                  <p>
                    Speed matters, but it isn't the point. The defining idea behind FinanceX is that automation should amplify expertise, not obscure it.
                  </p>

                  <h4 className="text-xl font-bold text-white mt-8">1. Automation That Learns Your Logic</h4>

                  <p>
                    Most financial automation tools centralize intelligence in the cloud. FinanceX takes a different approach.
                  </p>

                  <p>
                    At the core of the system is the Analyst Brain — a portable, user-owned configuration file that stores mapping decisions, corrections, and validation preferences. After each session, the file is downloaded and reused in future sessions, allowing the system to behave consistently with the analyst's prior judgment.
                  </p>

                  <p>This design has three important implications:</p>

                  <div className="ml-6 space-y-4">
                    <div>
                      <p className="font-bold text-white">Control and privacy</p>
                      <p>All custom logic remains local. No proprietary mappings or decisions are stored centrally or used to train external models.</p>
                    </div>

                    <div>
                      <p className="font-bold text-white">Consistency over time</p>
                      <p>When an analyst resolves an ambiguous line item once, that decision becomes the highest-priority rule in future analyses. The system improves deterministically, not probabilistically.</p>
                    </div>

                    <div>
                      <p className="font-bold text-white">Portability across teams</p>
                      <p>Because the "brain" is a single file, teams can share a common analytical standard without enforcing it through rigid templates.</p>
                    </div>
                  </div>

                  <p>
                    Rather than absorbing expertise into a black box, FinanceX treats analyst judgment as durable intellectual capital.
                  </p>

                  <h4 className="text-xl font-bold text-white mt-8">2. Designed to Work With Analysts, Not Around Them</h4>

                  <p>
                    FinanceX is intentionally interactive. It does not silently fail when ambiguity appears, nor does it force blind trust in automated outputs.
                  </p>

                  <p>
                    Unmapped or unclear line items are surfaced directly to the user, who can resolve them by selecting the appropriate standard accounting concept. These corrections are stored and reused, turning friction into learning rather than error.
                  </p>

                  <p>
                    Crucially, the system uses non-blocking validation. Even when issues are detected, partial models are still generated, allowing analysts to inspect results, identify gaps, and iteratively improve outcomes. This reflects how real analysis happens: imperfect inputs, progressive refinement, and human oversight at every stage.
                  </p>

                  <p>
                    Automation handles repetition. Judgment remains human.
                  </p>

                  <h4 className="text-xl font-bold text-white mt-8">3. Transparent Reasoning, Not Hidden Logic</h4>

                  <p>
                    Trust in financial systems comes from traceability.
                  </p>

                  <p>
                    FinanceX makes its internal logic explicit through a clear hierarchy of decision-making when mapping data, prioritizing user-defined rules over defaults and progressively relaxing constraints only when necessary. Each step is assigned a confidence level, and every mapping decision is logged.
                  </p>

                  <p>
                    When models are constructed, the system follows an iterative approach: starting with strict assumptions and expanding only when required. Analysts can inspect how each figure was derived, trace it back to its source, and understand exactly why a given assumption was made.
                  </p>

                  <p>
                    This transparency is deliberate. The goal is not to "produce an answer," but to make the process legible enough that an analyst can confidently stand behind it.
                  </p>

                  <h4 className="text-xl font-bold text-white mt-8">Conclusion: A Different Direction for Financial Automation</h4>

                  <p>
                    FinanceX is not positioned as a finished product, nor as a replacement for human expertise. It is a working example of how financial systems can be built differently — with deterministic logic, user-controlled learning, and full transparency.
                  </p>

                  <p>
                    As automation becomes more prevalent in complex analytical work, the question is not whether machines will be involved, but how. FinanceX explores a path where tools remain accountable, analysts remain central, and expertise compounds rather than disappears.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Contact CTA */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <button
          onClick={onShowContact}
          className="bg-amber-500 hover:bg-amber-600 text-black font-montserrat font-bold py-4 px-8 rounded-xl transition-colors duration-300 text-lg"
        >
          Start a conversation
        </button>
      </motion.div>
    </motion.div>
  );
};

// Explore Path Component
const ExplorePath: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [expandedOCR, setExpandedOCR] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen page-container section-v-padding"
    >
      {/* Back Button */}
      <motion.button
        type="button"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        onClick={onBack}
        className="mb-12 py-2 text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-2 font-montserrat cursor-pointer relative z-50"
      >
        <span>←</span> Back to selection
      </motion.button>

      {/* Intro Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 mb-12"
      >
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed mb-4">
          FinanceX is a project I'm building while learning how real financial systems work - not just in theory, but in practice. If you're a student, curious learner, or just exploring, this page explains what the tool does, how it might help you, and how you can contribute if you'd like.
        </p>
        <p className="text-lg md:text-xl font-montserrat text-white/90 leading-relaxed">
          At its core, FinanceX helps clean, structure, and standardize messy financial data. Instead of manually fixing statements, formats, or classifications again and again, the system applies clear, rule-based logic so outputs stay consistent and traceable. In the future, I also plan to extend this into modeling workflows, where structured inputs and past modeling patterns can reduce repetitive setup work.
        </p>
      </motion.div>

      {/* Student Workflow */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-playfair italic text-white mb-8">
          From raw files to clean financial data
        </h2>
        <div className="space-y-4">
          {[
            {
              number: '1',
              title: 'Prepare your files',
              description: 'Start with Excel or convert PDFs using OCR.'
            },
            {
              number: '2',
              title: 'Upload & process',
              description: 'Upload your files and optionally your saved Analyst Brain.'
            },
            {
              number: '3',
              title: 'Review results',
              description: 'Inspect clean data, models, and audit flags.'
            },
            {
              number: '4',
              title: 'Fix & teach',
              description: 'Correct unmapped items — the system learns your logic.'
            },
            {
              number: '5',
              title: 'Download & reuse',
              description: 'Export outputs and your updated Brain for next time.'
            }
          ].map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 flex gap-4 md:gap-6 hover:border-amber-500/30 transition-colors duration-500"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center font-montserrat font-bold text-black text-xl">
                {step.number}
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-white text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-white/60 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Infographic Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 overflow-hidden">
          <img
            src="/financex-infographic.png"
            alt="FinanceX workflow infographic"
            className="w-full h-auto rounded-xl"
            onError={(e) => {
              // Hide image if it doesn't exist
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </motion.div>

      {/* Video Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <h2 className="text-2xl md:text-3xl font-playfair italic text-white mb-6">
          See how it works
        </h2>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden">
          <video
            controls
            className="w-full rounded-xl"
            preload="metadata"
          >
            <source src="/FinanceX__Automated_Analysis.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </motion.div>

      {/* OCR Contribution Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <button
          onClick={() => setExpandedOCR(!expandedOCR)}
          className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 text-left hover:border-amber-500/30 transition-colors duration-500 flex items-center justify-between"
        >
          <div>
            <h2 className="text-2xl md:text-3xl font-playfair italic text-white mb-2">
              Help improve the system (optional)
            </h2>
            <p className="font-montserrat text-white/60">
              If you'd like to contribute, one of the most helpful things right now is clean financial data.
            </p>
          </div>
          <span className="text-amber-500 text-2xl ml-4">
            {expandedOCR ? '−' : '+'}
          </span>
        </button>
        <AnimatePresence>
          {expandedOCR && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="overflow-hidden"
            >
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 border-t-0 rounded-b-2xl p-6 md:p-8 mt-[-1px] space-y-6">
                <div>
                  <h3 className="font-montserrat font-bold text-white text-lg mb-3">
                    OCR Tool Link
                  </h3>
                  <a
                    href="https://chatgpt.com/g/g-wETMBcESv-ocr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-montserrat text-amber-500 hover:text-amber-400 transition-colors break-all"
                  >
                    https://chatgpt.com/g/g-wETMBcESv-ocr
                  </a>
                </div>

                <div>
                  <h3 className="font-montserrat font-bold text-white text-lg mb-3">
                    Prompt to use
                  </h3>
                  <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-montserrat text-sm text-white/80">
                    <p className="mb-4">I have a PDF of financial statements. Please extract the data into 3 separate CSV blocks:</p>
                    <ol className="list-decimal list-inside space-y-2 mb-4">
                      <li>Income Statement</li>
                      <li>Balance Sheet</li>
                      <li>Cash Flow Statement</li>
                    </ol>
                    <p className="mb-2">Formatting Rules:</p>
                    <ul className="list-disc list-inside space-y-1 mb-4 ml-4">
                      <li>Column A must contain the Line Item Labels.</li>
                      <li>Row 1 must contain the Dates (e.g., '2023', 'FY24').</li>
                      <li>Do not merge cells. Ensure numbers are clean (no currency symbols).</li>
                      <li>If a statement spans multiple pages, merge them into one CSV block.</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-montserrat font-bold text-white text-lg mb-3">
                    Email Instructions (CRITICAL)
                  </h3>
                  <div className="space-y-3 font-montserrat text-white/80">
                    <p>Send the output to: <span className="text-amber-500 font-semibold">mridulgptid@gmail.com</span></p>
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <p className="font-semibold text-white mb-2">Email rules:</p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>Subject must be: <span className="font-montserrat bg-black/40 px-2 py-1 rounded">Data</span></li>
                        <li>Email body must be completely empty</li>
                        <li>Attach ONE Excel file only</li>
                        <li>The Excel file must contain EXACTLY three tabs named:
                          <ul className="list-circle list-inside ml-6 mt-1">
                            <li className="font-montserrat">Income Statement</li>
                            <li className="font-montserrat">Balance Sheet</li>
                            <li className="font-montserrat">Cashflow Statement</li>
                          </ul>
                        </li>
                      </ul>
                      <p className="mt-3 text-sm italic">
                        Formatting and naming must be precise. Submissions that do not follow these rules cannot be used.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default FinanceX;
