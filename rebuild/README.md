# Deal Engine v2 — Rebuild Program — ✅ COMPLETE (2026-07-24)

**All phases 0/A/B/C/D/E/F are DONE.** engine2 is the only engine (cutover PR #98;
deletion tail owner-accelerated the same day — the one-clean-week soak was waived by
owner decision, with tag `pre-deletion-lib-engine` + PR-revert as the rollback).
`rebuild/DIFF_LEDGER.md` and `rebuild/F1_DIFFERENTIAL.md` are FROZEN historical records.
Phase G (staged extensions) is the live program: G-1 (interim distributions + RP cash
trap) SPEC v1.1.0 amendment is merged (PR #101); next is its golden extension.

This directory is the complete, self-contained plan for the ground-up overhaul of the LBO
toolkit (mridulmalani.com/research/toolkit). It was produced by reverse-engineering the live
site (full walkthrough of all 9 tabs with a real EDGAR import), mapping the existing engine and
data layer, mining the bug/audit history (18-bug report, 88KB institutional audit, 60+ commits),
and then adversarially reviewing the draft plan itself with four independent hostile reviewers
(finance, architecture, product, SEC-data). 44 findings from that review are already
incorporated into these files.

**Nothing in this directory is code. Every file is either a decision record or a builder spec
that a future agent session executes.**

## Files and execution order

| File | What it is | When |
|---|---|---|
| [00_MASTER_PLAN.md](00_MASTER_PLAN.md) | The whole plan: diagnosis, target outputs, input model, architecture, verification strategy, phase map, open owner decisions | Read first |
| [01_DEEP_RESEARCH_PROMPTS.md](01_DEEP_RESEARCH_PROMPTS.md) | Five paste-ready prompts for Claude deep research; results feed SPEC citations and the convention-based suggestions | Run during Phase A |
| [02_SPEC_SKELETON.md](02_SPEC_SKELETON.md) | The financial specification skeleton — every calculation convention already decided (with rejected alternatives), plus markers for what research must confirm | Completed → becomes `engine2/SPEC.md` in Phase A |
| [PHASE_0_HOTFIX.md](PHASE_0_HOTFIX.md) | Stop-the-bleed fixes on the LIVE site (formatting, broken tabs, incoherent default) | **Ship first, within days** |
| [PHASE_A_SPEC.md](PHASE_A_SPEC.md) | Freeze SPEC v1.0 (timeboxed), enact the dual-engine regime, seed the divergence ledger | After Phase 0 |
| [PHASE_B_GOLDENS_KERNEL.md](PHASE_B_GOLDENS_KERNEL.md) | Golden deal workbooks + extraction + adjudication; pure finance kernel | After A |
| [PHASE_C_ENGINE.md](PHASE_C_ENGINE.md) | Core engine build, module by module, with per-module fixture gates + one end-to-end golden gate | After B |
| [PHASE_D_DATA.md](PHASE_D_DATA.md) | Data-layer extension: multi-year history, operating NWC/days, IFRS-in-companyfacts, currency, staleness | **Parallel with B–C** (only needs Phase A types) |
| [PHASE_E_UI.md](PHASE_E_UI.md) | UI rebuild in four sub-phases (store/inputs, tabs, Excel export, AI modules) | After C + D |
| [PHASE_F_CUTOVER.md](PHASE_F_CUTOVER.md) | Flag-based cutover, categorized differential vs the ledger, old-engine deletion | After E |
| [PHASE_G_EXTENSIONS.md](PHASE_G_EXTENSIONS.md) | Staged re-entry of deferred features, one at a time, spec-first | After F |
| [DIFF_LEDGER.md](DIFF_LEDGER.md) | The divergence ledger — every known old-engine bug and every intentional convention change; Phase F's differential report is generated against it | Seeded now; appended throughout |

## Non-negotiables (carried over from the current repo's governance, plus new ones)

1. **One engine.** During the rebuild window a temporary two-engine regime applies with hard
   guardrails (freeze + lint + ledger — see PHASE_A_SPEC.md §2). It sunsets at Phase F. Never
   again two live calculation paths for the same number.
2. **Spec before code.** No engine2 arithmetic is written before SPEC v1.0 is approved. The
   spec is *versioned*, not frozen — amendments go through a changelog + golden update, never
   through silent code divergence.
3. **Facts / assumptions / derived are structurally separate types.** A fact the filing lacks
   is MISSING (empty + badge), never defaulted. An assumption always displays its basis
   (history / cited convention / template / AI / you). A derived value is never editable.
4. **Ground truth is outside the engine.** The golden workbooks (Phase B) adjudicate every
   dispute. Reviews check code-vs-spec, not code-vs-opinion.
5. **No silent caps, sentinels, or fallbacks.** Anything the model can't compute renders as
   N/A with a reason, and anything approximate says so on screen.
