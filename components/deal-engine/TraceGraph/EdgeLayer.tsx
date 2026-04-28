import React, { useMemo } from 'react';
import type { TraceCardState } from '../../../lib/traceTypes';

const CARD_W = 330;
const CARD_H_APPROX = 220; // approximate height for port estimation

interface EdgeLayerProps {
  cards: Map<string, TraceCardState>;
  transform: { x: number; y: number; scale: number };
}

interface Edge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  linkingLabel: string;
  d: string;
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  // Adaptive control points: if cards are horizontally separated use left/right
  // ports; if vertically separated use top/bottom ports
  const dx = x2 - x1;
  const dy = y2 - y1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx >= absDy) {
    // Horizontal routing
    const cx = Math.abs(dx) * 0.45;
    return `M${x1},${y1} C${x1 + cx},${y1} ${x2 - cx},${y2} ${x2},${y2}`;
  } else {
    // Vertical routing
    const cy = Math.abs(dy) * 0.45;
    return `M${x1},${y1} C${x1},${y1 + cy} ${x2},${y2 - cy} ${x2},${y2}`;
  }
}

const EdgeLayer: React.FC<EdgeLayerProps> = React.memo(({ cards, transform }) => {
  const edges: Edge[] = useMemo(() => {
    const result: Edge[] = [];
    const cardArr = [...cards.values()];

    for (const upstreamCard of cardArr) {
      for (const outEdge of upstreamCard.node.outputs) {
        const downstreamCard = cards.get(outEdge.field_path);
        if (!downstreamCard) continue;

        const { x: ux, y: uy } = upstreamCard.position;
        const { x: dx, y: dy } = downstreamCard.position;

        const absDiffX = Math.abs(dx - ux);
        const absDiffY = Math.abs(dy - uy);

        let x1: number, y1: number, x2: number, y2: number;
        if (absDiffX >= absDiffY) {
          // Horizontal: right edge of upstream, left edge of downstream
          x1 = ux + CARD_W;
          y1 = uy + CARD_H_APPROX / 2;
          x2 = dx;
          y2 = dy + CARD_H_APPROX / 2;
        } else {
          // Vertical: bottom of upstream, top of downstream
          x1 = ux + CARD_W / 2;
          y1 = uy + CARD_H_APPROX;
          x2 = dx + CARD_W / 2;
          y2 = dy;
        }

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        result.push({
          key: `${upstreamCard.fieldPath}→${outEdge.field_path}`,
          x1, y1, x2, y2, midX, midY,
          linkingLabel: outEdge.linking_label,
          d: bezierPath(x1, y1, x2, y2),
        });
      }
    }
    return result;
  }, [cards]);

  if (edges.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
        <defs>
          <marker id="tg-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(17,17,17,0.55)" />
          </marker>
        </defs>
        {edges.map((edge) => (
          <g key={edge.key}>
            <path
              d={edge.d}
              fill="none"
              stroke="rgba(17,17,17,0.45)"
              strokeWidth={1.5}
              markerEnd="url(#tg-arrow)"
            />
            {/* Mid-point label pill */}
            {edge.linkingLabel && edge.linkingLabel !== '—' && (
              <g transform={`translate(${edge.midX},${edge.midY})`}>
                <rect
                  x={-26}
                  y={-10}
                  width={52}
                  height={20}
                  rx={4}
                  fill="#ffffff"
                  stroke="rgba(17,17,17,0.3)"
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={4.5}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="600"
                  fill="#111111"
                >
                  {edge.linkingLabel}
                </text>
              </g>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
});

EdgeLayer.displayName = 'EdgeLayer';
export default EdgeLayer;
