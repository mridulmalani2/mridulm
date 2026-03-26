import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';

const Header: React.FC = () => {
  const modelState = useDealEngineStore((s) => s.modelState);
  const exportExcel = useDealEngineStore((s) => s.exportExcel);
  const saveModel = useDealEngineStore((s) => s.saveModel);
  const loadModel = useDealEngineStore((s) => s.loadModel);
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
      className="relative z-10 flex items-center justify-between px-5 h-11 flex-shrink-0"
      style={{ background: '#F9F9F7', borderBottom: '1px solid rgba(17,17,17,0.1)' }}
    >
      <div className="flex items-center gap-4">
        <div className="border-l-[2px] border-[#CC0000] pl-3">
          <span
            className="text-[11px] font-medium tracking-widest uppercase"
            style={{ color: '#111111', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {modelState?.deal_name || 'Deal Engine'}
          </span>
        </div>
        <span className="text-[10px] tracking-widest" style={{ color: 'rgba(17,17,17,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
          {modelState?.currency || 'GBP'}
        </span>
        {isCalculating && (
          <span className="text-[10px] tracking-widest uppercase animate-pulse" style={{ color: '#b45309', fontFamily: "'JetBrains Mono', monospace" }}>
            Calculating...
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {modelState && (
          <>
            <button
              onClick={exportExcel}
              className="px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111]"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Export .xlsx
            </button>
            <button
              onClick={saveModel}
              className="px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111]"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Save
            </button>
            <button
              onClick={handleLoadFile}
              className="px-2.5 py-1 text-[10px] tracking-wider uppercase transition-colors hover:text-[#111]"
              style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              Load
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Header;
