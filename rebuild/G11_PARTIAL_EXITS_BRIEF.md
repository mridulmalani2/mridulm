# #7 Partial exits / IPO selldown — step-1 design brief (claimed 2026-08-14)

The Tier-A cycle for backlog #7, SPEC §23, under the bounded sign-off rule. This brief
pins the DESIGN QUESTIONS before prose is written, so the spec draft starts from decisions
rather than discovering them mid-review (the #8 lesson: rounds 1–4 found real defects
because the draft decided too little up front).

## The v1 scope worth defending (draft position — to be confirmed against §9/§10/§13)

A partial exit is a SECONDARY selldown: the sponsor sells a FRACTION of its stake at
year t < N at a stated valuation, with the remainder riding to the final exit.
SECONDARY-only keeps the company untouched — no primary raise, no de-leveraging event, so
§2–§8 and the debt path are BYTE-IDENTICAL (the §22 compatibility discipline). The sale is
a sponsor-side flow, structurally like a §3-step-7 distribution but NOT one (it is not
company cash; it must not enter the waterfall, the RP trap, DPI's basis question must be
DECIDED, and the §10 hurdle already counts "total value returned" — the forward-compat
note on the backlog row).

## Questions the spec must DECIDE (each needs a defensible default or an owner escalation)

1. **Valuation basis at year t** — an explicit `event_multiple × year-t EBITDA_adj` minus
   net debt at t (the §9 form at an interim year)? Or a user-stated equity value? The §13
   entry-frozen discipline and §5's no-solver rule constrain this.
2. **What the fraction applies to** — the sponsor's stake only (rollover/management ride)?
   Pro-rata across all §9 claimants? v1 default and its rejection rationale.
3. **§10 MIP interaction** — proceeds count toward the hurdle via the v1.1.0
   distribution-inclusive base; but does the SOLD fraction still bear the promote at final
   exit (it left the cap table)? The cap base question is the named interaction.
4. **§22 strip interaction** — reject strip ∧ partial-exit in v1 (negotiated allocation,
   the §22.3(ii) precedent) or define through §22.7's interim machinery?
5. **Returns membership (§9 table)** — the selldown proceeds are IN sponsor_net at year t;
   IN pre_promote?; NEVER in unlevered. DPI: distributions-only or +selldown? Payback?
6. **§19 fund overlay** — selldown proceeds are LP-distributable; which leg?
7. **§12 bridge** — a new walk-down term or a re-derivation of the sponsor delta?
8. **§13 scenarios** — the event is STRUCTURE (frozen) like the refi precedent.
9. **Coherence** — a selldown at a valuation below cost? Warn or silent?
10. **Golden plan** — which committed golden extends (G2-DIST has distributions + the
    v1.1.0 DPI machinery — the natural host), what closed forms pin it, and what the
    directed-fixture set must cover (the year-N boundary, fraction 0/1 domains, the
    MIP-hurdle interaction, †the §14.16 mirror at the partial year).

## Process guards carried forward from #8

- Spec section ≤ ~250 lines; no round history in normative text.
- ONE normative home per rule (§14.24 invariants; §23.x carries domains/rationale).
- Schema REQUIRED-with-null; every new output unconditional-or-null per the §22.10 pattern.
- The golden's EXACT inputs + ≥1 worked closed form pinned IN the spec.
- ≤2 hostile rounds; ledger everything non-blocking; the budget belongs to steps 2–3.
