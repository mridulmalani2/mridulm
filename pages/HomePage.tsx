import React, { useEffect } from 'react';
import Hero from '../components/Hero';
import Projects from '../components/Projects';
import ParisBackdrop from '../components/ParisBackdrop';
import VideoStory from '../components/VideoStory';
import Resume from '../components/Resume';
import Hobbies from '../components/Hobbies';
import Contact from '../components/Contact';
import ErrorBoundary from '../components/ErrorBoundary';
import { SHOW_VIDEO_STORY } from '../config/features';

/**
 * Every home section is one uniform "page": a full viewport tall, its content
 * vertically centred, so scrolling flips cleanly from one whole section to the
 * next. The shared shell keeps them consistent - the individual components no
 * longer carry their own screen-height or vertical padding.
 */
const SECTION = 'snap-start flex min-h-[100svh] w-full flex-col justify-center';

const HomePage: React.FC = () => {
  // Turn on scroll-snapping only while the home page is mounted.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('snap-home');
    return () => root.classList.remove('snap-home');
  }, []);

  return (
    <>
      <main id="main-content" className="relative">
        <section id="hero" className={`${SECTION} items-center`}>
          <Hero />
        </section>

        <section id="projects" className={`${SECTION} relative overflow-hidden`}>
          <ParisBackdrop />
          <div className="relative z-10 w-full">
            <ErrorBoundary>
              <Projects />
            </ErrorBoundary>
          </div>
        </section>

        {SHOW_VIDEO_STORY && (
          <section id="video-story" className={`${SECTION} items-center`}>
            <ErrorBoundary>
              <VideoStory />
            </ErrorBoundary>
          </section>
        )}

        <section id="resume" className={SECTION}>
          <ErrorBoundary>
            <Resume />
          </ErrorBoundary>
        </section>

        <section id="hobbies" className={SECTION}>
          <ErrorBoundary>
            <Hobbies />
          </ErrorBoundary>
        </section>
      </main>

      <footer id="contact" className={SECTION}>
        <Contact />
      </footer>
    </>
  );
};

export default HomePage;
