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

## DECIDED 2026-08-14 (constraints dossier in the step-1 record; citations therein)

1. Valuation: user-stated `event_multiple` × EBITDA_adj[t] − net debt at t (§9's form at
   year t, §11's debt/cash definitions), × fraction = proceeds. A stated equity VALUE is
   REJECTED (scenario-invariant in a downside — the §13 trap precedent decides the form).
   The RVPI no-interim-marks rejection forbids any engine-invented mark.
2. Fraction applies to the SPONSOR's position only. `selldown ∧ rollover > 0` REJECTED in
   v1 (owner question Q-B records why). Domain: fraction ∈ (0,1) OPEN; year ∈ {1..N−1}.
3. §10 MIP: proceeds EXCLUDED from the hurdle base X (a sponsor-only flow may not enter a
   TOTAL-company base — §10's own mixing prohibition, inverted); the promote at N is
   computed on total exit proceeds exactly as today (the buyer bears it pro-rata, the
   rollover precedent). The named interaction, decided with a worked example.
4. `selldown ∧ sweet_equity` REJECTED in v1 — §22.3(ii)'s exact style (ownership allocation
   is negotiated; §22.7's machinery allocates company cash by priority, a different object).
5. Membership: IN sponsor_net at year t (one flow per period); EXCLUDED from pre_promote
   (the buyer's exit share is already inside the total stream — adding proceeds at t would
   double-count); NEVER in unlevered. DPI/payback: distributions-only (owner question Q-A;
   conservative default + a basis-labelled memo line).
6. §19 fund: the year-t interim LP leg (conservation forces it); the deal-vs-fund DPI
   asymmetry stated as a layer note.
7. §12 bridge: the four bars are UNTOUCHED (the money never transits the company — the
   FIRST sponsor inflow that must NOT shrink the paydown bar; stated); the walk-down gains
   `selldown_proceeds_sponsor` and a `buyer_delta` term (the rollover-Δ template); §14.16
   widens to SIX claimant terms (buyer exit share, 0 when no event); the new terms
   self-cancel in residual (b) and need direct asserts.
8. §13: the event is STRUCTURE — terms frozen across scenarios; PROCEEDS recompute from
   each scenario's EBITDA_adj[t] (the trap's policy-frozen/binding-varies split).
9. Coherence: `selldown_below_cost` WARN (never silent, never a rejection): fires when the
   implied event equity value of the SOLD fraction < fraction × sponsor_equity − $0.005m,
   condition-named, measurement pair pinned.
10. Golden: **G11-SELL = G2-DIST + exactly one event** (terms pinned at draft time with
    closed forms for proceeds AND the year-N shrink on the same fixture); `selldown: null`
    byte-identity gate; §22.13-style directed fixtures per the dossier list.

Spec-hygiene item (found by the dossier): §1's "Interim sponsor flows exist exactly when
interim distributions are on" becomes FALSE under a selldown — the draft amends it.
