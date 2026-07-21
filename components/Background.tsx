import React from 'react';

/**
 * Full-page base for the light theme: clean canvas with a whisper of grain.
 * Deliberately plain - the only colour on the landing page comes from the two
 * flag corners in the Hero, so the rest of the site stays crisp white.
 */
const Background: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 bg-canvas">
      {/* Fine grain for a little tactile warmth */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
};

export default Background;
