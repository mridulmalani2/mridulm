import React from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';

const Header: React.FC = () => {
  const modelState = useDealEngineStore((s) => s.modelState);
  const exportExcel = useDealEngineStore((s) => s.exportExcel);
  const saveModel = useDealEngineStore((s) => s.saveModel);
  const loadModel = useDealEngineStore((s) => s.loadModel);
  const resetModel = useDealEngineStore((s) => s.resetModel);
  const isCalculating = useDealEngineStore((s) => s.isCalculating);

  const handleLoadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) loadModel(file);
    };
    input.click();
  };

  return (
    <div
      className="relative z-10 flex items-center justify-between px-3 lg:px-5 h-11 flex-shrink-0"
      style={{ background: '#F9F9F7', borderBottom: '1px solid rgba(17,17,17,0.1)' }}
    >
      <div className="flex items-center gap-3 lg:gap-4 min-w-0">
        {/* Back to site */}
        <Link
          to="/"
          className="text-[11px] transition-colors hover:text-[#111] flex-shrink-0"
          style={{ color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'none' }}
          title="Back to mridulmalani.com"
        >
          ←
        </Link>
        <div className="border-l-[2px] border-[#CC0000] pl-3 min-w-0">
          <span
            className="text-[11px] font-medium tracking-widest uppercase truncate block"
            style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {modelState?.deal_name || 'Deal Engine'}
          </span>
        </div>
        <span className="text-[10px] tracking-widest hidden sm:block" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
          {modelState?.currency || 'INR'}
        </span>
        {isCalculating && (
          <span className="text-[10px] tracking-widest uppercase animate-pulse" style={{ color: '#b45309', fontFamily: "'JetBrains Mono', monospace" }}>
            Calculating...
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5 lg:gap-1">
        {modelState && (
          <>
            <button
              onClick={exportExcel}
              className="px-2 lg:px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111] hidden sm:block"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Export .xlsx
            </button>
            <button
              onClick={saveModel}
              className="px-2 lg:px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111] hidden sm:block"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Save
            </button>
            <button
              onClick={handleLoadFile}
              className="px-2 lg:px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111] hidden sm:block"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Load
            </button>
            <button
              onClick={resetModel}
              className="px-2 lg:px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors"
              style={{
                color: 'rgba(17,17,17,0.4)',
                fontFamily: "'JetBrains Mono', monospace",
                border: '1px solid rgba(17,17,17,0.12)',
              }}
              title="Start a new deal"
            >
              New Deal
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Header;
