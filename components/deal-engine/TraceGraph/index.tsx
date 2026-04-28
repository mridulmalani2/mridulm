/**
 * TraceGraphOverlay — full-screen non-modal trace graph.
 *
 * Design notes:
 *  - Non-modal: the overlay is a persistent layer above the dashboard. Clicks
 *    that miss all cards pass through via pointer-events (recommendation #8:
 *    Trace Mode toggle prevents accidental activations).
 *  - Cards: DOM divs, absolutely positioned. SVG edges sit below cards.
 *  - Pan/zoom: canvas transform applied to a single inner div.
 *  - Tidy Layout: first-class button, not an afterthought (recommendation #10).
 *  - Uses display:none rather than unmount to preserve card state across close
 *    (recommendation #5 handles stale value refresh on reopen).
 */

import React, { useCallback, useRef } from 'react';
import type { UseTraceGraphReturn } from './useTraceGraph';
import TraceCard from './TraceCard';
import EdgeLayer from './EdgeLayer';

interface TraceGraphOverlayProps {
  graphHook: UseTraceGraphReturn;
  currency: string;
  traceModeActive: boolean;
}

const monoFont = "'JetBrains Mono', monospace";

const TraceGraphOverlay: React.FC<TraceGraphOverlayProps> = ({
  graphHook,
  currency,
  traceModeActive,
}) => {
  const {
    cards,
    isOpen,
    canvasTransform,
    closeOverlay,
    openCard,
    closeCard,
    clearCards,
    moveCard,
    panCanvas,
    zoomCanvas,
    tidyLayout,
  } = graphHook;

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ mx: number; my: number } | null>(null);

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only initiate pan on direct overlay click (not on card descendants)
      if ((e.target as HTMLElement).closest('[data-trace-card]')) return;
      isPanningRef.current = true;
      panStartRef.current = { mx: e.clientX, my: e.clientY };

      const onMove = (ev: MouseEvent) => {
        if (!panStartRef.current) return;
        panCanvas(ev.clientX - panStartRef.current.mx, ev.clientY - panStartRef.current.my);
        panStartRef.current = { mx: ev.clientX, my: ev.clientY };
      };
      const onUp = () => {
        isPanningRef.current = false;
        panStartRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [panCanvas],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Only zoom if pointer is over the overlay (not a card)
      if ((e.target as HTMLElement).closest('[data-trace-card]')) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      zoomCanvas(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    },
    [zoomCanvas],
  );

  const { x, y, scale } = canvasTransform;

  return (
    // Outer overlay — always mounted, display:none when closed (preserves state)
    <div
      style={{
        display: isOpen ? 'block' : 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        // Pointer events only on cards/controls — misses pass through to dashboard
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onMouseDown={onOverlayMouseDown}
      onWheel={onWheel}
    >
      {/* Opaque background — cards and edges read clearly against it */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#F4F4F0',
          pointerEvents: 'none',
        }}
      />

      {/* Edge SVG layer — below cards */}
      <EdgeLayer cards={cards} transform={canvasTransform} />

      {/* Cards canvas — transformed div */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${x}px,${y}px) scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none', // children opt-in individually
        }}
      >
        {[...cards.values()].map((card) => (
          <div key={card.fieldPath} data-trace-card="1" style={{ pointerEvents: 'auto' }}>
            <TraceCard
              card={card}
              currency={currency}
              onClose={() => closeCard(card.fieldPath)}
              onOpenCard={openCard}
              onMove={(pos) => moveCard(card.fieldPath, pos)}
              canvasScale={scale}
            />
          </div>
        ))}
      </div>

      {/* Fixed toolbar — top right */}
      <div
        style={{
          position: 'fixed',
          top: 52,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 110,
          pointerEvents: 'auto',
        }}
      >
        {cards.size > 1 && (
          <button
            onClick={tidyLayout}
            style={toolbarBtn(false)}
            title="Auto-arrange cards — inputs left, outputs right"
          >
            Tidy Layout
          </button>
        )}
        {cards.size > 0 && (
          <button
            onClick={clearCards}
            style={toolbarBtn(false)}
            title="Close all open trace cards"
          >
            Clear All
          </button>
        )}
        <button onClick={closeOverlay} style={toolbarBtn(true)}>
          Close
        </button>
      </div>

      {/* Card count indicator */}
      {cards.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            fontSize: 10,
            fontFamily: monoFont,
            color: 'rgba(17,17,17,0.35)',
            pointerEvents: 'none',
            letterSpacing: '0.06em',
          }}
        >
          {cards.size}/10 cards
        </div>
      )}

      {/* Empty state */}
      {cards.size === 0 && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 13, fontFamily: monoFont, color: 'rgba(17,17,17,0.3)', letterSpacing: '0.06em' }}>
            Click any underlined number on the dashboard to trace it
          </div>
          <div style={{ fontSize: 11, fontFamily: monoFont, color: 'rgba(17,17,17,0.2)', marginTop: 6 }}>
            Trace Mode is {traceModeActive ? 'ON — numbers are highlighted below' : 'OFF'}
          </div>
        </div>
      )}
    </div>
  );
};

function toolbarBtn(primary: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 10,
    fontFamily: monoFont,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    background: primary ? '#111111' : 'rgba(17,17,17,0.04)',
    color: primary ? '#ffffff' : 'rgba(17,17,17,0.55)',
    border: primary ? '1px solid #111111' : '1px solid rgba(17,17,17,0.15)',
  };
}

export default TraceGraphOverlay;
