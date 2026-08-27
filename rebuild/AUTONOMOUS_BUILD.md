# AUTONOMOUS BUILD — Deal Engine, Phase G remainder

**You are running unattended.** The owner is not watching and will next look in ~2 sessions.
Work continuously until the usage limit stops you; a timer will wake you to resume.

Owner's constraint, in their words: *"I dont want speed to kill accuracy because accuracy is
PARAMOUNT, but i dont want time and tokens to be wasted going in loops."* Both halves are
binding. The rules below are what make them compatible.

---

## 0. BOOTSTRAP — where you are, then the resume timer

### 0a. Locate yourself (works locally AND in a cloud session)

Do NOT assume a path. Run:

```
git rev-parse --show-toplevel && git log --oneline -3 && git status -sb
```

- **Cloud session (laptop can be off):** you get a fresh clone. `git fetch origin`, then
  `git checkout claude/deal-engine-exits-mip-5ee40a` to continue #8, or branch from `origin/main`
  for a new feature.
- **Local session:** the worktree is under `.claude/worktrees/` in the `mridulm` checkout.

Then install and verify the gates before touching anything:
`npm ci` (or `npm install`) → `npx tsc --noEmit` → `npx vitest run` → `npm run build`.
Expected: **731 passed + 3 live-skipped on `main`** (the 3 are the opt-in live walkthrough). If the numbers differ, STOP and
find out why before writing code — a moved baseline is the first thing to explain, never to
absorb.

### 0b. Set the resume timer

Create a **recurring 5-hour** schedule so you resume after each usage-limit reset:

- Prefer a **scheduled cloud agent / routine** (the `schedule` skill, or `CronCreate` via
  ToolSearch) — a cloud routine keeps running with the laptop off, which is the point.
- Prompt for the scheduled run:
  `hi — resume the autonomous Deal Engine build; read rebuild/AUTONOMOUS_BUILD.md and continue from the STATE section`
- Confirm it exists (list the scheduled tasks) before starting work.
- If scheduling is unavailable here, **say so plainly in your first message** and work anyway —
  do not silently skip it.

Then start immediately. Do not wait for the timer.

---

## 1. PRIME DIRECTIVE

Ship Phase G features to `main`, correctly, one at a time, using the bounded ritual in
`rebuild/PHASE_G_EXTENSIONS.md`. **Merge each feature yourself when its ritual passes** — this
is the owner's standing delegation, reaffirmed 2026-08-12.

### The anti-loop rules — read these twice

The previous session spent **ten hostile rounds on one spec section** and never signed it off.
The post-mortem is in PHASE_G's *"Sign-off exit criterion — BOUNDED"* clause. The rules:

1. **A finding is BLOCKING only if it (a) changes a NUMBER, (b) breaks a gate, (c) makes a
   fixture/mutant VACUOUS, (d) states something FALSE about committed code, or (e) leaves a
   REQUIRED output undefined on a reachable path.** Everything else is a LEDGER item — record
   it in `rebuild/G<n>_LEDGER.md`, fix it in ONE pass before conformance, never block on it.
   **A reviewer returning only ledger items has GRANTED.**
2. **Two review rounds per step. Three only if round 2 moved a number.** If round 3 also moves
   one, STOP and escalate — the design is wrong, not the prose.
3. **Never build governance tooling mid-feature.** No linters, guards or meta-checks. If one
   seems necessary, ledger it.
4. **Prose length is a liability.** Keep new spec sections under ~250 lines. Do not embed round
   history in normative text; the changelog row carries it.
5. **If two consecutive rounds produce only ledger items, GRANT and move on.** That is the
   signal that review has stopped protecting accuracy.

### Where accuracy actually lives

Not in spec prose. In **step 2** (a different-language reference derivation + two independent
blind adjudications) and **step 3** (documented mutants run RED and reverted). Spend the budget
there. A spec review that has stopped moving numbers has stopped protecting accuracy.

---

## 2. STATE (update this section as you go — it is the resume point)

- **Repo** `mridulmalani2/mridulm` (GitHub). Everything needed is on origin — do not depend on
  any local path. Locally the checkout is `~/Desktop/mridulm` with worktrees under
  `.claude/worktrees/`; in a cloud session it is a fresh clone.
- **main** @ `c1c87a2`, SPEC **v1.7.0** (§22 shipped). A PARALLEL session owns the SITE
  surface and has merged PRs #123–#125 (cookieless analytics, research-section archiving,
  a STATE doc commit). It has touched **zero** engine files — the split is clean:
  **this line of work owns `lib/engine2/**`, `tests/engine2-*`, `tests/goldens/**`,
  `scripts/goldens/**`, `rebuild/**`; the other owns the site.** Both edit
  `rebuild/AUTONOMOUS_BUILD.md` and `package.json`, so expect merges there only.
