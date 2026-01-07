import React from 'react';
import Background from './components/Background';
import Hero from './components/Hero';
import Projects from './components/Projects';
import DashboardPreview from './components/DashboardPreview';
import VideoStory from './components/VideoStory';
import Resume from './components/Resume';
import Hobbies from './components/Hobbies';
import Contact from './components/Contact';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import CursorGlow from './components/CursorGlow';
import AnimatedOrbs from './components/AnimatedOrbs';
import { motion, useScroll, useSpring } from 'framer-motion';

const App: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative selection:bg-amber-500 selection:text-black min-h-screen bg-black"
    >
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:rounded"
      >
        Skip to main content
      </a>

      <Background />
      <AnimatedOrbs />
      <CursorGlow />

      {/* Enhanced Progress bar with glow */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 origin-left z-[150]"
        style={{
          scaleX,
          boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)'
        }}
      />

      <header>
        <Navbar />
      </header>

      <main id="main-content" className="relative perspective-main">
        <section id="hero" className="min-h-screen flex items-center justify-center">
          <Hero />
        </section>

        <section id="projects" className="min-h-screen flex flex-col justify-center bg-black/40">
          <ErrorBoundary>
            <Projects />
          </ErrorBoundary>
        </section>

        <section id="dashboard" className="min-h-screen flex items-center justify-center bg-black/20">
          <ErrorBoundary>
            <DashboardPreview />
          </ErrorBoundary>
        </section>

        <section id="video-story" className="min-h-screen flex items-center justify-center">
          <ErrorBoundary>
            <VideoStory />
          </ErrorBoundary>
        </section>

        <section id="resume" className="min-h-screen flex flex-col justify-center">
          <ErrorBoundary>
            <Resume />
          </ErrorBoundary>
        </section>

        <section id="hobbies" className="min-h-screen flex flex-col justify-center">
          <ErrorBoundary>
            <Hobbies />
          </ErrorBoundary>
        </section>
      </main>

      <footer id="contact" className="min-h-screen flex flex-col justify-center">
        <Contact />
      </footer>

      <div className="fixed inset-0 pointer-events-none z-[100] ring-1 ring-white/5" />
    </motion.div>
  );
};

export default App;
