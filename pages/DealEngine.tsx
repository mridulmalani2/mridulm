import React, { useState } from 'react';
import Workbench from '../components/deal-engine/v2/Workbench';
import { useEngine2Model } from '../store/engine2Model';
import { useDealEngineStore } from '../store/dealEngine';
import SourceScreen from '../components/deal-engine/start/SourceScreen';
import ManualFactsScreen from '../components/deal-engine/start/ManualFactsScreen';

/**
 * /deal-engine — single-engine routing (F tail, 2026-07-24; owner-accelerated deletion).
 * engine2 is THE engine: import screens feed its store synchronously; the workbench
 * renders the moment facts exist. The old flow is deleted (tag `pre-deletion-lib-engine`);
 * previous-engine saves surface an honest retirement notice instead of opening.
 */
export function resolveDealEngineSurface(p: { hasEngine2Facts: boolean }): 'workbench' | 'import-screens' {
  return p.hasEngine2Facts ? 'workbench' : 'import-screens';
}

const DealEngine: React.FC = () => {
  const engine2Facts = useEngine2Model((s) => s.facts);
  const legacySaveNotice = useDealEngineStore((s) => s.legacySaveNotice);
  const dismissLegacySaveNotice = useDealEngineStore((s) => s.dismissLegacySaveNotice);
  const [manualEntry, setManualEntry] = useState(false);

  // Dev-only handle for driving the workbench without the proxy (walkthroughs/tests);
  // stripped from production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__engine2 = useEngine2Model;
  }

  if (resolveDealEngineSurface({ hasEngine2Facts: engine2Facts !== null }) === 'workbench') {
    return <Workbench />;
  }

  return (
    <div>
      {legacySaveNotice && (
        <div className="relative z-20 flex items-center justify-between px-4 py-2" style={{ background: 'rgba(180,120,0,0.12)', borderBottom: '1px solid rgba(180,120,0,0.4)' }}>
          <p className="text-[11px]" style={{ color: '#92600a', fontFamily: "'JetBrains Mono', monospace" }}>
            This .json was saved by the previous engine, which has been retired — re-import the company from source to rebuild it here.
          </p>
          <button onClick={dismissLegacySaveNotice} className="text-[10px] uppercase tracking-widest px-2" style={{ color: '#92600a', fontFamily: "'JetBrains Mono', monospace" }}>
            dismiss
          </button>
        </div>
      )}
      {manualEntry
        ? <ManualFactsScreen onBack={() => setManualEntry(false)} />
        : <SourceScreen onManual={() => setManualEntry(true)} />}
    </div>
  );
};

export default DealEngine;