- **#8 MERGED 2026-08-14 — PR #121, main @ `353e52a`, SPEC v1.7.0, vitest 731 passed +
  3 live-skipped (53 files).** The full bounded Tier-A ritual ran end-to-end in one day:
  spec SIGNED r11 (3 lenses, 0 blocking; fingerprint 0398fb3) → goldens G9-SWEET/G10-RATCHET
  with TWO blind adjudication passes (zero mismatches; DERIVATION.md §22) → engine (both
  goldens reproduced; §22.13 fixtures; 19 mutants RED/reverted; accuracy audit's 2 blocking
  fixed in-step) → UI (both §15 surfaces; M10 Excel; 8 display mutants) → conformance
  (TIER_A_CORRECT; 1 blocking closed: the M10 row on the S&U WORKSHEET, footing asserted)
  + live three-issuer walkthrough GREEN regression-free (G10_SWEET_WALKTHROUGH.md) →
  ledger pass EMPTY (G10_LEDGER.md). The live E-gate harness is committed opt-in at
  `tests/walkthrough-g10.live.test.ts` (LIVE_WALKTHROUGH=1) — reuse it for future features.
- **IN FLIGHT: #7 partial exits / IPO selldown — step 2b (blind adjudication).**
  Branch `claude/deal-engine-partial-exits-586f25`, which fast-forwarded the earlier
  `claude/partial-exits-spec` work (that branch is still checked out in a DEAD worktree —
  do not try to check it out; this branch contains its full history).

  **Step 1 (spec §23) — DONE except the round-1 grant.** Constraints dossier + ten design
  decisions in `rebuild/G11_PARTIAL_EXITS_BRIEF.md`; §23 drafted @ `13d450c`.

  **OWNER QUESTION Q-A: RESOLVED 2026-08-27 @ `25a53e1` — DPI/payback moved to the
  REALIZED-PROCEEDS basis (selldown proceeds COUNT).** The owner delegated the call with an
  instruction to research market practice and adopt it; practice is not split (fund-layer DPI
  counts a secondary the quarter it closes; deal-layer modelling splits inflows into
  realized/unrealized). The draft's distributions-only default was L-10 OVER-APPLIED: L-10's
  degeneracy comes from counting the ratio's OWN EXIT, which an interim realization does not
  do. Full rationale + sources in `rebuild/OWNER_QUESTIONS.md`. It landed BEFORE adjudication,
  so there was NO fixture re-pin, and it is a net simplification (no memo field — the
  distributions-only series stays derivable; the deal-vs-fund layer note became one of
  AGREEMENT). **Q-A is CLOSED. Do not reopen it.** Q-B stays rejected-by-design.

  **TWO BLOCKING defects were found while re-deriving the golden under the flip** (not by
  review — by doing the arithmetic), both fixed in `25a53e1` and recorded in
  `rebuild/G11_LEDGER.md`: (B1) §23.8/§14.9(b)'s walk-down had TWO terms and double-counted
  the proceeds — the whole correction is `proceeds − buyer_share`, ONE term, and residual (b)
  could never have caught it (v1.1.2); (B2) §23.12 asserted the WRONG IRR direction — it
  FALLS, because the sold slice's own implied return (≈15.9%) is ABOVE the deal's.

  **Step 2a — DONE @ `3e40cbe`.** `scripts/goldens/spec_calc.py` gained the §23 arithmetic
  (spec-literal, engine-import-free) and **G11-SELL** = G2-DIST + `{year 3, fraction 0.25,
  event_multiple 8.5}`. Fixture SHAPE change landed with **ZERO value movement**: 14
  insertions, 0 deletions across the whole fixture tree (one `exit.selldown_buyer_share: 0.0`
  key each), with the matching unconditional carrier in `types.ts`/`exit.ts` — the §22.10
  precedent verbatim, which is what keeps the gate green before step 3.
  Reference output: proceeds 198.11, sponsor exit 783.05, buyer 261.02, buyer Δ 62.91,
  IRR 13.1313% (host 13.3906%), MOIC 1.7405 (host 1.8553), payback null,
  dpi [0.0, 0.0206, 0.3841, 0.3968, 0.4071] — the year-3 leaf is an **8.2× discriminator**
  of the Q-A basis, so no distributions-only engine can pass it.
  NOTE §23.12's DISPLAY seeds are 2dp reconstructions and differ in the cents from the
  full-precision fixture (1082.305 vs 1082.28) — restate them from the adjudicated chain.

  **Round 1 (post-flip text) — PARTIAL.** Three lenses launched; a session usage limit killed
  two mid-read. The CONTRACTS lens REFUSED with **3 blocking, all verified against the file
  and all applied**: (C-B1) §14.9 clause 9 — the bridge identity's OTHER full-restatement
  home — was never amended, leaving it false by ≈$62.90m on every selldown run (the §22
  G9-SWEET residual repeated); (C-B2) §19's LP interim leg was un-amended in BOTH directions
  — the proceeds missing from §19.3/§19.6(a) (≈$198.11m on a `selldown ∧ fund` run, which
  §23.3 permits) and §14.24(c)'s (1−f) partition never reaching the fund layer at all (≈$4.5m)
  — the §22.7 three-call-site lesson repeated; (C-B3) a negative `implied_event_equity`
  reaches §19.4's waterfall, which has no `D < 0` arm, leaving four `fund_lp_net` outputs
  undefined on a reachable input and violating §14.20(d). Two ledger items were PROMOTED and
  fixed because step 2a had just made them FALSE. Full record: `rebuild/G11_LEDGER.md`.

  **RESUME POINT — gates green: tsc clean, vitest 762 passed + 3 live-skipped (54 files),
  build green.** TWO things are OWED before this feature may be granted, both killed by the
  same usage limit, and NEITHER may be skipped:
  1. **Round 1's ARITHMETIC and COHERENCE lenses.** Re-run against the CURRENT §23 (not the
     `13d450c` draft, and not the pre-C-B fixes text). Under the round cap this still counts
     as round 1. Given that the one lens that DID finish found three real blocking defects —
     two of them exact repeats of §22 findings in un-amended companion homes — do not assume
     the other two lenses will come back clean.
  2. **Step 2b: the TWO blind adjudication passes on G11-SELL** (each derives from SPEC text
     alone and WRITES its numbers to scratch BEFORE opening the fixture), recorded in
     `tests/goldens/DERIVATION.md`, which currently carries NO §23 record.
     **G11-SELL is NOT gospel until they sign. Do not start step 3's mutants against it.**
  Then: apply blocking findings only (bounded rule), fix the four open ledger items
  (C-L3..C-L6 + L1..L3) in ONE pass, GRANT + stamp the fingerprint + bump the SPEC header to
  v1.8.0, then step 3 (engine + §23.13 fixtures + documented mutants RED and reverted).

