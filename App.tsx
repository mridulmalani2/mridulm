import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Background from './components/Background';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import NotFound from './pages/NotFound';
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion';
import { SHOW_RESEARCH } from './config/features';

// Secondary routes are code-split so the homepage payload no longer ships the
// deal engine (exceljs, recharts, the LBO engine) or the research surfaces.
const ResearchLanding = React.lazy(() => import('./pages/ResearchLanding'));
const ResearchIndex = React.lazy(() => import('./pages/ResearchIndex'));
const ResearchArticle = React.lazy(() => import('./pages/ResearchArticle'));
const NewsletterIndex = React.lazy(() => import('./pages/NewsletterIndex'));
const NewsletterArticle = React.lazy(() => import('./pages/NewsletterArticle'));
const DealEngine = React.lazy(() => import('./pages/DealEngine'));

const App: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });
  const location = useLocation();
  // Gated on the flag: with research archived these paths render the 404, which
  // belongs to the light theme. Matching them here anyway would paint the dark
  // research background behind it and leave the ink-coloured text unreadable.
  const isResearch = SHOW_RESEARCH && location.pathname.startsWith('/research');
  const isResearchArticles = SHOW_RESEARCH && (location.pathname.startsWith('/research/reports') || location.pathname.startsWith('/research/newsletter'));
  const isDealEngine = location.pathname.startsWith('/deal-engine') || location.pathname.startsWith('/research/toolkit');
  // The home page (and anything that isn't research/deal-engine) uses the light theme.
  const isLight = !isResearch && !isResearchArticles && !isDealEngine;

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`relative min-h-screen ${isDealEngine ? 'bg-[#080b11]' : isResearchArticles ? 'bg-[#F9F9F7]' : isLight ? 'bg-canvas text-ink selection:bg-ink/10 selection:text-ink' : 'bg-black'}`}
    >
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded"
      >
        Skip to main content
      </a>

      {!isResearchArticles && !isResearch && !isDealEngine && <Background />}

      {/* Progress bar */}
      {!isDealEngine && (
        <motion.div
          className={`fixed top-0 left-0 right-0 h-0.5 origin-left z-[150] ${isResearchArticles ? 'bg-[#CC0000]' : isLight ? 'bg-[#A25600]' : 'bg-amber-500'}`}
          style={{ scaleX }}
        />
      )}

      {!isDealEngine && (
        <header>
          <Navbar />
        </header>
      )}

      <Suspense fallback={<div className="min-h-screen" aria-hidden="true" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/deal-engine" element={<DealEngine />} />

          {/* The toolkit moved to /deal-engine. Old links keep working — the edge
              redirect in vercel.json catches a cold load, this catches an in-app
              navigation. */}
          <Route path="/research/toolkit" element={<Navigate to="/deal-engine" replace />} />

          {/* ARCHIVED, NOT DELETED. The research surfaces are the old dark-theme
              site and are gated off the public build: with SHOW_RESEARCH false
              these routes are never registered, so /research/* falls through to
              NotFound. Every page, component, and article stays on disk and keeps
              compiling — flip the flag to bring the whole section back in one edit.
              vercel.json redirects these at the edge too, so a direct URL is turned
              away before the SPA even loads. */}
          {SHOW_RESEARCH && (
            <>
              <Route path="/research" element={<ResearchLanding />} />
              <Route path="/research/reports" element={<ResearchIndex />} />
              <Route path="/research/reports/:slug" element={<ResearchArticle />} />
              <Route path="/research/newsletter" element={<NewsletterIndex />} />
              <Route path="/research/newsletter/:slug" element={<NewsletterArticle />} />
            </>
          )}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {!isResearchArticles && !isDealEngine && <div className={`fixed inset-0 pointer-events-none z-[100] ring-1 ${isLight ? 'ring-ink/[0.04]' : 'ring-white/5'}`} />}
    </div>
    </MotionConfig>
  );
};

export default App;
