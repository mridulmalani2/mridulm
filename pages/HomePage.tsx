import React from 'react';
import Hero from '../components/Hero';
import Projects from '../components/Projects';
import VideoStory from '../components/VideoStory';
import Resume from '../components/Resume';
import Hobbies from '../components/Hobbies';
import Contact from '../components/Contact';
import ErrorBoundary from '../components/ErrorBoundary';

const HomePage: React.FC = () => {
  return (
    <>
      <main id="main-content" className="relative perspective-main">
        <section id="hero" className="min-h-screen flex items-center justify-center">
          <Hero />
        </section>

        <section id="projects" className="min-h-screen flex flex-col justify-center bg-black/40">
          <ErrorBoundary>
            <Projects />
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
    </>
  );
};

export default HomePage;
