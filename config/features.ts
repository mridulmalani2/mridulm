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

// The deal-engine toolkit lives at /deal-engine. Hidden from the navbar for
// now — the route still resolves by direct URL. Flip to true to surface it.
export const SHOW_DEAL_ENGINE_NAV = false;

// Phase E (engine2) v2 workbench — the new ModelOutput-driven screens, mounted at
// /deal-engine?v2=1 during the dual-engine window. ON so the Phase E gate walkthrough
// (3 real issuers on staging) can run; unreachable without the ?v2=1 param, and the
// old flow is untouched. Phase F makes it the only path.
export const SHOW_ENGINE2_WORKBENCH = true;
