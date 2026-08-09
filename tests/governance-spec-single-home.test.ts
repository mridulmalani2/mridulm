/**
 * GOVERNANCE gate — SPEC single-home enforcement for §22 [v1.7.0; guard v2, sign-off round 6].
 *
 * WHY THIS EXISTS. §22 shipped the SAME defect five times across four hostile rounds: a rule
 * stated in more than one place, corrected in one place, and left byte-identical to REFUSED
 * text in the others (r2 §16; r3 §15, which the changelog recorded as amended; r3 §22.9(d)/(h);
 * r4 §22.5's annotation; r4 the correction filed in the SUBORDINATE copy while the normative
 * home kept the false claim). Re-syncing by hand is the construct PHASE_G_EXTENSIONS.md names
 * as the recurring enforcement failure, so the rule is enforced instead of promised.
 *
 * WHY THIS IS GUARD **v2**. Guard v1 (round 5) keyed on a single character, `≡`. Both hostile
 * reviewers independently proved it vacuous by executing it:
 *   - only 3 of §14.23(23)'s 9 clauses state their rule with `≡`; the other six use `=`, `≤`,
 *     `>`, `∈`. Mutants restating (a), (e), (g) and (h) back into §22.9 all passed GREEN —
 *     including one asserting the §22.4 envelope on `mip_payout` instead of `promote_uncapped`,
 *     which is FALSE and is the exact round-4 defect this guard was written to prevent.
 *   - a clause added to §14.23 needed no companion (`[a-i]` and the literal `'abcdefghi'` were
 *     a hand-kept list — the very construct the header invokes PHASE_G against).
 *   - §22.9 clause (f) could be DELETED and stay green, because the citation check was a
 *     substring test over the whole section and another clause's prose happened to contain the
 *     token `§14.23(f)`.
 *   - §15 could gain a sentence CONTRADICTING the governed text, or gain §22 disclosure absent
 *     from its source, and stay green: only 18% of §15's clause was pinned, in one direction.
 * The v1 mutants all landed inside the covered subset, so red-then-revert passed on every one
 * while the boundary went untested — the §21-round-1 defect ("the sample was blind to the
 * mutant it exists to exclude"). Guard v2's mutants are derived FROM the property: one per
 * clause, plus each structural hole above.
 *
 * WHAT IS ENFORCED — stated exactly, because a guard that overstates its scope is how v1 did
 * harm (a reviewer who reads "mechanically enforced" stops checking):
 *   1. §22.9 carries NO mathematical token inside any backticked span, anywhere in the section
 *      (preamble included; only the single charter sentence is exempt, by exact string). Domains
 *      are prose. This is stronger than "no formula" and needs no whitelist.
 *   2. Every §14.23 item-23 clause letter has a companion in §22.9, bound PER CLAUSE — the
 *      citation must appear inside that clause's own body, not anywhere in the section. The
 *      letter set is DERIVED from §14.23, with an open character class: a new clause (j) is
 *      required automatically.
 *   3. §15's §22 clause and the §22.11 block that governs it are EQUAL, both directions.
 *
 * WHAT IS **NOT** ENFORCED, named so nobody relies on it: §16's schema paragraph (no check);
 * §22.5's own annotations (no check — the r4-B1 defect lived there); that §14.23 actually
 * CARRIES a correction filed against it; and the DOMAINS duplicated between §22.9 and §14.23,
 * which are prose in one home and formal in the other and are compared by no test — domains
 * went stale twice (r1 gov-B6, r2 gov-B2), so this is the largest known residual and it rests
 * on the conformance review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SPEC = readFileSync(join(__dirname, '..', 'lib/engine2/SPEC.md'), 'utf8');

function section(startMarker: string, endMarker: string): string {
  const i = SPEC.indexOf(startMarker);
  expect(i, `SPEC.md must contain "${startMarker}"`).toBeGreaterThan(-1);
  const j = SPEC.indexOf(endMarker, i);
  expect(j, `SPEC.md must contain "${endMarker}" after "${startMarker}"`).toBeGreaterThan(i);
  return SPEC.slice(i, j);
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Any mathematical token. Deliberately broad: v1's single-character rule missed 6 of 9 clauses. */
const MATH = /[≡=<>≤≥≠×−±ΣΠ∈^]|min\(|max\(|#\{|(?<![A-Za-z0-9])\/|\/(?![A-Za-z0-9])/;
/** A code span naming a file, which legitimately contains a slash. */
const PATHLIKE = /^[\w./-]+\.(ts|tsx|py|json|md)$/;
/** The ONE sentence that must name the operator it bans — exempt by exact string, not by region. */
const CHARTER = 'no backticked span in this section may carry a mathematical token of any kind';

describe('§22 single-home governance (guard v2)', () => {
  const s229 = section('**§22.9 Invariants', '**§22.10 Outputs');
  const inv23 = section('23. Sweet equity / ratchets / warrants [v1.7.0 — §22]', '## §15 Units, precision, display');

  it('§22.9 carries no mathematical token in any code span (v1 missed 6 of 9 clauses)', () => {
    // The charter spans a line break in the SPEC, so locate it on normalised whitespace and
    // excise exactly that sentence — the ONE exemption, by string rather than by region.
    const flat = s229.replace(/\s+/g, ' ');
    expect(flat, '§22.9 must state its charter sentence verbatim').toContain(CHARTER);
    const scanned = s229.replace(/`≡`/g, '');
    const offenders = [...scanned.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((sp) => MATH.test(sp) && !PATHLIKE.test(sp));
    expect(
      [...new Set(offenders)],
      '§22.9 must CITE §14.23, never restate. Move the rule into §14.23 and write the domain in prose:',
    ).toEqual([]);
  });

  it('every §14.23 clause letter has a companion bound to its OWN §22.9 clause body', () => {
    // Letters DERIVED from §14.23 with an OPEN class — a new clause (j) is required automatically.
    // Clause markers only — an unanchored /\([a-z]\)/ also matches roman numerals in prose.
    const letters = [...new Set([...inv23.matchAll(/(?:^|[;:]|\n)\s*\((?<c>[a-z])\)\s/gm)].map((m) => m.groups!.c))].sort();
    expect(letters.length, '§14.23 item 23 must enumerate lettered clauses').toBeGreaterThanOrEqual(9);

    // Split §22.9 into per-clause bodies so a citation cannot be satisfied by another clause's prose.
    const starts = letters
      .map((c) => ({ c, i: s229.indexOf(`(${c}) → `) }))
      .filter((x) => x.i > -1)
      .sort((a, b) => a.i - b.i);
    for (const c of letters) {
      const idx = starts.findIndex((x) => x.c === c);
      expect(idx, `§22.9 must carry a companion clause "(${c}) → " for §14.23(${c})`).toBeGreaterThan(-1);
      const from = starts[idx].i;
      const to = idx + 1 < starts.length ? starts[idx + 1].i : s229.length;
      expect(
        s229.slice(from, to),
        `§22.9(${c}) must cite §14.23(${c}) inside its OWN body — a substring match anywhere in the section let clause (f) be deleted silently under guard v1`,
      ).toContain(`§14.23(${c})`);
    }
  });

  it('§15’s §22 clause and the §22.11 block that governs it are EQUAL, both directions', () => {
    const m = /<!--§15-BOUND-->([\s\S]*?)<!--\/§15-BOUND-->/.exec(section('**§22.11 Disclosure', '**§22.12 Golden plan'));
    expect(m, '§22.11 must delimit the governed §15 text with <!--§15-BOUND--> markers').not.toBeNull();
    const governed = norm(m![1]);
    const s15clause = norm(
      section('sweet equity, ratchets and warrants [v1.7.0 — §22] model', '; refinancing [v1.3.0 — §18] is a SCHEDULED'),
    );
    // BOTH directions: §15 may not lose governed text, and may not carry §22 disclosure absent
    // from its source (round-4's defect, which the one-directional v1 check could not see).
    expect(s15clause, '§15 has drifted from §22.11, which governs it').toEqual(governed);
  });
});
