# Trace Graph — Feature Specification for Claude Code

## Context

This feature is being added to the Deal Intelligence Engine, a professional PE deal modelling tool built with React + TypeScript (frontend) and FastAPI/Python (backend). The full system spec is in `deal_engine.md`. This document specifies one new feature only: the **Trace Graph**.

---

## Feature Overview

**Trace Graph** is an interactive node-graph overlay that lets users double-click any numerical output in the Model Dashboard to explore how that number was computed — tracing both upstream (what inputs produced this number) and downstream (what outputs does this number feed into), across as many levels as the user wants to follow.

The result is a floating, interactive web of connected cards in a 2D canvas — like a live, navigable dependency graph of the financial model.

---

## Trigger

- **Double-click** on any numerical value rendered in the Model Dashboard to open its Trace Card.
- Single-click does nothing extra. Hover does nothing extra. Only double-click opens a card.
- A `data-trace-id` attribute must be added to every traceable `<span>` or display element wrapping a number, identifying which model output it represents (e.g. `data-trace-id="returns.irr"`).
- First double-click opens the canvas overlay and places the first card. Subsequent double-clicks on other numbers add more cards to the same canvas (canvas stays open).

---

## Canvas Overlay

- Full-screen overlay rendered above the dashboard using a `<canvas>`-backed or pure CSS/SVG positioned layer.
- **Not** a modal. It is a persistent layer that stays open while the user continues to interact with the dashboard beneath it, which should remain accessible. Use `pointer-events` carefully: the canvas layer captures events only on cards and edges; clicks that miss all cards pass through to the dashboard.
- A small **"Close Trace Graph"** button fixed to the top-right of the overlay. Closes the overlay and destroys all open cards.
- The canvas is pan-able (click-drag on empty space) and zoom-able (scroll wheel). Use a standard 2D transform matrix for this. No 3D — pure 2D canvas with high visual quality.
- Cards can be individually dragged to rearrange.
- Maximum 10 cards open simultaneously. If the user tries to open an 11th, the oldest card is removed and its edges are cleaned up.

---

## Trace Cards

Each card is a floating panel rendered as a DOM element (not drawn on canvas — use absolutely positioned `div`s over a CSS canvas layer for the connecting edges). This keeps accessibility and text rendering clean.

### Card Anatomy

```
┌──────────────────────────────────────────────────┐
│  [field label]                         [×] close │
│                                                   │
│  [symbolic formula]                               │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  INPUTS (feeds into this)                         │
│  • [value A]  →  [value B]  →  ...                │
│                                                   │
│  OUTPUTS (this feeds into)                        │
│  • [dependent X]  →  [dependent Y]  →  ...        │
│                                                   │
└──────────────────────────────────────────────────┘
```

**Field label**: human-readable name (e.g. "Equity IRR", "Exit EBITDA", "Year 3 Revenue"). Not the dot-notation path.

**Symbolic formula**: the formula used to derive this value, written as a clean symbolic expression. Examples:
- `Exit IRR = solve r: Σ CF[t] / (1+r)^t = 0`
- `EBITDA[t] = Revenue[t] × Margin[t]`
- `Exit EV = Exit EBITDA × Exit Multiple`
- `FCF[t] = EBITDA[t] − Tax[t] − Capex[t] − ΔNWC[t]`
- `Entry Equity = EV + Fees − Total Debt`

For user-input leaf nodes, show: `[Field Name] = user input` with the current value displayed large below.

**Inputs section**: list of the immediate upstream values that appear in this formula. Each is a clickable chip showing the field name and current value. Clicking a chip opens a new Trace Card for that value.

**Outputs section**: list of the immediate downstream values that this number feeds into. Each is also a clickable chip. Clicking opens a new Trace Card for that dependent.

**Leaf node (user input)**: when a value is a direct user input (no formula), show:
- Field name
- "User input" label
- Current value (large)
- An inline editable input field with the current value pre-filled
- A "Apply" button — clicking it calls `POST /api/model/update` with the field path and new value, triggers full recalculation, and updates all open cards' displayed values live

