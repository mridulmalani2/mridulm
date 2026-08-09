/**
 * GOVERNANCE gate — SPEC single-home enforcement for §22 [v1.7.0; right-sized, sign-off round 8].
 *
 * WHY THIS EXISTS. §22 shipped the SAME defect five times across four hostile rounds: a rule
 * stated in more than one place, corrected in one place, and left byte-identical to REFUSED
 * text in the others (r2 §16; r3 §15, which the changelog recorded as amended; r3 §22.9(d)/(h);
 * r4 §22.5's annotation; r4 the correction filed in the SUBORDINATE copy while the normative
 * home kept the false claim). Re-syncing by hand is what PHASE_G_EXTENSIONS.md names as the
 * recurring enforcement failure, so the rule is enforced rather than promised.
 *
 * WHY THIS IS DELIBERATELY SMALL [round-7, on the governance reviewer's proportionality call].
 * Three guard generations were each proven vacuous by the reviewers EXECUTING them: v1 keyed on
 * one character (`≡`, used by 3 of 9 clauses); v2 replaced it with an ENUMERATED character ban,
 * which is a denylist and so failed open (missing `+`, ASCII `-`, `*`, `**`, `÷`, unicode
 * lookalikes, with its slash rule inverted) and scanned only backticked spans; v3 inverted the
 * span check to an allowlist and added a prose token backstop. Each generation closed the
 * previous NOTATION and the next round found the complement — the same false §22.4 envelope
 * survived all three by moving from `≤` to unbackticked `≤` to the words "is at most".
 *
 * That is an unbounded chase, and the ledger said so: across rounds 5–7 the guard caught ZERO
 * §22 defects and OCCASIONED THREE (a domain narrowed by the prose rewrite it mandated, a domain
 * narrowed by the disambiguation that followed, and a stale self-description it PINNED into the
 * SPEC through a CHARTER assertion). PHASE_G's Tier-A template asks for a spec amendment and a
 * hostile sign-off — not a prose linter. So the prose backstop and its CHARTER pin were CUT in
 * round 8, and what remains is only what a machine is genuinely better at than a reader:
 * IDENTITY RELATIONS ACROSS WIDELY-SEPARATED TEXT.
 *
 * WHAT IS ENFORCED — three fail-closed checks, none of which ever needed a semantic revision:
 *   1. ALLOWLIST — every backticked span in §22.9 is an identifier or a filename. It may NAME a
 *      thing and never RELATE two, so no expression in any notation satisfies it.
 *   2. The lettered-clause sets of §14.23 and §22.9 are EQUAL (derived from both homes, no
 *      punctuation anchor), and each citation is bound to its OWN clause body — under v1 clause
 *      (f) was deletable in silence because another clause's prose named it.
 *   3. §15's delimited §22 clause and §22.11's governing block are EQUAL both directions. This
 *      defect actually occurred TWICE IN OPPOSITE DIRECTIONS (r3 §15 stale, r4 §22.11 stale) and
 *      both times only a reviewer holding two passages ~1,900 lines apart caught it.
 *
 * WHAT IS **NOT** ENFORCED — named so nobody relies on it, because overstating scope is how v1
 * did harm (a reviewer who reads "mechanically enforced" stops checking):
 *   - A rule RESTATED IN §22.9 AS PROSE, in words rather than symbols ("A plus B equals C"), is
 *     NOT detected and cannot be: no text scanner separates "a domain in prose" from "a rule in
 *     prose", and round 6 mandated prose for the domains. The round-4 defect itself survives in
 *     this form. Conformance reads §22.9 against §14.23 clause by clause.
 *   - The DOMAINS, prose here and formal in §14.23, are compared by no test. They went stale
 *     twice (r1 gov-B6, r2 gov-B2) and a domain's MEANING moved twice more in the round-6/7
 *     rewrites (gov R6-B2, gov R7-B3). This is the largest known residual.
 *   - §16's schema paragraph; §22.5's own annotations; whether §14.23 CARRIES a correction filed
 *     against it; a §14.23 clause introduced without the file's `(x) [domain]` convention; and
 *     §22 disclosure in §15 using none of the five terms check 3 sweeps for.
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

/** ALLOWLIST (fail-closed): a §22.9 code span may only name a thing, never relate two things. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const PATHLIKE = /^[\w.-]+\/[\w./-]*\.(ts|tsx|py|json|md)$|^[\w.-]+\.(ts|tsx|py|json|md)$/;
/** Terms that mark a sentence as §22 disclosure; none may appear in §15 outside the delimiters. */
const S22_TERMS = ['sweet equity', 'loan note', 'ratchet', 'warrant', 'strip'];

