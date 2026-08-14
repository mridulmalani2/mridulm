# Round-10 OPEN MINORS — SPEC §22 (backlog #8, Tier A, step 1)

Persisted from the round-10 workflow so they survive the session. **15 spec-minors, none fixed.**
Round 11 must work these plus confirm the two round-10 blocking fixes closed without relocating.

Round-10 fresh-lens verdicts: **arithmetic GRANTED (0 blocking)**, **contracts GRANTED (0 blocking)**,
composition REFUSED (1), coherence REFUSED (2). Both blockers are fixed in 6b51bfb but UNREVIEWED.

## M1 — [arith] §22.6's EXERCISED branch never assigns `warrant_strike_paid` — the mirror image of the round-8 fix, which reached only the ELSE branch

**Fix.** Add `warrant_strike_paid = K` to the `if exercised:` arm of §22.6's block, alongside gross/net/P.

## M2 — [arith] §22.6's at-the-money boundary still says "identical money" and then contradicts itself in the same sentence; the round-10 correction landed only in §22.13(vi)

**Fix.** Replace "identical money" in §22.6 with §22.13(vi)'s wording: identical ALLOCATIONS (`ordinary_pot`, `warrant_payout_net`), three differing displayed fields of which two are money.

## M3 — [arith] §22.5's `P ≤ 0` opener sets the walk local `M`, not the REQUIRED output `management_ordinary_share`, and RETURNs before the line that maps one to the other

**Fix.** Write the opener as `management_ordinary_share ← 0 ; institution_ordinary_share ← P ; V_final ← V₀ + P` (dropping the local-vs-output asymmetry), and correct the gloss's "from `M`, `s` and `rem`" to "from `M` and `P`".

## M4 — [arith] Live text still cites §22.9(x) as the home of rules §22.9 declares it does not state — the residue of the round-4 single-home conversion

**Fix.** Re-point these to §14.23(g)/(a)/(f), or reword as "the §14.23(g) tolerance band, whose domain §22.9(g) carries".

## M5 — [arith] §14.23(d)'s COMPARISON RULE mis-describes its own asserts: the MOIC check is on RATIOS with a ratio tolerance, and the clause carries three asserts, not two

**Fix.** Reword to "the tier COUNT is taken on `institution_moic_at_ratchet`; `returns.sponsor_net.moic` is checked against it on VALUE, with an absolute tolerance floor. Two value asserts and one count assert; never a count-vs-count race."

## M6 — [composition] §22.6's warrant block states `warrant_strike_paid` only on the NON-exercise branch; the EXERCISED branch — the one G9-SWEET runs — never assigns it

**Fix.** Add `warrant_strike_paid = K` to the `if exercised:` branch of §22.6's block, symmetric with the round-8 addition on the else branch.

## M7 — [composition] §22.5's round-1 verification sentence claims `M/P ∈ [s₀, s_n]` held at `P = 0`, the 0/0 case §14.23(e) and §14.23(d) exist to exclude

**Fix.** Scope the claim: '… with `M + institution ≡ P` and the tier count agreeing in every one, and `M/P ∈ [s₀, s_n]` in the eight with `P > 0` (at `P = 0` the ratio is 0/0 — §14.23(e))'.

## M8 — [contracts] §14.23(d)'s DEFINITIONS lift the WHOLE domain, which collides with §22.10/§16's warrant-only `null` pin for `management_effective_ordinary_pct`

**Fix.** Scope the lift to the conditions actually being lifted: "...they hold at EVERY sign of the pot and of the period-N flow — i.e. independently of the SECOND and THIRD conditions of (d)'s domain. The FIRST (`sweet_equity` non-null) still gates them: with no strip there is no walk, and §22.10's WARRANT-ONLY pin (both fields `null`) governs that arm."

## M9 — [contracts] §22.8's hand-kept list of committed three-term-mirror sites omits `lib/engine2/bridge.ts:94`, the comment that justifies the very identity (§14.9(b)) §22 amends

