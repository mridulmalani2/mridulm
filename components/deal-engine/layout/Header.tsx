import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';

interface HeaderButtonProps {
  onClick: () => void;
  label: string;
  tooltip: string;
  accent?: boolean;
}

const HeaderButton: React.FC<HeaderButtonProps> = ({ onClick, label, tooltip, accent }) => {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative hidden sm:block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        onClick={onClick}
        className="px-2.5 py-1 text-[10px] tracking-wider uppercase transition-all"
        style={{
          color: accent ? 'rgba(17,17,17,0.55)' : 'rgba(17,17,17,0.4)',
          fontFamily: "'JetBrains Mono', monospace",
          border: accent ? '1px solid rgba(17,17,17,0.2)' : '1px solid rgba(17,17,17,0.1)',
          background: show ? (accent ? 'rgba(17,17,17,0.05)' : 'rgba(17,17,17,0.03)') : 'transparent',
        }}
      >
        {label}
      </button>
      {show && (
        <div
          className="absolute right-0 top-full mt-1.5 z-[200] w-52 p-3 pointer-events-none"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(17,17,17,0.12)',
            boxShadow: '3px 3px 0px rgba(17,17,17,0.06)',
          }}
        >
          <p
            className="text-[11px] leading-[1.65]"
            style={{ color: 'rgba(17,17,17,0.6)', fontFamily: 'Lora, serif' }}
          >
            {tooltip}
          </p>
        </div>
      )}
    </div>
  );
};

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
      {/* Left: back + deal name */}
      <div className="flex items-center gap-3 lg:gap-4 min-w-0">
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
          <span className="text-[10px] tracking-widest uppercase animate-pulse hidden sm:block" style={{ color: '#b45309', fontFamily: "'JetBrains Mono', monospace" }}>
            Calculating...
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      {modelState && (
        <div className="flex items-center gap-1">
          <HeaderButton
            onClick={exportExcel}
            label="Export .xlsx"
            tooltip="Download your full model as a formatted Excel file — debt schedules, return tables, and sensitivity analysis all included."
          />
          <HeaderButton
            onClick={saveModel}
            label="Save"
            tooltip="Save your current model to a JSON file. Load it back at any time to pick up exactly where you left off."
          />
          <HeaderButton
            onClick={handleLoadFile}
            label="Load"
            tooltip="Load a previously saved JSON model file to restore a deal and continue working on it."
          />
          <HeaderButton
            onClick={resetModel}
            label="New Deal"
            tooltip="Clear the current model and start a new LBO from scratch. Your current deal will not be saved automatically."
            accent
          />
        </div>
      )}
    </div>
  );
};

export default Header;
