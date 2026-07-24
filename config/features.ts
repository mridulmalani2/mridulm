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

// The dual-engine flags (ENGINE, SHOW_ENGINE2_WORKBENCH) are GONE with the F-tail
// deletion (2026-07-24): engine2 is the only engine, so an in-app rollback flag would be
// a lie. Rollback = revert the deletion PR (the last pre-deletion tree is preserved at
// git tag `pre-deletion-lib-engine`) and redeploy.
