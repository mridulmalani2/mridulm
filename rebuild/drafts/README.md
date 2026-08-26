# Preserved drafts — un-merged work rescued during the 2026-08-26 branch consolidation

These files are **not** governing documents. They are the only unique work that existed on any
branch other than `main` at the time the repository was consolidated down to `main` + the active
working branch. They are kept here so nothing was lost when the stale branches were deleted.

## Provenance

Source branch: `claude/partial-exits-spec` (tip `efe0a0e`, 2026-08-14), deleted in the
consolidation. It was **never merged** and had **no open pull request**. Its own STATE commit
described it as *"#7 SS23 drafted, round 1 in flight"* — i.e. a spec draft that had **not** passed
hostile sign-off.

## Why it was not merged into main

`lib/engine2/SPEC.md` is the governing document: code may never deviate from it, and an amendment
becomes normative only after an independent hostile sign-off GRANTS it (see
`rebuild/PHASE_G_EXTENSIONS.md`, template step 1). The §23 partial-exits amendment on that branch
was a **DRAFT in round 1**, so merging it into `main` would have put un-adjudicated normative prose
into the spec that governs every calculation — exactly the failure mode the spec-first process
exists to prevent. It is therefore preserved as a patch, not applied.

## Contents

| File | What it is |
|---|---|
| `G11_PARTIAL_EXITS_BRIEF.md` | The design brief for backlog #7 (partial exits / IPO selldown) — the questions pinned before prose was written. |
| `partial-exits-SPEC-s23-DRAFT.patch` | The DRAFT §23 SPEC amendment as a diff against the merge-base. **Un-signed-off.** |
| `partial-exits-OWNER_QUESTIONS.md` | Ten design calls recorded, including two escalations filed for the owner. |

## How to resume backlog #7

Do **not** apply the patch blindly — `main` has advanced (SPEC is at v1.7.0, §22 sweet equity
landed since this draft was written), so the draft's section numbering and its assumptions about
neighbouring sections need re-checking. Use it as **input** to a fresh Tier-A template pass:
re-derive the amendment against the current spec, then run the independent hostile sign-off to
GRANTED before any golden/engine/UI code.
