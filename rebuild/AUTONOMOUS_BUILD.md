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
- **IN FLIGHT: #7 partial exits / IPO selldown — step 1 (spec §23) on branch
  `claude/partial-exits-spec`.** Progress 2026-08-14 evening: constraints dossier done
  (DR research is EMPTY on selldowns — every rule derived from committed conventions);
  ten design decisions recorded in `rebuild/G11_PARTIAL_EXITS_BRIEF.md`; TWO escalations
  filed in `rebuild/OWNER_QUESTIONS.md` (Q-A DPI basis — conservative default taken;
  Q-B rollover coexistence — rejected v1); **§23 DRAFTED @ `13d450c`** (203 lines, all
  companions amended: §1, §9 table, §12, §14.16 six-term, §14.24(a)–(g), §15-SELL governed
  block both homes, §16, changelog v1.8.0 row); hostile ROUND 1 workflow launched
  (wf_8ee9e1df-f24: arithmetic/contracts/coherence lenses + two-skeptic verification).
  **RESUME POINT (2026-08-14, verified): branch `claude/partial-exits-spec` @ `b77aeb6`,
  which is the §23 draft WITH `origin/main` merged in (the parallel session's site work +
  its dependency bump). Gates on it: tsc clean, vitest 755 passed + 3 live-skipped
  (54 files), build green.** The round-1 workflow referenced below (`wf_8ee9e1df-f24`) was
  launched by a session that has since ended — **its result is NOT retrievable; re-run
  round 1 from scratch.** Then: fix only findings that are blocking under the bounded rule
  (§PHASE_G "Sign-off exit criterion"), ledger the rest into `rebuild/G11_LEDGER.md`,
  round 2 only per the cap, then GRANT + stamp + step 2 (G11-SELL on the G2-DIST host,
  the same blind-adjudication machinery as #8).
  **ASK THE OWNER FIRST — `rebuild/OWNER_QUESTIONS.md` Q-A** (does DPI/payback include
  selldown proceeds?). The draft took the conservative letter-of-the-rule default
  (distributions-only + a separately-labelled memo line). Flipping it after step 2 costs a
  fixture re-pin, so raise it BEFORE the goldens are adjudicated. Q-B (selldown ∧ rollover)
  is pre-resolved by rejection; it only reopens if the owner wants the combination.
  A concurrently running cloud-routine session (fired 10:47 UTC from a pre-merge clone) may have pushed
  stale step-5 work to the already-merged #8 branch — IGNORE that branch; #8 is closed.
  Any session resuming from this STATE: if `claude/partial-exits-spec` exists on origin,
  continue it; do not restart #7 from scratch.

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
