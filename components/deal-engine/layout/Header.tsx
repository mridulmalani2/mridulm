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
      className="flex items-center justify-between px-4 h-10 flex-shrink-0"
      style={{ background: '#0a0d13', borderBottom: '1px solid #1e2a3a' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-medium tracking-wide"
          style={{ color: '#00d4ff', fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {modelState?.deal_name || 'Deal Engine'}
        </span>
        <span className="text-xs" style={{ color: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}>
          {modelState?.currency || 'GBP'}
        </span>
        {isCalculating && (
          <span className="text-xs animate-pulse" style={{ color: '#ffaa00', fontFamily: "'IBM Plex Mono', monospace" }}>
            Calculating...
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {modelState && (
          <>
            <button onClick={exportExcel} className="px-2 py-1 text-xs transition-colors hover:text-white" style={{ color: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}>
              Export .xlsx
            </button>
            <button onClick={saveModel} className="px-2 py-1 text-xs transition-colors hover:text-white" style={{ color: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}>
              Save
            </button>
            <button onClick={handleLoadFile} className="px-2 py-1 text-xs transition-colors hover:text-white" style={{ color: '#6b7a96', fontFamily: "'IBM Plex Mono', monospace" }}>
              Load
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Header;
