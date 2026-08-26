/**
 * UI feature flags.
 *
 * These hide sections from the interface WITHOUT deleting any code — every
 * gated route, component, and data file stays on disk and keeps compiling.
 * Flip a flag back to `true` to restore the section instantly.
 */

// The research section is the OLD dark-theme site. ARCHIVED (2026-08-23): it is
// gated off the public build entirely, not merely unlinked. This flag now gates
// the /research routes in App.tsx as well as the navbar entry, so with it false
// /research/* falls through to NotFound instead of resolving by direct URL; the
// edge redirects in vercel.json turn those URLs away before the SPA even loads.
// Nothing is deleted — every page, component, and article stays on disk and keeps
// compiling. Flip to true (and drop the /research redirects from vercel.json) to
// restore the whole section.
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
