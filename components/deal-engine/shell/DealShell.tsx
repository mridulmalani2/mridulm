/**
 * The deal-engine shell: one header for every step — where you are (Source → Clean →
 * Assumptions → Results), which company, the optional AI key, and the way out to a new deal.
 * AI is never a gate: every step works with no key, and the control says plainly that it is off.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDealEngineStore } from '../../../store/dealEngine';
import ApiKeyInline from '../start/ApiKeyInline';
import { Button, Stepper, type StepItem } from '../ui/kit';

const DealShell: React.FC<{
  steps: StepItem[];
  onGo: (id: string) => void;
  entity: string | null;
  currency: string | null;
  onNewDeal: () => void;
  children: React.ReactNode;
}> = ({ steps, onGo, entity, currency, onNewDeal, children }) => {
  const apiKey = useDealEngineStore((s) => s.apiKey);
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <div className="de-root min-h-screen font-sans">
      <header className="sticky top-0 z-30 bg-[var(--de-surface)] border-b border-[color:var(--de-rule)]">
        <div className="max-w-[1440px] mx-auto px-6">
          <div className="flex items-center justify-between gap-4 pt-3">
            <div className="flex items-baseline gap-3 min-w-0">
              <Link to="/" className="font-sans text-[12px] text-[color:var(--de-ink-3)] hover:text-[color:var(--de-ink)] no-underline whitespace-nowrap">← mridulmalani.com</Link>
              <span className="font-playfair text-[18px] font-bold whitespace-nowrap">Deal Engine</span>
              <span className="font-sans text-[12px] text-[color:var(--de-ink-3)] whitespace-nowrap">LBO model</span>
              {entity && (
                <span className="font-sans text-[13px] font-semibold truncate border-l border-[color:var(--de-rule)] pl-3">
                  {entity}{currency && <span className="font-normal text-[color:var(--de-ink-3)]"> · {currency} m</span>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 relative">
              <Button size="sm" aria-expanded={keyOpen} onClick={() => setKeyOpen((o) => !o)}>
                AI: {apiKey ? 'on' : 'off'} · {apiKey ? 'change key' : 'add key'}
              </Button>
              {entity && <Button size="sm" onClick={onNewDeal}>New deal</Button>}
              {keyOpen && (
                <div className="absolute right-0 top-full mt-2 w-[26rem] max-w-[90vw] p-4 bg-[var(--de-surface)] border border-[color:var(--de-rule-strong)] shadow-lg">
                  <p className="font-sans text-[13px] text-[color:var(--de-ink-2)]">
                    Optional. Every step works without a key. With one, the Assumptions step can propose values and challenge yours — proposals only, never applied for you.
                  </p>
                  <ApiKeyInline />
                </div>
              )}
            </div>
          </div>
          <div className="mt-1"><Stepper steps={steps} onGo={onGo} /></div>
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
};

export default DealShell;