### Card Visual Style

- White/dark background matching the app theme (use CSS variables)
- Subtle border with box-shadow for elevation
- Compact but readable — ~320px wide, height auto
- Field label: 13px, muted color
- Formula: 15px monospace, slightly highlighted background band
- Chips: pill-shaped, 12px, show field name + value, hover state indicating clickability
- Input fields: user-input chips use a slightly different accent color (amber or similar) to distinguish them from computed values
- Close button (×) top-right of each card

---

## Connecting Edges

- Between any two open cards that share a direct dependency, draw a directed arrow edge.
- Edges are drawn on an SVG layer that sits between the card DOM layer and the dashboard. The SVG is absolutely positioned, full-screen, `pointer-events: none`.
- Arrow direction: from the input card toward the dependent card (upstream → downstream).
- Each edge has a small label at its midpoint showing the **linking value** — the actual number that flows from one node to the other (e.g. "€105.4m", "8.5x"). This label sits in a small pill on the edge midpoint.
- Edge routing: use smooth cubic bezier curves. Source port from the right edge of the upstream card, target port to the left edge of the downstream card. If cards are stacked vertically, exit/enter from bottom/top ports instead — pick the port pair that minimises crossing.
- Edge color: use a single neutral color (match the app's border color). Do not color-code edges.
- When a card is dragged, its edges update live (requestAnimationFrame loop recalculating bezier control points).
- When a card is closed, its edges are removed. If this leaves another card orphaned (no remaining connections), that card stays open but loses its edges.

---

## Trace Graph Data — Backend

The backend must expose one new endpoint:

```
GET /api/trace/{field_path}
Returns: TraceNode
```

```python
class TraceNode(BaseModel):
    field_path: str               # dot-notation: "returns.irr"
    label: str                    # human-readable: "Equity IRR"
    value: float                  # current computed value
    formula_symbolic: str         # symbolic formula string (see examples above)
    is_user_input: bool           # True = leaf node
    inputs: list[TraceEdge]       # immediate upstream dependencies
    outputs: list[TraceEdge]      # immediate downstream dependents

class TraceEdge(BaseModel):
    field_path: str               # the connected field
    label: str                    # human-readable name
    value: float                  # current value of that field
    linking_value: float          # the value flowing along this edge (usually same as value)
    linking_label: str            # formatted display string: "€105.4m", "8.5x", "23.4%"
```

The trace graph is **hardcoded as a static dependency map** in the backend — not dynamically inferred. Define a `TRACE_MAP` dictionary that lists, for every traceable field:
- its symbolic formula string
- its list of input field paths
- its list of output field paths

This map must cover at minimum:

| Field | Formula |
|---|---|
| `returns.irr` | `solve r: Σ CF[t]/(1+r)^t = 0` |
| `returns.moic` | `Exit Equity / Entry Equity` |
| `exit.exit_ev` | `Exit EBITDA × Exit Multiple` |
| `exit.exit_equity` | `Exit EV − Exit Net Debt − MIP Payout` |
| `exit.exit_ebitda` | `Revenue[HP] × Margin[HP]` |
| `exit.exit_net_debt` | `Σ Ending Balance[HP] − Cash[HP]` |
| `entry.equity_check` | `EV + Fees − Total Debt` |
| `projections.ebitda[t]` | `Revenue[t] × Margin[t]` |
| `projections.revenue[t]` | `Revenue[t−1] × (1 + Growth[t]) + Acq[t]` |
| `projections.fcf_pre_debt[t]` | `EBITDA[t] − Tax[t] − Capex[t] − ΔNWC[t]` |
| `projections.interest[t]` | `Σ Beginning Balance[t] × Rate[t]` |
| `mip.mip_payout` | `MIP Pool % × Exit Equity (pre-MIP)` |
| `value_drivers.*` | per bridge formula from spec Section 3.5 |

Leaf nodes (user inputs) are any field in `entry`, `revenue`, `margins`, `tax`, `fees`, `mip`, `exit` that are direct user-entered assumptions (not computed). These return `is_user_input: true` and empty `inputs` list.

When `POST /api/model/update` is called (existing endpoint), it must also invalidate and recompute any cached trace values. After recalculation, the frontend should re-fetch all currently open cards' trace data and update displayed values.

---

## Frontend Implementation Notes

### Component Structure

```
TraceGraphOverlay/
  index.tsx              — overlay container, pan/zoom state, card registry
  TraceCard.tsx          — individual card component
  EdgeLayer.tsx          — SVG layer rendering all edges
  useTraceGraph.ts       — hook managing card state, fetch logic, edge computation
  traceFormatters.ts     — value formatting for edge labels and chips
```

### State Shape

```typescript
interface TraceGraphState {
  isOpen: boolean
  cards: Map<string, TraceCardState>         // keyed by field_path
  edges: TraceEdge[]                         // all active edges between open cards
  canvasTransform: { x: number, y: number, scale: number }
}

interface TraceCardState {
  fieldPath: string
  node: TraceNode                            // fetched from /api/trace/{field_path}
  position: { x: number, y: number }        // canvas coordinates
  openedAt: number                           // timestamp, for LRU eviction at 10-card limit
}
```

### Performance

- Use `React.memo` on `TraceCard` — cards should not re-render unless their own node data changes.
- Edge SVG updates should use `requestAnimationFrame` during drag only, not on every state update.
- Do not re-fetch all open cards on every model update — only re-fetch the fields that actually changed (use the list of updated field paths returned by `POST /api/model/update`).
- The overlay must not affect Model Dashboard render performance when closed (`display: none`, not unmounted — preserve card state if user closes and reopens).

### Double-click Registration

Add a utility `attachTraceTarget(fieldPath: string)` that wraps a value display element and attaches the double-click handler. Use this in every output component:

```tsx
// In ReturnsSummary.tsx
<span {...attachTraceTarget('returns.irr')}>{formatIRR(irr)}</span>

// In ValueBridge.tsx
<span {...attachTraceTarget('value_drivers.revenue_growth_contribution_abs')}>{formatCurrency(val)}</span>
```

This utility returns `{ 'data-trace-id': fieldPath, onDoubleClick: handler, className: 'traceable' }`.

Add a subtle CSS rule: `.traceable:hover { cursor: crosshair; }` — the only visual affordance that a number is traceable. No underlines, no icons, no permanent UI decoration.

---

## Scope

Implement traceability for these output sections (minimum viable set):

1. **Returns Summary** — IRR, MOIC, entry equity, exit equity
2. **Value Bridge** — all five contribution bars (absolute values)
3. **Exit section** — Exit EV, Exit EBITDA, Exit Net Debt, Exit Equity, MIP Payout
4. **Debt Schedule** — total debt at exit, interest coverage ratio
5. **Entry section** — Equity Check, Entry Revenue Multiple

Sensitivity heatmap cells and scenario panel values are **out of scope** for this feature — those are computed across many model variants and do not have a single traceable formula instance.

---

## Risks and Constraints

- **Edge routing degrades with many cards**: bezier curves between 10 cards can become visually tangled. The LRU 10-card limit mitigates this, but consider adding a "tidy layout" button that auto-arranges cards in a left-to-right dependency order.
- **Hardcoded trace map maintenance**: when the financial model engine is updated, the `TRACE_MAP` must be manually updated too. Add a comment block in `trace_map.py` flagging this as a maintenance responsibility.
- **Per-year projections**: fields like `projections.revenue[t]` are arrays. The trace system should handle these by opening a card for the specific year-instance the user clicked (the `data-trace-id` on year-3 revenue would be `projections.revenue.3`). Design the backend endpoint to support this notation.
- **IRR formula display**: IRR is not a closed-form expression — the symbolic formula should display the NPV equation, not pretend it resolves algebraically. Be precise.