describe('§22 single-home governance (right-sized, round 8)', () => {
  const s229 = section('**§22.9 Invariants', '**§22.10 Outputs');
  const inv23 = section('23. Sweet equity / ratchets / warrants [v1.7.0 — §22]', '## §15 Units, precision, display');

  it('1a ALLOWLIST: every §22.9 code span is an identifier or a filename (v2 denylist failed open)', () => {
    const offenders = [...s229.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((sp) => !IDENT.test(sp) && !PATHLIKE.test(sp));
    expect(
      [...new Set(offenders)],
      '§22.9 must CITE §14.23, never restate. A code span here may NAME a thing, never relate two — move the rule into §14.23 and write the domain in prose:',
    ).toEqual([]);
  });

  it('2 the lettered-clause sets of §14.23 and §22.9 are EQUAL (no punctuation anchor)', () => {
    // Lookahead on the file's own `(x) [domain]` / `(x) an …` convention — NOT on what precedes
    // the marker, which in v2 was a hand-kept set that missed a clause introduced after a period.
    const normative = new Set([...inv23.matchAll(/\((?<c>[a-z])\)\s(?=\[|an\b)/g)].map((m) => m.groups!.c));
    const companion = new Set([...s229.matchAll(/\((?<c>[a-z])\)\s→/g)].map((m) => m.groups!.c));
    expect(normative.size, '§14.23 item 23 must enumerate lettered clauses').toBeGreaterThanOrEqual(9);
    expect(
      [...companion].sort(),
      'the two homes disagree about which clauses exist — a §14.23 clause with no §22.9 companion, or the reverse',
    ).toEqual([...normative].sort());

    // Bind each citation to its OWN clause body: a substring match over the whole section let
    // clause (f) be deleted silently under v1, because another clause's prose named it.
    const starts = [...normative].map((c) => ({ c, i: s229.indexOf(`(${c}) → `) })).sort((a, b) => a.i - b.i);
    for (let k = 0; k < starts.length; k++) {
      const to = k + 1 < starts.length ? starts[k + 1].i : s229.length;
      expect(
        s229.slice(starts[k].i, to),
        `§22.9(${starts[k].c}) must cite §14.23(${starts[k].c}) inside its OWN body`,
      ).toContain(`§14.23(${starts[k].c})`);
    }
  });

  it('3 §15 and §22.11 are EQUAL both directions, and §15 carries no §22 text outside the markers', () => {
    // Locate each block by the SECTION it sits in, not by file order [round-7 gov-M3].
    const blockIn = (start: string, end: string, label: string) => {
      const m = /<!--§15-BOUND-->([\s\S]*?)<!--\/§15-BOUND-->/.exec(section(start, end));
      expect(m, `${label} must delimit the governed §22 text with <!--§15-BOUND--> markers`).not.toBeNull();
      return norm(m![1]);
    };
    const inS15 = blockIn('## §15 Units, precision, display', '## §16 Input schema', '§15');
    const inS2211 = blockIn('**§22.11 Disclosure', '**§22.12 Golden plan', '§22.11');
    expect(inS15, '§15 has drifted from §22.11, which governs it').toEqual(inS2211);

    // v2 compared a SLICE, so §22 disclosure placed elsewhere in §15 was ungoverned — round-4's
    // defect surviving by relocation. Nothing §22-specific may sit outside the delimiters.
    const s15 = section('## §15 Units, precision, display', '## §16 Input schema');
    const outside = s15.replace(/<!--§15-BOUND-->[\s\S]*?<!--\/§15-BOUND-->/g, '').toLowerCase();
    for (const t of S22_TERMS) {
      expect(outside.includes(t), `§15 carries §22 disclosure ("${t}") outside the governed block`).toBe(false);
    }
  });
});
