import React, { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Background from './components/Background';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import NotFound from './pages/NotFound';
import { motion, useScroll, useSpring, MotionConfig } from 'framer-motion';

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
  const isResearch = location.pathname.startsWith('/research');
  const isResearchArticles = location.pathname.startsWith('/research/reports') || location.pathname.startsWith('/research/newsletter');
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
          <Route path="/research/toolkit" element={<DealEngine />} />
          <Route path="/research" element={<ResearchLanding />} />
          <Route path="/research/reports" element={<ResearchIndex />} />
          <Route path="/research/reports/:slug" element={<ResearchArticle />} />
          <Route path="/research/newsletter" element={<NewsletterIndex />} />
          <Route path="/research/newsletter/:slug" element={<NewsletterArticle />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {!isResearchArticles && !isDealEngine && <div className={`fixed inset-0 pointer-events-none z-[100] ring-1 ${isLight ? 'ring-ink/[0.04]' : 'ring-white/5'}`} />}
    </div>
    </MotionConfig>
  );
};

export default App;
