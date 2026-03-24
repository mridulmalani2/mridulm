import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface ResearchLayoutProps {
  children: React.ReactNode;
}

const ResearchLayout: React.FC<ResearchLayoutProps> = ({ children }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative z-10 min-h-screen bg-[#F9F9F7] text-[#111111] selection:bg-[#CC0000] selection:text-white">
      {/* Subtle paper texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='0.5' fill='%23111111'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default ResearchLayout;
