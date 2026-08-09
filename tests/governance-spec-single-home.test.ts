/**
 * GOVERNANCE gate — SPEC single-home enforcement for §22 [v1.7.0, sign-off round 5].
 *
 * WHY THIS EXISTS. §22 shipped the SAME defect five times across four hostile rounds: a rule
 * stated in more than one place, corrected in one place, and left byte-identical to REFUSED
 * text in the others. The instances (all caught by independent reviewers, none by a test):
 *   r2 — §16's schema paragraph stale against the refuted draft (inherited pattern from v1.6.0)
 *   r3 — §15's disclosure row byte-identical to the refuted draft, while the changelog
 *        recorded it as amended (the project's named "changelog claims a correction that was
 *        not applied" failure)
 *   r3 — §22.9(d)/(h) byte-identical to the refused text while §14.23 carried the corrections
 *   r4 — §22.5's annotation stating the REFUSED count formula six lines above its own correction
 *   r4 — the round-3 monotonicity correction filed in §22.9(h) (SUBORDINATE) and NOT in
 *        §14.23(h) (NORMATIVE), so the new precedence rule PROMOTED the false claim
 *
 * The response to the first four was "re-sync and promise to be careful". That is precisely the
 * shape PHASE_G_EXTENSIONS.md names as the recurring enforcement failure — "If a future gate is
 * a hand-kept list of what to check, assume it already has a hole." So the fifth response is a
 * CHECKABLE PROPERTY instead:
 *
 *   1. §22.9 carries NO formula. It is a domains-and-rationale companion; every clause CITES
 *      §14.23. A formula reappearing there is a red test, not a reviewer's catch.
 *   2. Every §14.23(23) clause letter has a citation in §22.9 — so a new invariant cannot be
 *      added to the normative home and silently go undocumented, and a §22.9 clause cannot
 *      outlive its normative counterpart.
 *   3. §15's §22 disclosure clause CONTAINS, verbatim, the sentences §22.11 marks as
 *      §15-bound. §22.11's heading commissions §15 ("§15 IS GENERATED FROM THIS PARAGRAPH");
 *      round 3 found §15 stale against §22.11, round 4 found §22.11 stale against §15 — the
 *      staleness merely inverted. A marker-delimited verbatim check makes the generation
 *      mechanical in the one direction that matters.
 *
 * This guard governs PROSE, which is unusual — but §22's arithmetic was reproduced correctly by
 * two independent reviewers in every round, and every one of the five defects above was a
 * DOCUMENT-SYNCHRONIZATION failure. The guard is aimed at where the defects actually are.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SPEC = readFileSync(join(__dirname, '..', 'lib/engine2/SPEC.md'), 'utf8');

/** Slice a section by its heading marker up to the next one. */
function section(startMarker: string, endMarker: string): string {
  const i = SPEC.indexOf(startMarker);
  expect(i, `SPEC.md must contain "${startMarker}"`).toBeGreaterThan(-1);
  const j = SPEC.indexOf(endMarker, i);
  expect(j, `SPEC.md must contain "${endMarker}" after "${startMarker}"`).toBeGreaterThan(i);
  return SPEC.slice(i, j);
}

describe('§22 single-home governance (SPEC prose)', () => {
  const s229 = section('**§22.9 Invariants', '**§22.10 Outputs');
  const inv23 = section('23. Sweet equity / ratchets / warrants [v1.7.0 — §22]', '## §15 Units, precision, display');

  it('§22.9 states NO formula — the normative home is §14.23 (five staleness defects, r2–r4)', () => {
    // `≡` is the spec's invariant-identity operator; its presence means a rule is being STATED
    // here rather than cited. The prose deliberately uses "the mirror"/"the walk" instead.
    // Scan the CLAUSE BODY only: the preamble legitimately mentions the operator when stating
    // the rule this guard enforces, and a guard that trips on its own charter is a bad guard.
    const bodyStart = s229.indexOf('(a) → ');
    expect(bodyStart, '§22.9 must open its clause list with "(a) → "').toBeGreaterThan(-1);
    const offenders = s229
      .slice(bodyStart)
      .split('\n')
      .map((l, n) => [n + 1, l] as const)
      .filter(([, l]) => l.includes('≡'));
    expect(
      offenders,
      `§22.9 must cite §14.23, never restate. Move the identity into §14.23(23) and leave a citation:\n${offenders
        .map(([n, l]) => `  line ${n}: ${l.trim()}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('every §14.23(23) clause letter is cited in §22.9 (neither home can outlive the other)', () => {
    // §14.23(23) enumerates inline (`…; (b) [domain] …`), not one clause per line, so match the
    // marker anywhere and take the SET of letters present.
    const normative = new Set([...inv23.matchAll(/\((?<c>[a-i])\)\s/g)].map((m) => m.groups!.c));
    for (const c of 'abcdefghi') {
      expect(normative, `§14.23(23) must enumerate clause (${c})`).toContain(c);
    }
    for (const c of normative) {
      expect(
        s229,
        `§22.9 must carry a citation for §14.23(23)(${c}) — a normative invariant with no companion clause is undocumented`,
      ).toContain(`§14.23(23)(${c})`);
    }
  });

  it('§15 contains, VERBATIM, the sentences §22.11 marks as §15-bound (r3/r4: staleness inverted)', () => {
    const bound = [...SPEC.matchAll(/<!--§15-BOUND-->(?<t>[\s\S]*?)<!--\/§15-BOUND-->/g)].map((m) =>
      m.groups!.t.replace(/\s+/g, ' ').trim(),
    );
    expect(bound.length, '§22.11 must delimit its §15-bound sentences with <!--§15-BOUND--> markers').toBeGreaterThan(0);
    const s15 = section('## §15 Units, precision, display', '## §16 Input schema').replace(/\s+/g, ' ');
    for (const b of bound) {
      expect(s15, `§15 has drifted from §22.11, which governs it. Missing verbatim:\n  "${b}"`).toContain(b);
    }
  });
});
