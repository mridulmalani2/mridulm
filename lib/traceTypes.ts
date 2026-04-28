/** Trace Graph type definitions — mirrors backend/trace_map.py Pydantic models. */

export interface TraceEdge {
  field_path: string;
  label: string;
  value: number | null;
  linking_label: string;
}

export interface TraceNode {
  field_path: string;
  label: string;
  value: number | null;
  formula_symbolic: string;
  /** Actual numbers substituted into the formula, e.g. "₹25.0m × 10.0x = ₹250.0m" */
  formula_computed: string | null;
  is_user_input: boolean;
  /** True for fields resolved via the iterative convergence loop (circular deps). */
  converged_via_iteration: boolean;
  inputs: TraceEdge[];
  outputs: TraceEdge[];
}

export interface TraceCardState {
  fieldPath: string;
  node: TraceNode;
  position: { x: number; y: number };
  openedAt: number;
  fetchedAtVersion: number;
}

export interface TraceGraphState {
  isOpen: boolean;
  cards: Map<string, TraceCardState>;
  canvasTransform: { x: number; y: number; scale: number };
}
