# Owner questions — escalations under the runbook's §4 (do not guess)

## 2026-08-14 — #7 partial exits / IPO selldown (step 1)

**Q-A: the deal-level DPI / payback basis under a selldown.** The committed v1.1.0 rule is
distributions-only ("exit proceeds do NOT count toward payback — that is what made the old
headline degenerate, L-10"), and a secondary selldown is NOT a §3-step-7 distribution — so
the letter of the committed rule EXCLUDES selldown proceeds from DPI/payback. But the L-10
rationale (realized early cash vs unrealized-until-N exit) argues the other way: a year-t
secondary receipt is genuinely realized liquidity, and a "realized-liquidity" headline blind
to it understates real DPI-style performance. Neither reading is derivable without either
mislabeling "DPI" (the v1.1.2 mislabel class) or blinding the headline.
**Draft proceeds with the CONSERVATIVE letter-of-the-rule default:** DPI/payback stay
distributions-only, and the selldown proceeds get a SEPARATE basis-labelled memo line
("realized proceeds incl. selldown"), disclosed in §15. The fund-layer numbers (§19) include
the proceeds mechanically (LP cash is LP cash), with the layer asymmetry stated.
**Owner may flip this** to a combined realized-proceeds DPI (relabelled) — a one-line spec
change + fixture re-pin at step 2; flag it before step 2 signs if you want the flip.

### RESOLVED 2026-08-27 — FLIPPED to the REALIZED basis. Selldown proceeds COUNT.

Owner delegated the call with an instruction to research market practice and adopt it.
Practice is not split on this, so the escalation resolves on evidence rather than on taste:

- **Fund-layer DPI counts a secondary the quarter it closes.** ILPA-basis DPI is
  cumulative distributions ÷ paid-in, and proceeds from a partial secondary are distributed
  to LPs like any other realization. The standard worked case in the literature is exactly
  ours: a sponsor sells 30% of its stake in a secondary before an IPO, that 30% counts
  toward DPI immediately, and the retained 70% counts only when it is realized later.
- **Deal-layer modelling practice splits inflows into REALIZED and UNREALIZED**, which is
  the same rule stated on the deal side; an IPO exit is modelled as a first tranche at
  pricing plus a sell-down schedule over 2–4 years, all summed into one sponsor-proceeds
  line. Nothing in that practice treats a pre-exit realization as unrealized.

**Why the draft's letter-of-the-rule reading was wrong, precisely.** L-10's degeneracy has
one cause: a ratio that counts its OWN EXIT. At t = N that forces DPI ≡ MOIC and payback ≡ N
for every deal ever modelled, which is why the exclusion had to exist. An interim
realization at t < N causes no such collapse — it is the early liquidity the ratio exists to
measure. "Distributions-only" was L-10 over-applied: it is a strictly stronger rule than the
defect required, and the extra strength buys nothing while blinding the headline to real
cash. The v1.1.2 mislabel test also comes out the other way: on the realized basis the
number under the DPI label is what a reader already means by DPI, whereas the draft would
have shown a DPI that ignored the largest realization in the deal and put the true figure in
a memo. Q-A's own framing conceded the economics ("a year-t secondary receipt is genuinely
realized liquidity"); what it lacked was the observation that L-10 never spoke to that case.

**What changed in SPEC (v1.8.0 draft, all in one pass):** §9's DPI/payback definition and
membership table; §14.18 (DPI monotonicity gains ONE bounded carve-out — a NEGATIVE
`implied_event_equity` is legal under §23.2, so realized cash can genuinely FALL at `year`
and at no other year); §14.24 gains clause (h); §16 schema; §23.6, §23.7, §23.10, §23.12,
§23.13(v)/(xi); the governed §15-SELL block in both homes; the changelog row.

**Cost avoided:** the flip landed BEFORE the goldens were adjudicated, so there is no
fixture re-pin. G11-SELL's year-3 DPI leaf is 0.3841 on the realized basis against 0.0467
on the distributions-only basis — an 8.2× discriminator, so the basis is now pinned by the
golden itself and cannot drift silently.

**No memo field is emitted.** The distributions-only series stays derivable from
`interim_distributions_sponsor[]`, and a derivable number may not become a second
ModelOutput surface (§16's v1.1.1 fixture-only precedent). This makes the flip a net
SIMPLIFICATION: one fewer required output, one fewer fixture, and the deal-vs-fund layer
note becomes one of agreement instead of a stated asymmetry the reader had to reconcile.

Sources: [Carta — DPI](https://carta.com/learn/private-funds/management/fund-performance/dpi/) ·
[CFI — Distributed to Paid-In Capital](https://corporatefinanceinstitute.com/resources/financial-modeling/distributed-to-paid-in-capital/) ·
[Moonfare — DPI](https://www.moonfare.com/glossary/distributed-to-paid-in-capital-dpi) ·
[Mosaic.pe — Deal Models: IPO Exits](https://www.mosaic.pe/academy/ipo-exits)

**Q-B (pre-resolved by rejection, recorded for visibility): selldown ∧ rollover.** After a
sponsor-only sale a third-party buyer joins the cap table beside the rollover holder; how
they rank is negotiated with no defensible default. The draft REJECTS the combination in v1
(§22.3(ii)'s exact precedent). If you want it, it needs your allocation convention.