**Fix.** Add `lib/engine2/bridge.ts` to the list, or replace the enumeration with the property: "every committed statement of the three-term exit mirror — asserts and doc comments alike — must be widened; at v1.7.0 these are exit.ts, types.ts, bridge.ts and the two test files, and the engine PR must re-grep rather than trust this list."

## M10 — [contracts] The new §2 SOURCE line enters `total_sources` but §22 places no obligation on the committed Excel export, whose Sources and Capitalization blocks are hand-enumerated and would stop footing by exactly the subscription

**Fix.** Add one sentence to §22.10: "§2's new source line is a DISPLAYED source: the step-4 UI PR must add a `Management subscription (sweet equity)` row to the Excel S&U SOURCES block and fold it into the `Equity` / `Total capitalization` rows, which today compute `sponsor_equity + rollover_equity` (`excelExport.ts:49/83`) and would otherwise disagree with the amended §8 equity line by exactly the subscription."

## M11 — [contracts] The institutional ORDINARY subscription — a cap-table figure §22.12 pins — has no `EquityStripBlock` field, so the only way to display it is the recomputation §22.10 forbids

**Fix.** Add `institutional_ordinaries_subscribed` to the `EquityStripBlock` list in BOTH §22.10 and §16 (0 on the warrant-only arm, alongside `loan_notes_*`), or state explicitly in §22.10 that the entry split is displayed as `sponsor_equity − loan_notes_subscribed` and that this subtraction is a sanctioned presentational derivation.

## M12 — [contracts] `equity_strip.ratchet_tiers_reached` is the only tier-count output §22 emits, and §22.10 pins it to `0` on a legal `warrant` + `mip.ratchet` deal whose §22.4 promote ratchet did tier

**Fix.** State the scope on the field in §22.10: "`ratchet_tiers_reached` counts §22.5 SWEET-EQUITY tiers only; the §22.4 promote ratchet emits no tier count (its effect is fully carried by `mip_payout`), and any surface showing this field alongside a `mip.ratchet` deal must label the basis — the §9 naming rule applied to the second ratchet."

## M13 — [coherence] §22.5's MIRROR paragraph calls §14.23(d)'s domain "its two load-bearing domain qualifiers" — stale against §14.23(d)'s own round-7 correction, which declares the second REDUNDANT

**Fix.** Change to "…WITH its domain — of whose two added qualifiers only the period-N-flow condition is load-bearing, the plug condition being redundant under §22.3(vi)'s Build rejection — and its absolute tolerance floor; none of it is repeated here, on purpose." Or drop the count entirely and write "WITH its stated domain and its absolute tolerance floor", which cannot go stale.

## M14 — [coherence] §22.5's `P ≤ 0` opener leaves the REQUIRED output `management_ordinary_share` unassigned, and its round-10 gloss misstates its own adjacent line

**Fix.** In the opener, write the OUTPUT name: `management_ordinary_share ← 0 ; institution_ordinary_share ← P ; V_final ← V₀ + P ; RETURN HERE`. Then correct the gloss to name the real hazard — "the two ACCUMULATE lines below the loop read `s` and `rem`, which this branch never initialises; the two assignment lines are simply redundant here because the branch sets both outputs directly" — and drop "none of which this branch initialises".

## M15 — [coherence] §22.13(v) cites "the §22.9(g) tolerance band", but §22.9(g) states no tolerance and by its own charter cannot

**Fix.** Change "(the §22.9(g) tolerance band — §22.13(v) and §22.9(g) now agree…)" to "(the §14.23(g) tolerance band — §22.13(v) and §14.23(g) now agree…)". While there, sweep §22.7 ("the §14.23(b) five-term mirror closes", SPEC.md:2937) and §22.12 (SPEC.md:3226) for the same pattern: §14.23(b) POINTS at §14.16, which is where the five-term identity is actually stated.
