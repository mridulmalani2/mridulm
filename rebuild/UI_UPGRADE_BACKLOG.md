# Deal Engine: UI upgrade backlog

Recorded 2026-11-11. Financial accuracy comes first; this list is the work that follows it.

## Status (2026-11-12, branch `claude/ui-functionality-upgrade-ideas-e3173e`)

The UI upgrade is BUILT on this branch (tests, type-check and `npm run build` green; checked in the
browser at desktop and phone widths). No engine arithmetic changed. What it added, and where:

- **Design system** — `index.css` (`.de-root` tokens: Geist for text and figures, Fraunces for
  titles; blue = typed, ink = calculated), `components/deal-engine/ui/kit.tsx` (buttons, custom
  drop-down, segmented choice, switch, calendar date field, drawer).
- **Assumptions** — section rail with counts, the sheet, a live result panel
  (`v2/Workbench.tsx`); the debt stack as a term sheet (`v2/DebtTable.tsx`); spreadsheet keyboard,
  row paste, Ctrl+Enter fill-right, per-input notes (`v2/fields.tsx`).
- **Shell** — command palette (Ctrl/Cmd+K), page guide, deal menu (`shell/`); cases, build history
  with an IRR walk, the deal library and deal files (`store/workspace.ts`, `shell/WorkspaceDrawers.tsx`).
- **Trace** — click a figure to see its formula and what feeds it, read from the exported
  workbook's own formula graph (`lib/trace`, `shell/TraceDrawer.tsx`, `tests/trace-index.test.ts`).
- **Results** — views in a rail; tornado, any-two-inputs grid, break-evens, covenant and cash
  charts (`results/Analysis.tsx`, all through `lib/analysis`, pinned to the §13 primitives by
  `tests/analysis.test.ts`); review view; one-page summary (print or PDF); copy any table; save
  any chart as PNG or SVG; analyst notes exported on their own sheet of the Excel model.
- **Source and manual entry** — rebuilt around the company search; the sector is now a required
  choice (it selects the comps band), no longer pre-selected.

Owner's requirements below: 1 done for every field with a cited basis (see "Still open"), 2 to 6 done, 7 observed.
Defects below: all nine fixed.