### Backlog — 12 items, 6 merged

| # | Tier | Feature | State |
|---|---|---|---|
| 1 | A | Interim distributions + cash trap | ✅ merged |
| 3 | A | Fund/LP overlay §19 | ✅ merged |
| 4 | B | Sector comps §21 | ✅ merged (PR #120) |
| 5 | A | Refinancing §18 | ✅ merged |
| 6 | A | PIK toggle §20 | ✅ merged |
| 8 | A | Sweet equity + ratchets + warrants §22 | ✅ merged (PR #121) |
| **7** | **A** | **Partial exits / IPO selldown** | 🔄 **step 1 (spec)** |
| **9** | **A** | **Add-on acquisitions** | then |
| 2 | B | Quarter-stitched LTM | then |
| 10 | B/A | Market-data suggestions | then |
| 11 | B | Covenant step-downs | then |
| 12 | C | Trace mode v2 | last |

**Order (owner decision 2026-08-12): finish #8, then #7, #9 — the hard Tier-A arithmetic while
budget lasts — then #2, #10, #11, #12.** #9 is called "the old engine's deepest wound"; do not
leave it for a session with no budget.

---

## 3. PER-FEATURE LOOP

For each feature, in `rebuild/PHASE_G_EXTENSIONS.md`'s tier template, with the bounded rule:

1. **Spec amendment** — new SPEC section: convention + formula + REJECTED alternatives +
   changelog row + §14 invariant + §15 disclosure + §16 schema. Pin the golden's EXACT inputs
   and ≥1 worked closed-form IN the spec. Then **≤2 hostile review rounds**. GRANT when only
   ledger items remain. Stamp the grant + fingerprint commit in the changelog row and bump the
   SPEC header version.
2. **Golden extension** — new golden(s) + an INDEPENDENT reference derivation in
   `scripts/goldens/spec_calc.py` (different language, zero engine imports), then **TWO
   INDEPENDENT BLIND adjudication passes** (each derives from SPEC text alone and commits its
   numbers to scratch BEFORE opening the fixture), recorded in `tests/goldens/DERIVATION.md`.
   **Do not shortcut this** — it is where accuracy lives.
3. **Engine + fixtures + invariants** — implement in `lib/engine2/**`; add `check.ts`
   invariants; run documented mutants RED and revert them **by string-replace with `count == 1`
   asserted**, never `git checkout/stash/reset`. Then one hostile accuracy audit over the math.
4. **UI** — input surface at the right disclosure tier + output surface; label/value-provenance
   MUTATION tests on every displayed/relabelled field; the §15 disclosure row on BOTH
   methodology surfaces (the React table AND `lib/engine2/excelExport.ts`).
5. **Conformance + walkthrough** — adversarial review of the DIFF and the tier choice; then the
   three-issuer E-gate walkthrough (Apple CIK 320193 / SAP CIK 1000184 / Vinci via ESEF,
   through the PRODUCTION proxy). Record `rebuild/G<n>_<FEATURE>_WALKTHROUGH.md`.
6. **Ledger pass** — fix everything in `rebuild/G<n>_LEDGER.md` in one commit.
7. **Merge** — PR → CI green → **merge with a MERGE COMMIT** (repo convention) → verify main CI
   → update the memory file `deal-engine-rebuild-plan` → update this file's STATE section.

**Gates after every commit:** `npx tsc --noEmit` · `npx vitest run` · `npm run build`. Never
commit red.

**Use Workflows for review rounds** — independent lenses in parallel, then adversarially verify
any blocking finding with two skeptics before acting on it. Round 9 of #8 proved this pays:
two findings a previous round had *refuted* were confirmed on re-verification, and two that
looked blocking were correctly downgraded.

---

## 4. STOP AND ESCALATE — do not guess

Write the question into `rebuild/OWNER_QUESTIONS.md`, commit it, and **move to the next
feature** rather than blocking:

- A third review round in one step produces another number-moving defect (rule 2).
- A feature needs a convention with no defensible default (a real product decision).
- A gate cannot be made green without changing a committed golden VALUE.
- The three-issuer walkthrough fails against live data.
- Anything that would require force-pushing, rewriting history, or deleting committed goldens.

**Never** fabricate a sign-off, stamp a GRANT no reviewer gave, or record a fix in a changelog
that is not in the artifact. That last one has bitten this project three times — verify fixes
landed **by diff**, not by assertion.

---

## 5. PROCESS LESSONS — each cost real rounds

- **ONE normative home per rule; cite from the others.** The same defect shipped SIX times as
  "corrected in one place, left byte-identical to REFUSED text in another".
- **A fix landing in the GOVERNING home can make it WORSE than its companion** (4×). Re-read
  the normative text after correcting it, and check the companion in the SAME edit.
- **VERIFY THE FIX LANDED, by diff.** §15 was byte-identical to a refuted draft while the
  changelog said it was amended.
- **DERIVE MUTANTS FROM THE PROPERTY, not from convenience.** Three rounds running, every
  mutant carried a token the guard already covered, so red-then-revert passed while the
  boundary went untested.
- **A DENYLIST FAILS OPEN.** Invert to a positive allowlist.
- **VERIFY EVERY CLAIM ABOUT THE CODEBASE AGAINST THE CODEBASE.** Caught this way: "the §8 plug
  is unaffected" (false — goodwill moved), "§19 composes unchanged" (false — three call sites),
  "13 fixtures" (12).
- **Assert `count == 1` on every string replacement, and verify ALL anchors BEFORE applying
  any** — a batch that aborts mid-way silently loses the edits already made.
- **Make schema fields REQUIRED-with-null**, never optional — a dropped field becomes a compile
  error rather than a silent `undefined`.
- **NEVER seed a reference derivation from rounded display values.**

---

## 6. SESSION HYGIENE

- **Commit early and often**, with messages that state what was verified and how. A limit can
  hit mid-task; uncommitted work is lost work.
- **Push the branch after every few commits.** Origin is the durable record — and in a cloud
  session it is the ONLY record; an unpushed commit does not survive the session.
- **Keep this file's STATE section current** — it is the resume point when the timer fires.
- **Persist anything a future session needs into the REPO**, not scratch. Session-scoped paths
  do not survive; `rebuild/G10_ROUND10_OPEN_MINORS.md` exists because of that lesson.
- When the limit is near, spend the last tokens on: commit → push → update STATE. Nothing else.
- On waking from the timer: read this file, `git log --oneline -10`, `git status`, run the
  gates, and continue from STATE.
