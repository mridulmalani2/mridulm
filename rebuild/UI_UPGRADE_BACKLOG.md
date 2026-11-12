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

Owner's requirements below: 1 partly (see "Not built"), 2 to 6 done, 7 observed.
Defects below: all nine fixed, except that three labels quoted verbatim from the SPEC
(§19.5 net-to-LP row and footnote, §23 selldown heading) keep their em dashes.

**Not built / not verified:**

- A recommendation on EVERY field: the catalogue of proposals is unchanged (`lib/engine2/suggest.ts`
  is engine-side). The presentation is new (quiet link, source tag that explains itself, S to
  accept), and AI proposals are now requested once per deal as soon as a key is saved.
- Anything that needs an AI key (proposals, the challenge, "Ask about this deal") is wired but
  was not exercised: no key was used.
- Notes export to a separate "Analyst notes" sheet, not as comments on the Inputs cells.
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
