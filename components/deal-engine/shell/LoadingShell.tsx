/**
 * What the deal engine shows while its code is on the way: the header in place and quiet grey
 * bars where the page will be, on the same paper colour, so the screen never flashes dark or
 * jumps when the real page arrives. It imports nothing heavy; that is the point of it.
 */
import React from 'react';

const Bar: React.FC<{ className: string }> = ({ className }) => <span aria-hidden="true" className={`de-skeleton block ${className}`} />;

const LoadingShell: React.FC = () => (
  <div className="de-root min-h-screen" role="status" aria-label="Loading the deal engine">
    <header className="border-b border-[color:var(--de-rule)]">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <span className="de-display text-[19px] whitespace-nowrap">Deal Engine</span>
        <Bar className="hidden sm:block h-8 w-80 !rounded-full" />
        <Bar className="h-8 w-24" />
      </div>
    </header>
    <div className="max-w-[1100px] mx-auto px-6 pt-12">
      <Bar className="h-10 w-72" />
      <Bar className="h-4 w-[28rem] max-w-full mt-4" />
      <Bar className="h-44 w-full mt-8 !rounded-[var(--de-r)]" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5">
        {[0, 1, 2].map((i) => <Bar key={i} className="h-32 !rounded-[var(--de-r)]" />)}
      </div>
    </div>
  </div>
);

export default LoadingShell;
