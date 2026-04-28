import React, { useRef, useState, useCallback } from 'react';
import type { TraceCardState } from '../../../lib/traceTypes';
import { formatTraceValue } from './traceFormatters';

interface TraceCardProps {
  card: TraceCardState;
  currency: string;
  onClose: () => void;
  onOpenCard: (fieldPath: string) => void;
  onMove: (pos: { x: number; y: number }) => void;
  canvasScale: number;
}

const monoFont = "'JetBrains Mono', monospace";
const serifFont = 'Lora, serif';

const TraceCard: React.FC<TraceCardProps> = React.memo(
  ({ card, currency, onClose, onOpenCard, onMove, canvasScale }) => {
    const { node, position } = card;
    const dragStart = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button,input,a')) return;
        e.stopPropagation();
        dragStart.current = { mx: e.clientX, my: e.clientY, cx: position.x, cy: position.y };
        setIsDragging(true);

        const onMouseMove = (ev: MouseEvent) => {
          if (!dragStart.current) return;
          const dx = (ev.clientX - dragStart.current.mx) / canvasScale;
          const dy = (ev.clientY - dragStart.current.my) / canvasScale;
          onMove({ x: dragStart.current.cx + dx, y: dragStart.current.cy + dy });
        };
        const onMouseUp = () => {
          dragStart.current = null;
          setIsDragging(false);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      },
      [position, canvasScale, onMove],
    );

    const chipStyle = (isUserInput: boolean): React.CSSProperties => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      borderRadius: 99,
      fontSize: 11,
      fontFamily: monoFont,
      cursor: 'pointer',
      background: isUserInput ? 'rgba(180,83,9,0.07)' : 'rgba(17,17,17,0.05)',
      border: `1px solid ${isUserInput ? 'rgba(180,83,9,0.25)' : 'rgba(17,17,17,0.12)'}`,
      color: isUserInput ? '#b45309' : '#111111',
      userSelect: 'none',
    });

    return (
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: 330,
          background: '#ffffff',
          border: '1px solid rgba(17,17,17,0.15)',
          boxShadow: isDragging
            ? '0 8px 24px rgba(17,17,17,0.18)'
            : '3px 3px 0 rgba(17,17,17,0.06)',
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: isDragging ? 10 : 5,
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderBottom: '1px solid rgba(17,17,17,0.08)',
            background: '#F9F9F7',
          }}
        >
          <span style={{ fontSize: 10, fontFamily: monoFont, color: 'rgba(17,17,17,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {node.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {node.converged_via_iteration && (
              <span
                title="This value is resolved via the iterative convergence loop — its dependency graph is circular."
                style={{
                  fontSize: 9,
                  fontFamily: monoFont,
                  color: '#b45309',
                  border: '1px solid rgba(180,83,9,0.3)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  letterSpacing: '0.04em',
                }}
              >
                ↻ iter
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{ fontSize: 11, color: 'rgba(17,17,17,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              aria-label="Close card"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '10px 12px' }}>
          {/* Current value */}
          <div style={{ marginBottom: 8 }}>
            {node.is_user_input ? (
              <span style={{ fontSize: 10, fontFamily: monoFont, color: '#b45309', letterSpacing: '0.06em' }}>
                User input
              </span>
            ) : null}
            <div style={{ fontSize: 22, fontFamily: monoFont, fontWeight: 700, color: '#111111', lineHeight: 1.2 }}>
              {formatTraceValue(node.value, node.field_path, currency)}
            </div>
          </div>

          {/* Symbolic formula */}
          <div
            style={{
              padding: '5px 8px',
              background: 'rgba(17,17,17,0.03)',
              border: '1px solid rgba(17,17,17,0.08)',
              marginBottom: 10,
            }}
          >
            <pre
              style={{
                fontSize: 11,
                fontFamily: monoFont,
                color: '#111111',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.55,
              }}
            >
              {node.formula_symbolic}
            </pre>
          </div>

          {/* Inputs */}
          {node.inputs.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontFamily: monoFont, color: 'rgba(17,17,17,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Inputs
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {node.inputs.map((inp) => (
                  <button
                    key={inp.field_path}
                    onClick={(e) => { e.stopPropagation(); onOpenCard(inp.field_path); }}
                    style={chipStyle(false)}
                    title={inp.field_path}
                  >
                    <span>{inp.label}</span>
                    <span style={{ opacity: 0.55 }}>{inp.linking_label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Outputs */}
          {node.outputs.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: monoFont, color: 'rgba(17,17,17,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Feeds into
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {node.outputs.map((out) => (
                  <button
                    key={out.field_path}
                    onClick={(e) => { e.stopPropagation(); onOpenCard(out.field_path); }}
                    style={chipStyle(false)}
                    title={out.field_path}
                  >
                    <span>{out.label}</span>
                    <span style={{ opacity: 0.55 }}>{out.linking_label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

TraceCard.displayName = 'TraceCard';
export default TraceCard;
