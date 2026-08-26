# Stale branches to delete — prepared 2026-08-26

The cloud sandbox cannot delete remote refs: `git push --delete` returns **HTTP 403** at the
agent proxy (ref-deletes blocked; branch creation works), and the GitHub MCP server exposes no
delete-branch tool. Run this from the laptop, or use the GitHub UI (Branches → delete).

**Every branch below was verified safe to delete**: each is either already merged into `main`
(41 of them, per `git branch -r --merged origin/main`) or has an EMPTY merge-base diff against
`main` (6 squash-merged ones). The single branch that held unique work —
`claude/partial-exits-spec` (#7 draft) — is preserved in `rebuild/drafts/` AND resumed on the
working branch, so deleting it loses nothing.

Keeping: `main` + `claude/fund-lp-overlay-feature-go3xav` (the working branch).

```bash
git fetch --all --prune
git push origin --delete archive/partial-exits-spec-draft
git push origin --delete claude/archive-research-section
git push origin --delete claude/c5-c9-fixes
git push origin --delete claude/click-tracking-ai-avatar-eff8d6
git push origin --delete claude/deal-engine-exits-mip-5ee40a
git push origin --delete claude/engine-v2-cutover-6ae5fd
git push origin --delete claude/entry-leverage-naming
git push origin --delete claude/f-tail-deletion
git push origin --delete claude/fund-lp-overlay
git push origin --delete claude/g1-audit-fixes
git push origin --delete claude/g1-engine
git push origin --delete claude/g2-implementation
git push origin --delete claude/g2-quarter-ltm
git push origin --delete claude/negative-goodwill-warn
git push origin --delete claude/partial-exits-spec
git push origin --delete claude/phase-c-drafts
git push origin --delete claude/phase-c1-operating
git push origin --delete claude/phase-c2-sources-opening
git push origin --delete claude/phase-c3-tax
git push origin --delete claude/phase-c4-debt
git push origin --delete claude/phase-c5-sequence
git push origin --delete claude/phase-c6-exit-returns
git push origin --delete claude/phase-c7-credit
git push origin --delete claude/phase-c8-bridge
git push origin --delete claude/phase-c9-facade
git push origin --delete claude/phase-d-data
git push origin --delete claude/phase-d2-nwc
git push origin --delete claude/phase-d5-anchor
git push origin --delete claude/phase-d6-ifrs
git push origin --delete claude/phase-d7-suggest
git push origin --delete claude/phase-e-verify
git push origin --delete claude/phase-e1-store
git push origin --delete claude/phase-e1c-screens
git push origin --delete claude/phase-e2b
git push origin --delete claude/phase-g1-goldens
git push origin --delete claude/pik-toggle
git push origin --delete claude/reality-check-comps
git push origin --delete claude/refi-noop-warning
git push origin --delete claude/refinancing-events-feature-f7m72u
git push origin --delete claude/s15-distributions-disclosure
git push origin --delete claude/sourcing-manual-entry
git push origin --delete claude/spec-g1-distributions
git push origin --delete claude/spec-negative-goodwill
git push origin --delete claude/total-leverage-panel
git push origin --delete claude/upload-parser
git push origin --delete claude/v104-wording
git push origin --delete docs/bounded-signoff-and-runbook
git push origin --delete docs/state-8-merged
```

Then locally: `git fetch --all --prune` to drop the stale remote-tracking refs.
