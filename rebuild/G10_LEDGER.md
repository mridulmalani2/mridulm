# G10 LEDGER — backlog #8 (sweet equity / ratchets / warrants), SPEC §22

Ledger under PHASE_G's bounded sign-off rule. Every round-10 open minor
(`rebuild/G10_ROUND10_OPEN_MINORS.md`) triaged against (a)–(e) and dispositioned.
**Zero of the 15 was BLOCKING against the post-6b51bfb text**: six were already fixed
by 6b51bfb (verified BY DIFF against live text, not by the commit message), and the
nine open ones were wording/citation/scope items — fixed in ONE pass (this commit).

## Verified already fixed by 6b51bfb (by reading live text)

| Item | Site | Evidence |
|---|---|---|
| M1/M6 | §22.6 EXERCISED branch `warrant_strike_paid` | `warrant_strike_paid = K` stated on the exercised arm (SPEC ~2847) |
| M3/M14 core | §22.5 `P ≤ 0` opener | opener assigns `management_ordinary_share` / `institution_ordinary_share` / `V_final` directly (SPEC ~2697) |
| M8 | §14.23(d) DEFINITIONS domain lift | lift narrowed to conditions two and three; `sweet_equity` non-null still gates, warrant-only NULL pin cited (SPEC ~1122) |
| M13 | §22.5 MIRROR domain count | says "THREE domain conditions … the second is belt-and-braces under §22.3(vi)" (SPEC ~2816) |
| M15 core | §22.13(v) tolerance-band cite | re-anchored to §14.23(g); preserved through the stash-conflict resolution |

Round 10's two blocking fixes (§14.23(d) over-shoot; §22.9(d) one-home landing) also
verified closed IN BOTH HOMES without relocation: §14.23(d) ~1122–1123 and §22.9(d)'s
SPLIT domain ~3083–3090 agree.

## Fixed in this pass (all ledger-grade; none moved a number)

| Item | Class | Fix applied |
|---|---|---|
| M2 | wording self-contradiction | §22.6 ATM: "identical money" → "identical ALLOCATIONS (`ordinary_pot`, `warrant_payout_net`)" |
| M4 | stale cites (4 sites) | §22.9(f)→§14.23(f) ×2, §22.9(g)→§14.23(g) (domain-carrier noted), §22.9(a)→§14.23(a); the §14.23→§22.9 clause citations are guard-mandated and untouched |
| M5 | prose mis-summary | §14.23(d) COMPARISON RULE: "on VALUE, under the absolute tolerance floor"; "TWO value asserts and ONE count assert" |
| M7 | over-broad verification claim | §22.5 nine-config sentence: `M/P ∈ [s₀, s_n]` scoped to the eight with `P > 0` (0/0 at `P = 0`) |
| M9 | hand-kept list | §22.8: `lib/engine2/bridge.ts` added, list restated as the PROPERTY + re-grep obligation |
| M10 | missing step-4 obligation | §22.10: Excel S&U `Management subscription` row + fold into Equity/Total capitalization (`excelExport.ts:49/83`) |
| M11 | undisplayable pinned figure | §22.10: `sponsor_equity − loan_notes_subscribed` sanctioned as a presentational derivation (option B — no schema change) |
| M12 | unscoped field semantics | §22.10: `ratchet_tiers_reached` counts §22.5 tiers ONLY; basis labelling on `warrant`+`mip.ratchet` deals |
| M15 sweep | same cite pattern ×2 | §22.7 / §22.12: "§14.23(b)'s five-term mirror" → "§14.16's five-term mirror (§14.23(b))" — §14.16 states it, §14.23(b) points |

## Dispositioned WITHOUT change

- **M14 (gloss rewording)** — the prescribed fix ("the two assignment lines are simply
  redundant here") is STALE against the current layout: the walk's init line
  (`V ← V₀ ; rem ← P ; M ← 0 ; s ← s₀`) sits BELOW the opener, so on the `P ≤ 0` branch
  `M`, `s` and `rem` are ALL uninitialised and the current gloss ("none of which this
  branch initialises") is verified accurate. Applying the prescribed text would have
  introduced a false claim.

## Open ledger items (fix in ONE pass at step 6, before conformance — never blocking)

From the round-11 GRANTING review (closure/composition/coherence all GRANTED, 0 blocking;
workflow wf_6aac0d6d-5ef, 2026-08-14). Verification records from that review are not
repeated here — only the actionable items:

- **L1 [§16, SPEC ~1274]** Two stale §22.9(x)-as-home cites survive M4's sweep:
  "(§22.9(f) states the precise form)" and "`CoherenceFlag.code` gains
  `loan_notes_unredeemed` (§22.9(g), WARN)". Re-point to §14.23(f)/(g), same as the four
  M4 sites.
- **L2 [§22.10 M10 edit]** "which today compute `sponsor_equity + rollover_equity`" is
  exact for the line-83 Equity row; the line-49 capTotal row's FULL formula also includes
  debt (the equity subterm is as stated). Tighten the wording; both cites verified correct.
- **L3 [G10_ROUND10_OPEN_MINORS.md]** "15 spec-minors, none fixed" was stale at its own
  commit time (b042c1b postdates 6b51bfb). Superseded-by pointer added in the grant commit.
- **L4 [§12, SPEC ~897]** §12's own walk-down enumeration is not widened with
  `sweet_equity_delta` / `warrant_payout_net` (which §14.9, §16 and §22.8 all carry).
  Widen with a [v1.7.0] marker — the hand-sync class §22 itself documents.
- **L5 [§22.5 opener]** "RETURN HERE" semantics live entirely in the bracket, and the
  bracket says "the two ASSIGNMENT lines" where three assignment lines follow the loop.
  NAME the skipped lines (the accumulate line and the share-assignment line) instead of
  counting them. (Raised independently by composition AND coherence.)
- **L6 [§22.9(a)/§14.23(a)]** "guaranteed by §22.3(vi)'s Build rejection" is compressed:
  §22.3(vi) guarantees LN[0] ≥ 0; LN[t] ≥ 0 for t ≥ 1 comes from §22.7's
  min(grown, paid[t]) redemption rule. State both.
- **L7 [§16, SPEC ~1274]** The equity_strip null-semantics sentence asserts a cause and
  its retraction in one breath ("a zero invested equity" then "UNREACHABLE"). Delete the
  stale half.
- **L8 [§14.23(d) worked bracket]** The count-disagreement example under-specifies its
  inputs (s₀ unstated; rate 0.08 only implied via LN[N] = 132.2395). Pin the full inputs.
- **L9 [§22.5 vs §22.11/§15]** "§3 sweep-step-down convention" vs "§3 sweep-grid
  convention" — same committed rule, two names. Unify (NB: the §15/§22.11 instance must be
  edited in BOTH marker-delimited homes identically or the guard reddens).
- **L10 [§16 rejection list]** share_pct = 1 rejection carries only the §22.5 arithmetic
  reason; §22.3(iv) gives the per-ratchet pair. Cite §22.3(iv) or add the economic half.
- **L11 [§22.11/§15 governed block]** 15 opening vs 16 closing parens — the trailing ")"
  after "actually sweet" is unmatched. Fix in BOTH homes identically (guard).
- **L12 [M7 disposition note]** The "eight with P > 0" premise is about an uncommitted
  sign-off exercise; plausible, nothing committed contradicts it. No action unless step 2's
  derivation re-runs the nine configs — if it does, record the actual split.
