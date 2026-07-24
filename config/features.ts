/**
 * UI feature flags.
 *
 * These hide sections from the interface WITHOUT deleting any code — every
 * gated route, component, and data file stays on disk and keeps compiling.
 * Flip a flag back to `true` to restore the section instantly.
 */

// The research section is unfinished. Hidden from navigation for now.
// (The /research routes still resolve by direct URL — this only removes the
// nav entry points.) Flip to true to bring Research back into the navbar.
export const SHOW_RESEARCH = false;

// The AI-HireVue video is being replaced. Hidden until a new video is ready.
// VideoStory.tsx stays on disk, ready to re-mount. Flip to true to restore.
export const SHOW_VIDEO_STORY = false;

// The deal-engine toolkit lives at /deal-engine. Phase F2 (2026-07-24): surfaced in the
// navbar — engine2 is the default engine and the toolkit is presentable.
export const SHOW_DEAL_ENGINE_NAV = true;

// ── Phase F2 cutover flag (PHASE_F_CUTOVER.md §F2) ──
// 2 ⇒ engine2 (SPEC v1.0.4, golden-gated) is the DEFAULT at /deal-engine: import screens →
//     v2 workbench; the old flow remains ONLY for previous-engine saves (OWNER #2 banner).
// 1 ⇒ ROLLBACK: the old flow is the default again; the v2 workbench stays reachable at
//     ?v2=1 behind SHOW_ENGINE2_WORKBENCH (the dual-engine window).
// Old `lib/engine` is deleted only after one clean production week (§F2), never by this flag.
export const ENGINE: 1 | 2 = 2;

// Phase E (engine2) v2 workbench at /deal-engine?v2=1 — the dual-engine testing window.
// Redundant while ENGINE=2 (v2 is the default); keep TRUE so a rollback to ENGINE=1
// retains the side-by-side surface.
export const SHOW_ENGINE2_WORKBENCH = true;
