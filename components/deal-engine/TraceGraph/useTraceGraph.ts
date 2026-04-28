/**
 * useTraceGraph — state management hook for the Trace Graph overlay.
 *
 * Key behaviours implemented:
 *  - Max 10 cards; LRU eviction when 11th is added.
 *  - Stale-card invalidation on reopen (recommendation #5): cards opened in a
 *    previous model version are refreshed when the overlay reopens.
 *  - Batch node resolution: resolves all cards at once from the current
 *    modelState without network calls (recommendation #4).
 *  - Changed-field selective refresh: when the model updates, only cards whose
 *    field is in changedFields are refreshed (recommendation #1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelState } from '../../../lib/dealEngineTypes';
import type { TraceNode, TraceCardState } from '../../../lib/traceTypes';
import { TRACE_MAP, ITERATIVE_FIELDS, resolveTraceValue, traceLabel } from '../../../lib/traceMap';
import { formatTraceValue } from './traceFormatters';

const MAX_CARDS = 10;

function buildNode(ms: ModelState, fieldPath: string, modelVersion: number): TraceCardState | null {
  const parts = fieldPath.split('.');
  let mapKey = fieldPath;
  if (parts.length === 3 && parts[0] === 'projections' && /^\d+$/.test(parts[2])) {
    mapKey = parts[0] + '.' + parts[1];
  }
  const entry = TRACE_MAP[mapKey];
  if (!entry) return null;

  const currency = ms.currency ?? 'GBP';
  const value = resolveTraceValue(ms, fieldPath);

  const makeEdge = (fp: string) => {
    const v = resolveTraceValue(ms, fp);
    return {
      field_path: fp,
      label: traceLabel(fp),
      value: v,
      linking_label: formatTraceValue(v, fp, currency),
    };
  };

  const node: TraceNode = {
    field_path: fieldPath,
    label: entry.label,
    value,
    formula_symbolic: entry.formula_symbolic,
    is_user_input: entry.is_user_input,
    converged_via_iteration: ITERATIVE_FIELDS.has(mapKey),
    inputs: entry.inputs.map(makeEdge),
    outputs: entry.outputs.map(makeEdge),
  };

  return {
    fieldPath,
    node,
    position: { x: 0, y: 0 },
    openedAt: Date.now(),
    fetchedAtVersion: modelVersion,
  };
}

export interface UseTraceGraphReturn {
  cards: Map<string, TraceCardState>;
  isOpen: boolean;
  canvasTransform: { x: number; y: number; scale: number };
  openOverlay: () => void;
  closeOverlay: () => void;
  openCard: (fieldPath: string) => void;
  closeCard: (fieldPath: string) => void;
  moveCard: (fieldPath: string, pos: { x: number; y: number }) => void;
  panCanvas: (dx: number, dy: number) => void;
  zoomCanvas: (delta: number, cx: number, cy: number) => void;
  tidyLayout: () => void;
}

export function useTraceGraph(
  modelState: ModelState | null,
  modelVersion: number,
  changedFields: string[],
): UseTraceGraphReturn {
  const [cards, setCards] = useState<Map<string, TraceCardState>>(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [canvasTransform, setCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const prevVersionRef = useRef(modelVersion);

  // Refresh cards whose field changed after a model update
  useEffect(() => {
    if (!modelState || !isOpen || changedFields.length === 0) return;
    setCards((prev) => {
      const next = new Map(prev);
      for (const fp of changedFields) {
        if (next.has(fp)) {
          const updated = buildNode(modelState, fp, modelVersion);
          if (updated) {
            next.set(fp, { ...updated, position: prev.get(fp)!.position });
          }
        }
      }
      return next;
    });
  }, [modelState, modelVersion, changedFields, isOpen]);

  // On overlay reopen: refresh any card fetched in a prior model version (recommendation #5)
  const openOverlay = useCallback(() => {
    setIsOpen(true);
    if (!modelState) return;
    const currentVersion = modelVersion;
    setCards((prev) => {
      const next = new Map(prev);
      for (const [fp, card] of prev) {
        if (card.fetchedAtVersion !== currentVersion) {
          const updated = buildNode(modelState, fp, currentVersion);
          if (updated) next.set(fp, { ...updated, position: card.position });
        }
      }
      return next;
    });
    prevVersionRef.current = currentVersion;
  }, [modelState, modelVersion]);

  const closeOverlay = useCallback(() => setIsOpen(false), []);

  const openCard = useCallback(
    (fieldPath: string) => {
      if (!modelState) return;
      setIsOpen(true);
      setCards((prev) => {
        const next = new Map(prev);

        if (next.has(fieldPath)) return next; // already open

        // LRU eviction at max 10 cards
        if (next.size >= MAX_CARDS) {
          let oldest: string | null = null;
          let oldestTime = Infinity;
          for (const [fp, c] of next) {
            if (c.openedAt < oldestTime) { oldestTime = c.openedAt; oldest = fp; }
          }
          if (oldest) next.delete(oldest);
        }

        const card = buildNode(modelState, fieldPath, modelVersion);
        if (!card) return prev;

        // Place new card offset from last card to avoid full overlap
        const positions = [...next.values()].map((c) => c.position);
        const lastPos = positions[positions.length - 1] ?? { x: 60, y: 60 };
        card.position = { x: lastPos.x + 360, y: lastPos.y };

        next.set(fieldPath, card);
        return next;
      });
    },
    [modelState, modelVersion],
  );

  const closeCard = useCallback((fieldPath: string) => {
    setCards((prev) => {
      const next = new Map(prev);
      next.delete(fieldPath);
      return next;
    });
  }, []);

  const moveCard = useCallback((fieldPath: string, pos: { x: number; y: number }) => {
    setCards((prev) => {
      const card = prev.get(fieldPath);
      if (!card) return prev;
      const next = new Map(prev);
      next.set(fieldPath, { ...card, position: pos });
      return next;
    });
  }, []);

  const panCanvas = useCallback((dx: number, dy: number) => {
    setCanvasTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const zoomCanvas = useCallback((delta: number, cx: number, cy: number) => {
    setCanvasTransform((t) => {
      const factor = delta > 0 ? 1.1 : 0.91;
      const newScale = Math.max(0.3, Math.min(3, t.scale * factor));
      // Zoom toward cursor
      const dx = (cx - t.x) * (1 - newScale / t.scale);
      const dy = (cy - t.y) * (1 - newScale / t.scale);
      return { x: t.x + dx, y: t.y + dy, scale: newScale };
    });
  }, []);

  // Tidy Layout — auto-arrange cards in topological dependency order (recommendation #10)
  const tidyLayout = useCallback(() => {
    setCards((prev) => {
      if (prev.size === 0) return prev;

      // Build a simple topo sort: cards whose inputs are also open come first
      const fps = [...prev.keys()];
      const openSet = new Set(fps);

      // Score by "how many of my inputs are open" (descending = roots first)
      const score = (fp: string) => {
        const entry = TRACE_MAP[fp];
        if (!entry) return 0;
        return entry.inputs.filter((inp) => openSet.has(inp)).length;
      };
      const sorted = [...fps].sort((a, b) => score(a) - score(b));

      const CARD_W = 340;
      const CARD_H = 220;
      const GAP_X = 60;
      const GAP_Y = 40;
      const COLS = Math.ceil(Math.sqrt(sorted.length));

      const next = new Map(prev);
      sorted.forEach((fp, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const card = prev.get(fp)!;
        next.set(fp, {
          ...card,
          position: { x: col * (CARD_W + GAP_X) + 60, y: row * (CARD_H + GAP_Y) + 60 },
        });
      });
      return next;
    });
    // Reset canvas transform to fit the tidy layout
    setCanvasTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  return {
    cards,
    isOpen,
    canvasTransform,
    openOverlay,
    closeOverlay,
    openCard,
    closeCard,
    moveCard,
    panCanvas,
    zoomCanvas,
    tidyLayout,
  };
}