**Second pass (2026-11-12, same branch, PR #128):**

- **Recommendations**: `lib/engine2/suggest.ts` now proposes every single field that has a cited
  basis in `suggestions/conventions.json` or the filing: holding period, entry and exit basis,
  each facility's base rate (dated, with a warning to check it), floor, spread, OID,
  amortization and size, mezzanine coupons, the sweep level, the springing trigger, statutory
  tax terms for a US filer, NOL usability, promote terms, working-capital figures. Clicking the
  word after "use" opens how the value was reached. Three older tests that pinned "no sweep
  proposal" and "no tax-rate proposal" were updated to the new direction.
- **Notes** export as comments on the Inputs cells (`results/exportModel.ts`, checked against
  the workbook by `tests/export-notes.test.ts`), plus the "Analyst notes" sheet.
- **Em dashes** are gone from everything a user reads, engine messages, Excel labels and the
  filing-parser notes included; `tests/no-em-dash.test.ts` holds it. The SPEC's two quoted
  §19.5 labels were amended and a presentation rule added at its head; SPEC prose is unchanged.

**Browser review (2026-11-12, Hasbro import, Source to Results):** clicked through by hand; six
defects fixed. Accepting a proposal now refreshes the proposals that follow it (the debt table's
base rate, exit = entry) and AI proposals survive later edits (`store/engine2Model.ts`, pinned in
`tests/engine2-store.test.ts`); the explanation pop-up is anchored to the window so it is never
cut off, and the debt table uses it too; the entry multiple and the margin proposal say LTM when
the figures are LTM (`entryBasisText` in `lib/engine2/display.ts`); group proposals disappear once
applied; sweep priority shows as a whole number. Trace, tornado, break-evens and the Excel note
comments were checked and work.

**Review follow-ups (2026-11-12, branch `claude/new-session-4febe2`, on top of PR #128):** the six
items left after that review are closed.

- **Internal references** are gone from everything a user reads: no "SPEC", no section mark that
  points into the specification, no research-note ids, no "owner decision", no build-phase names.
  Statute citations stay (IRC §163(j), §382). Research-note ids in `conventions.json` citations
  were replaced by the published sources those notes recorded. Held by
  `tests/no-internal-references.test.ts`. Field names inside deep validation messages
  (`hurdle_moic must be > 0`) and module prefixes (`sourcesUses:`) are NOT yet reworded.
- **Reload on Results** stays on Results: the session saves only the fact that the deal was built
  and runs the build again on restore (`store/session.ts`); no output is ever read from storage.
- **Sensitivity**: one hurdle shared by the grid and the break-evens (`store/dealUi.ts`); one
  colour rule at a time (against the hurdle once set, against the base case until then); the
  entry and exit grid is shown once (a test pins that the interactive grid opens on exactly the
  exported one).
- **Figures**: one minus sign in every formatter (`lib/format`), capex in the history table
  formatted as money; inputs accept the typographic minus; a copied table carries plain hyphens.
- **Dark flash** gone (the page behind the deal engine is the paper colour, and a loading shell
  shows while the code arrives); **file name** has no doubled underscore.

**Polish pass (same branch):** trace panel rebuilt (formula with named, clickable references;
a row across years as one strip; feeds that open in place; the typed inputs behind a figure;
back and Alt + Left); chat window rebuilt in `shell/AssistantDrawer.tsx` (starter questions,
formatted answers with copy, typing indicator, growing composer, retry); kit additions in
`ui/kit.tsx` and `index.css`: toasts, tooltips, skeletons, busy buttons, copy buttons, a section
progress meter, soft edges and pinned row labels on wide tables, short enter transitions (all
off under reduced motion), focus returned to the opener when a panel closes. The chat window was
checked with a stubbed answer only: no real AI key has been used.

**Assistant (2026-11-13, branch `claude/lbo-ai-chat-agent-408aec`):** the chat drawer is replaced
by an assistant docked beside Clean, Assumptions and Results (`shell/AssistantDock.tsx`), driven by
`lib/assistant`:

- `advisor.ts` works out, by plain rules and with no AI call, the next move on each step, the
  sourced values on offer and how each was reached; inside a field it explains the field and
  predicts the one after it. On Clean it proposes the lease treatment from the accounting
  framework, lists what the filing reports, and asks whether an added cost stops or continues.
- `guidance.ts` holds the field notes (what an input is, how it is set, what to watch). A note
  never states a figure (pinned by test).
- `brief.ts` and `ask.ts` answer questions: the deal as short indexed notes, the few that match a
  question, a prompt of about 500 tokens, and a check that marks any figure in an AI answer that
  is not in its notes. With no key the notes answer as they are; a failed provider falls back to
  them.
- **The AI no longer proposes numbers.** `lib/ai2/suggest.ts`, the store's `aiSuggest` and the
  automatic request on Assumptions are removed (owner decision 2026-11-13: engine numbers only).
- `lib/ai2/textCall.ts` is sized for a free key: small answer budget, named failures (wrong key,
  limit reached and the wait), a fallback model list per provider, the Google key in a header.
- The optional key box is on the Source screen, with a provider picker and a "Try the key" call.

Checked in the browser on a Hasbro import, Source to Results, at 1600, 1280 and phone widths. The
AI path was exercised with a stubbed provider response only: no real key has been used, so the
model names in `PROVIDER_MODELS` and real free-tier behaviour are unverified.

**Still open:**

- Fields with NO cited basis get no proposal without an AI key: minimum cash, maturities, exit
  fees, the revolver commitment fee, valuation inputs (risk-free, MRP, betas, long-run growth),
  fund terms, covenant levels. Adding them needs cited sources in `conventions.json` first.
- Anything that needs an AI key (the challenge, typed questions, "Put it in plain words") is
  wired but has never been exercised against a real provider.
- The new proposals were checked by test and by loading the page; the debt-table "use" links and
  the explanation pop-up were not clicked through by hand on a US filer import.
- Football field, segment / price × volume operating build, add-on acquisitions: left out by
  owner direction (engine work).

## Owner's requirements

1. **A recommendation on every assumption field.** Each input shows a suggested value. Clicking
   the suggestion opens a pop-up that explains how the number was reached (source, calculation,
   citation). Today only a handful of fields have a proposal, and AI proposals appear only after
   pressing "AI suggest"; adding a key alone shows nothing.
2. **Info button, top right, on every page.** Opens page-specific guidance: what the page does,
   what an analyst can do on it, how to use the engine. Visual (cards, light animation), not a
   wall of text.
3. **Less text on the screens themselves.** Keep only what is needed; move explanation behind
   the info button. Remove em dashes from UI copy.
4. **Traceability.** Click a number and see where it came from and what feeds it.
5. **Look and feel.** Current UI reads as dated: bland colour scheme, weak fonts, native
   drop-downs and date picker. Wanted: modern, well-designed, something a finance user wants to
   open.
6. **Tools area (goal-seek, redline, memo).** Cluttered and unclear what each button offers.
   Redesign. Chat should not live inside the tools strip.
7. Fixes must be general to every deal, never keyed to the case that exposed the problem.

## Found during the accuracy pass (not yet fixed)

- Suggestion chips sit in the keyboard tab order and unmount when their field is committed, so
  tabbing through a field that has a chip can drop focus and lose the next keystroke.
- Number boxes strip all whitespace when parsing, so a pasted "125<tab>3" becomes 1253.
- The Methodology tab is a long undifferentiated table, and lists conventions that do not apply
  to the deal on screen (for example "effective rate from the filing" on a hand-entered case).
- "Things to check" tells a user who prices entry on forward EBITDA and exit on exit-year EBITDA
  that the comparison is "apples-to-oranges". The flag is fair; the wording is not.
- Balance sheet for a forecast-only case shows the whole purchase price as goodwill with zero
  PP&E and NWC, because the case states no opening balance sheet. Needs a clearer label.
- Sensitivity grid does not say that debt is held constant and equity is the plug when the entry
  multiple moves.
- Credit tab footnote still says entry leverage is on "FY EBITDA" for a forecast-only case.
- Headline figures show one decimal (7.6x, 21.2%); Excel users expect two (7.59x, 21.20%).
- The revolver is always undrawn at close (an engine rule, SPEC §2), with no note on the input.

## Done during the accuracy pass

- Per-line inputs no longer lose focus on every edit.
- A forecast-only case lands on Assumptions and survives a reload.
- "Exit at the entry multiple" is offered when entry is a purchase price, at full precision.
- Operating chart draws revenue only when the deal has revenue; entry leverage falls back to
  forecast year-1 EBITDA when there is no historical year; no "−0.0" anywhere.
- Surplus-cash distribution policy and the interest-cap ATI basis start blank and gate Build.
