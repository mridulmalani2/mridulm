import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TravelMotif } from '../components/AmbientMotifs';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {/* A plane slightly off course — fitting for a lost page */}
      <TravelMotif className="right-10 top-28 hidden w-64 md:block" />
      <p className="mb-4 font-montserrat text-xs font-bold uppercase tracking-[0.25em] text-[#A25600]">
        Error 404
      </p>
      <h1 className="mb-4 font-display text-5xl font-black text-ink md:text-7xl">
        Page not found
      </h1>
      <p className="mb-10 max-w-md text-muted">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <button
        onClick={() => navigate('/')}
        className="flex min-h-[48px] items-center rounded-full bg-saffron px-8 py-4 font-montserrat text-sm font-bold tracking-wider text-ink shadow-[0_12px_30px_-10px_rgba(255,181,107,0.9)] transition-all hover:brightness-105"
      >
        Back home
      </button>
    </div>
  );
};

export default NotFound;
