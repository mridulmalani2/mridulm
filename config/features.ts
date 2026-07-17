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

// The deal-engine toolkit lives at /deal-engine. While Research is hidden
// (it was the only in-UI link to the toolkit), this surfaces a direct nav
// entry so the toolkit stays reachable. Set false to make it URL-only.
export const SHOW_DEAL_ENGINE_NAV = true;
