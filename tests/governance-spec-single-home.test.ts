/**
 * GOVERNANCE gate — SPEC single-home enforcement for §22 [v1.7.0; guard v3, sign-off round 7].
 *
 * WHY THIS EXISTS. §22 shipped the SAME defect five times across four hostile rounds: a rule
 * stated in more than one place, corrected in one place, and left byte-identical to REFUSED
 * text in the others (r2 §16; r3 §15, which the changelog recorded as amended; r3 §22.9(d)/(h);
 * r4 §22.5's annotation; r4 the correction filed in the SUBORDINATE copy while the normative
 * home kept the false claim). Re-syncing by hand is what PHASE_G_EXTENSIONS.md names as the
 * recurring enforcement failure, so the rule is enforced rather than promised.
 *
 * WHY v3. Two prior guards were proven vacuous by the reviewers EXECUTING them:
 *   v1 keyed on the single character `≡`, which only 3 of 9 clauses use → mutants restating
 *      (a), (e), (g), (h) passed; a hardcoded `[a-i]` letter list meant a new clause needed no
 *      companion; a substring citation match let clause (f) be DELETED silently; §15 was pinned
 *      at 18% in ONE direction.
 *   v2 replaced `≡` with an ENUMERATED character ban — a denylist, which fails OPEN. It missed
 *      `+`, ASCII `-`, `*`, `**`, `÷`, and unicode lookalikes (`＝` U+FF1D, `⩽` U+2A7D), its
 *      slash rule was INVERTED (it fired on spaced slashes and paths, and missed `a/b`), it
 *      scanned only BACKTICKED spans so an unbackticked prose formula was invisible, its clause
 *      scan was anchored to a hand-kept punctuation set (`;:` and newline) so a clause added
 *      after a PERIOD was invisible, and its §15 slice covered 39% of §15 so §22 disclosure
 *      placed elsewhere in §15 was ungoverned. 12 of 20 reviewer mutants passed.
 * Both failures share one cause: the author's mutant sample was drawn from inside the covered
 * subset three rounds running, so red-then-revert passed every time while the boundary went
 * untested — the §21-round-1 defect ("the sample was blind to the mutant it exists to exclude").
 * v3's sample is derived FROM the property and includes every shape both reviewers used.
 *
 * v3 IS FAIL-CLOSED WHERE IT MATTERS. PHASE_G's lesson is that a denylist fails open and the
 * fix is a positive allowlist. So the span check is an ALLOWLIST — a code span in §22.9 must be
 * an identifier or a filename, admitting no expression at all — and the token scan is a backstop
 * over the PROSE, where an allowlist is not possible.
 *
 * WHAT IS ENFORCED:
 *   1a. ALLOWLIST — every backticked span in §22.9 is an identifier or a filename. Nothing else.
 *   1b. BACKSTOP — the prose of §22.9 (emphasis and code spans removed) carries no math token,
 *       so an UNBACKTICKED formula is caught too. Only the charter sentence is exempt.
 *   2.  The lettered-clause sets of §14.23 and §22.9 are EQUAL, derived from both homes with an
 *       open character class and no punctuation anchor; each citation is bound to its OWN clause.
 *   3.  §15's delimited §22 clause and §22.11's governing block are EQUAL both directions, and
 *       no §22-specific term appears in §15 outside the delimiters.
 *
 * WHAT IS **NOT** ENFORCED, named so nobody relies on it (overstating scope is how v1 did harm):
 * §16's schema paragraph; §22.5's own annotations; that §14.23 actually CARRIES a correction
 * filed against it; a §14.23 clause introduced without the file's `(x) [domain]` convention; and
 * the DOMAINS, which are prose here and formal in §14.23 and are compared by no test — domains
 * went stale twice (r1 gov-B6, r2 gov-B2) and a domain's MEANING moved once in the r6 prose
 * rewrite (r6 gov-B2), so this is the largest known residual and it rests on the conformance review.
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
/**
 * BACKSTOP over prose. Two forms need care so the check is neither blind nor noisy:
 *  - DIVISION is a slash BETWEEN alphanumerics (`M/P`). v2 had this exactly inverted, firing on
 *    spaced slashes and paths while missing division itself.
 *  - SUBTRACTION in prose is a SPACED hyphen (`a - b`); an unspaced one is a compound word
 *    (`loan-note`, `non-negative`, `round-3`), of which this section has dozens.
 */
const MATH =
  /[≡=<>≤≥≠×÷−±*^%⩽⩾≈·√∈∧∨⇒＝⁄ΣΠ]|\+|(?<=[A-Za-z0-9)\]]) - (?=[A-Za-z0-9([])|(?<=[A-Za-z0-9])\/(?=[A-Za-z0-9])|min\(|max\(|#\{/;
const CHARTER = 'no backticked span in this section may carry a mathematical token of any kind';
/** Terms that mark a sentence as §22 disclosure; none may appear in §15 outside the delimiters. */
const S22_TERMS = ['sweet equity', 'loan note', 'ratchet', 'warrant', 'strip'];

describe('§22 single-home governance (guard v3)', () => {
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

  it('1b BACKSTOP: §22.9 prose carries no math token either (v2 read only backticked spans)', () => {
    const flat = norm(s229);
    expect(flat, '§22.9 must state its charter sentence verbatim').toContain(CHARTER);
    const prose = flat
      .replace(CHARTER, '')
      .replace(/`[^`]*`/g, '') // spans are governed by 1a
      .replace(/\*\*/g, '') // markdown emphasis is not multiplication
      .replace(/→/g, '');
    const hit = MATH.exec(prose);
    expect(
      hit && prose.slice(Math.max(0, hit.index - 60), hit.index + 40),
      'a formula reached §22.9 as PROSE — v2 scanned only backticked spans, so the FALSE §22.4 envelope passed simply by dropping its backticks',
    ).toBeNull();
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
    const blocks = [...SPEC.matchAll(/<!--§15-BOUND-->([\s\S]*?)<!--\/§15-BOUND-->/g)].map((m) => norm(m[1]));
    expect(blocks.length, 'both §15 and §22.11 must delimit the governed text').toBe(2);
    expect(blocks[0], '§15 has drifted from §22.11, which governs it').toEqual(blocks[1]);

    // v2 compared a SLICE, so §22 disclosure placed elsewhere in §15 was ungoverned — round-4's
    // defect surviving by relocation. Nothing §22-specific may sit outside the delimiters.
    const s15 = section('## §15 Units, precision, display', '## §16 Input schema');
    const outside = s15.replace(/<!--§15-BOUND-->[\s\S]*?<!--\/§15-BOUND-->/g, '').toLowerCase();
    for (const t of S22_TERMS) {
      expect(outside.includes(t), `§15 carries §22 disclosure ("${t}") outside the governed block`).toBe(false);
    }
  });
});
