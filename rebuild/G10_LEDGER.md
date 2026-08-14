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

## Open ledger items (fix before conformance, never blocking)

- (none)
