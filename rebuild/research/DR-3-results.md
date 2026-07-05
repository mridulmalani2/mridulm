# Tax Mechanics of a US LBO Model: Specification for the 2025–2026 Tax Module

## TL;DR
- **OBBBA is the single biggest change:** signed July 4, 2025 (P.L. 119-21), it permanently restored the EBITDA-based ATI computation for the §163(j) interest limitation for tax years beginning after Dec. 31, 2024 — a materially favorable change for leveraged deals that a 2025–2026 model MUST reflect. The other six items are largely governed by pre-existing law (TCJA, IRA 2022) that OBBBA left intact.
- **Order of operations is the backbone of the tax module:** compute ATI/taxable income → apply the §163(j) interest cap FIRST (now on EBITDA, 30% of ATI) → apply NOL usage subject to the §382 annual limit → apply the 80%-of-taxable-income NOL cap → compute regular cash tax → run any minimum-tax floor.
- **Most simplifications are defensible if disclosed:** ignoring AHYDO, the transaction-cost deductible/capitalized split, full CAMT mechanics, and (in a no-step-up stock deal) book/tax D&A divergence are all standard v1 conventions — but acquired NOLs are frequently unavailable in real sponsor structures and should not be assumed to survive by default.

## Key Findings
1. **§163(j) reverted to EBITDA** (favorable) effective for tax years beginning after Dec. 31, 2024 under OBBBA; the 30% cap, business interest income add, and indefinite carryforward persist.
2. **§382 limits acquired NOLs** to equity value × long-term tax-exempt rate (3.58% for December 2025 ownership changes per Rev. Rul. 2025-24, Table 3); interacts with the TCJA 80% cap.
3. **Acquired NOLs frequently do NOT survive** the structures sponsors actually use (asset deals, 338(h)(10)/336(e) elections).
4. **Financing fees/OID amortize over the debt's life** for tax; **AHYDO** can permanently disallow part of high-yield PIK/OID interest.
5. **Transaction costs** split into deductible vs. capitalized under the INDOPCO regs; the 70/30 success-fee safe harbor is the key lever.
6. **CAMT** (15% on AFSI ≥ $1B) binds only very large corporations and is irrelevant to most mid-market targets.
7. **No step-up = no incremental tax D&A**; a v1 model can ignore the book/tax deferred-tax divergence in a straight stock deal.

---

## Details

### Item 1 — Section 163(j) Business Interest Limitation

Lead-in: The interest limitation is the most deal-relevant tax provision in an LBO because leverage is the point; OBBBA's 2025 restoration of the EBITDA base is the single most important recent change and directly raises deductible interest for levered targets.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| Deduct business interest only up to the sum of (i) business interest income + (ii) 30% of ATI + (iii) floor-plan financing interest. For tax years beginning after Dec. 31, 2024, compute ATI on an **EBITDA basis** (add back depreciation, amortization, depletion) per OBBBA — permanent. Accumulate disallowed interest in an indefinite **carryforward account** (beginning balance + current-year disallowed additions − utilization = ending balance); release/utilize the carryforward in later years as the deal delevers and interest falls below the cap. | (a) Small-business exception: if average annual gross receipts (2022–2024) are below **$31 million** for tax years beginning in 2025 (up from $30M for 2024; inflation-indexed under §448(c), Rev. Proc. 2024-40, per IRS Fact Sheet 2025-09), skip the limitation entirely — common for smaller targets. (b) Many v1 models omit the limitation because a healthy delevering target with EBITDA-based ATI rarely breaches 30% except in years 1–2 of aggressive structures. (c) Model the carryforward as a tax attribute analogous to an NOL (the "snowball" that builds while capped, then absorbs when leverage falls). (d) BIWS notes a simple LBO "does not require a separate schedule in simple cases." | IRC §163(j); Treas. Reg. §§1.163(j)-1 through -11 (final regs, T.D. 9905, eff. Nov. 13, 2020; T.D. 9943, eff. Jan. 13, 2021); §163(j)(8) (ATI definition); §1.163(j)-5 (C-corp carryforwards); OBBBA (P.L. 119-21, signed July 4, 2025) restoring EBITDA add-back for TY beginning after 12/31/2024; IRS Fact Sheet 2025-09; Grant Thornton, RSM, KPMG, Clark Nuber OBBBA alerts; Wall Street Prep; Macabacus; BIWS; CFI. |

**OBBBA flags:** (1) EBITDA-based ATI restored permanently, effective TY beginning after 12/31/2024. (2) For TY beginning after 12/31/2025, business interest subject to §163(j) now includes electively capitalized interest (except §263(g)/§263A(f)), eliminating the interest-capitalization planning workaround; and CFC income inclusions (§§951(a), 951A, 78) are excluded from ATI. (3) The carryforward remains indefinite; disallowed interest carried forward is no longer subject to any interest-capitalization provision.

### Item 2 — Section 382 NOL Limitation After an Ownership Change

Lead-in: An LBO that acquires ≥50% of a loss corporation's stock triggers a §382 ownership change, capping annual use of the target's pre-change NOLs (and other pre-change attributes, including §163(j) carryforwards).

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| Annual §382 limitation = equity value of the loss corporation immediately before the ownership change × the long-term tax-exempt rate (LTTER) published monthly by the IRS. For a December 2025 ownership change, LTTER = **3.58%** (Rev. Rul. 2025-24, IRB 2025-50, Table 3). Unused limitation carries forward and increases the next year's limit. Order of operations in the model: apply §163(j) interest limitation first, then §382-limited NOL usage, then the 80% taxable-income cap on NOLs, then compute cash taxes. | (a) Many models assume acquired NOLs are fully limited or unavailable (especially where a 338(h)(10)/asset structure is used — see Item 3), zeroing them out for conservatism. (b) Add NUBIG uplift (recognized built-in gains over the 5-year recognition period) — usually omitted in v1. (c) Reduce the equity value for redemptions/corporate contractions and substantial nonbusiness assets — usually omitted. (d) Apply the continuity-of-business-enterprise (COBE) rule: if the historic business isn't continued for 2 years, the limit drops to zero — usually assumed satisfied. | IRC §382; §382(f) (LTTER); §383 (credits/other attributes); Treas. Reg. §1.382-12 (LTTER methodology, finalized Apr. 25, 2016); Treas. Reg. §1.383-1(d) (ordering); monthly AFR revenue rulings (Rev. Rul. 2025-24 for Dec. 2025, Table 3); IRS Notice 2003-65 (NUBIG/NUBIL safe harbors); RSM, Moss Adams, CohnReznick, GHJ primers; Wall Street Prep; Macabacus. |

**OBBBA flag:** §382/§383 were **not changed** by OBBBA. (Note: Treasury withdrew unpopular proposed §382(h) built-in-gain/loss regulations in mid-2025, but the core limitation formula is unchanged.)

### Item 3 — NOLs Generally and Whether Acquired NOLs Survive

Lead-in: The critical modeling judgment is not the NOL mechanics but whether the target's NOLs survive the deal structure at all — in the majority of sponsor structures they are trapped at the seller or heavily limited.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| Post-2017 NOLs: no carryback, **indefinite carryforward**, usable against only **80% of taxable income** (computed before the NOL deduction). Pre-2018 NOLs: grandfathered — 20-year carryforward, no 80% cap, offset 100% of income, and applied first. In a **stock purchase** the target's tax attributes (including NOLs) carry over but are subject to §382. In an **asset purchase**, or a stock purchase with a **§338(h)(10) or §336(e) election** (deemed asset sale), the target's NOLs generally do **NOT** carry over to the buyer — they stay with / are used by the seller. Practical convention: in the majority of sponsor structures the modeler should often assume acquired NOLs are unavailable or heavily limited. | (a) Track two NOL layers (pre-2018 vs. post-2017) separately when both exist; pre-2018 losses apply first with no percentage limit, then the 80% cap applies to post-2017 losses against remaining income. (b) v1 models frequently set acquired NOLs to zero for conservatism and model only post-close NOLs (which are unrestricted by §382). (c) When NOLs are large and a stock deal is used, model the §382-limited stream explicitly and weigh against the step-up benefit foregone. | IRC §172 (80% cap, indefinite carryforward, no carryback for post-2017 losses); §172(b); IRC §382; IRC §338(h)(10); IRC §336(e); Treas. Reg. §1.338(h)(10)-1; Macabacus ("Tango's NOLs do not carry over to Alpha, since they are used by Sierra"); Bloomberg Tax; KPMG; Wall Street Prep. |

**OBBBA flag:** §172 NOL rules (80% cap, indefinite carryforward, no carryback) were **not changed** by OBBBA.

### Item 4 — OID and Financing Fees (including AHYDO)

Lead-in: Financing fees and OID are deductible but must be spread over the life of the facility for tax; the AHYDO rules are the trap that can permanently kill part of a high-yield PIK/OID interest deduction.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| Capitalize financing fees and OID and **amortize over the life of each facility** for both book (post-ASU 2015-03, as a contra-liability) and tax. Amortization runs through/near the interest line (below EBIT), is non-cash (added back on the CFS), and is tax-deductible as amortized. On repayment/refinancing, expense remaining unamortized fees/OID. Treat OID identically to financing fees in the model. **Ignore AHYDO in v1** if disclosed — defensible because AHYDO bites only high-yield PIK/OID instruments (>5-yr maturity, YTM ≥ AFR + 5 pts, significant OID) and most modeled tranches include a contractual "AHYDO catch-up payment" that cures the problem by the 5th-anniversary accrual period. | (a) For deals with material PIK/PIK-toggle or second-lien notes, model the AHYDO catch-up cash payment after year 5 and/or the permanent disallowance of the "disqualified portion" (the portion of total return in the ratio of the disqualified yield — YTM over AFR+6 pts — to YTM, treated as a non-deductible dividend equivalent) plus deferral of the remaining OID until actually paid. (b) Some models straight-line OID; strictly, tax requires the constant-yield method. (c) Bullet vs. ratable OID amortization per the term sheet. | IRC §163(e)(5) (AHYDO disallowance/deferral); IRC §163(i) (AHYDO definition: >5-yr maturity, YTM ≥ AFR+5, significant OID); Treas. Reg. §1.163-7; Treas. Reg. §§1.1272-1, 1.1273-1, 1.1275-2 (OID/constant yield); Rev. Proc. 2008-51 (AHYDO safe harbors); Troutman "PIK Toggles Are Back"; The Tax Adviser; Robert Willens; Wall Street Prep; Macabacus. |

**OBBBA flag:** AHYDO rules (§163(e)(5), §163(i)) were **not changed** by OBBBA. Note the interaction: §163(j) is applied to interest that is otherwise deductible; AHYDO can render part of the OID permanently non-deductible before §163(j) even applies.

### Item 5 — Transaction Costs

Lead-in: Deal costs bifurcate into currently deductible vs. capitalized under the INDOPCO regulations; most LBO models collapse this into a single lump-sum treatment at close.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| Under Treas. Reg. §1.263(a)-5, capitalize amounts that "facilitate" a covered transaction; costs incurred **before the "bright-line date"** (generally the earlier of the letter of intent or board approval/execution of the definitive agreement) that are not "inherently facilitative" may be deducted. **Inherently facilitative** costs (appraisals, structuring, document prep, regulatory/shareholder approval, property conveyance) are always capitalized regardless of timing. For **success-based fees**, elect the **70/30 safe harbor** (Rev. Proc. 2011-29): deduct 70%, capitalize 30%. **Financing costs are amortized** (not immediately deducted) — modeled separately (see Item 4). Standard model simplification: expense (or capitalize) transaction/advisory fees as a lump sum at close, often ignoring the deductible/capitalized split, and treat financing fees separately as amortizable. | (a) v1 models commonly expense all advisory/legal/accounting fees immediately (matching the common "70% deductible" heuristic) and keep only financing fees on the balance sheet. (b) Alternatively capitalize 100% into stock basis (conservative; defers benefit). (c) In a stock deal (no step-up), capitalized facilitative costs are added to the buyer's stock basis and provide no current tax D&A benefit. | Treas. Reg. §1.263(a)-5; INDOPCO, Inc. v. Commissioner, 503 U.S. 79 (1992); Rev. Proc. 2011-29 (70/30 success-fee safe harbor); IRC §162; IRC §195 (start-up); Rev. Rul. 99-23 (predecessor "whether/which" test); BDO, KPMG, The Tax Adviser, Thomson Reuters; Wall Street Oasis. |

**OBBBA flag:** No OBBBA change to the transaction-cost capitalization regime.

### Item 6 — Corporate Alternative Minimum Tax (CAMT)

Lead-in: CAMT is a 15% minimum tax on book income that binds only the largest corporations and is irrelevant to most mid-market LBO targets, so a generic model exposes only a simple floor rather than full mechanics.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| 15% minimum tax on **Adjusted Financial Statement Income (AFSI)** for "applicable corporations" — those with average annual AFSI > **$1 billion** over a rolling three-year period (IRS: "The CAMT generally applies to large corporations with average annual financial statement income exceeding $1 billion"). Effective for tax years beginning after Dec. 31, 2022 (IRA 2022). Because of the $1B threshold, CAMT is **irrelevant to most mid-market LBO targets**; a generic model does not build full CAMT mechanics. Convention: expose a single **"minimum tax rate" input as a floor** — pay the higher of regular tax and (floor rate × a chosen base). CAMT proper allows a Financial Statement NOL (capped at 80% of AFSI) and is computed on AFSI; but a simplified model floor is typically applied to book or taxable income. Modeling convention (e.g., Macabacus's parallel AMT calc) tests the trigger against **pre-NOL taxable income** and pays the greater of the two taxes. | (a) Omit entirely for sub-$1B targets (most common, fully defensible). (b) Expose a floor rate (Macabacus uses a pedagogical 20% rate / 90% offset construction for the old AMT; a CAMT-flavored floor would use 15% on a book-income proxy). (c) For genuinely large-cap targets, build AFSI adjustments and the FSNOL — rare in generic templates. Note IRS Notice 2025-27 offers an optional interim simplified applicable-corporation test lowering the scoping threshold to $800M ($80M for foreign-parented groups). | IRC §55 (imposition); §56A (AFSI); §59(k) (applicable corporation); IRA 2022 (P.L. 117-169); IRS Notice 2023-07; Form 4626 and instructions; Notices 2025-27/-28/-46/-49 (interim guidance, simplified thresholds); Deloitte, KPMG, Sullivan & Cromwell, CRS R47328; Macabacus (AMT page). |

**OBBBA flags:** CAMT itself was retained. OBBBA made a targeted §56A change (treatment of intangible drilling costs for CAMT) and, more importantly, its taxable-income-reducing provisions (EBITDA §163(j), 100% bonus depreciation, R&E expensing) can **increase** CAMT exposure for large corporations by widening the book-tax gap — a second-order effect flagged by KPMG, Deloitte, and Brookings but immaterial to sub-$1B targets.

### Item 7 — Purchase Accounting in a Stock Deal Without a Step-Up

Lead-in: In a straight stock purchase with no election, the buyer inherits the target's carryover tax basis, so there is no new tax D&A — the book write-up under ASC 805 creates a deferred tax liability and a book/tax divergence a v1 model can legitimately ignore.

| Convention | Alternatives / Simplifications | Citations |
|---|---|---|
| In a stock purchase with **no §338(h)(10)/§336(e) election**, the buyer takes **carryover tax basis** in the target's assets → **no incremental tax depreciation/amortization** and no tax-deductible goodwill. Contrast: an asset deal or 338(h)(10)/336(e) election creates stepped-up basis with new tax D&A and **15-year amortization of goodwill under §197**. For book (ASC 805), assets are written up to fair value, creating book goodwill and identifiable intangibles, a **deferred tax liability**, and book-vs-tax D&A differences. Convention: for a no-step-up stock deal, a simplified v1 model can **ignore** the book/tax D&A divergence and the associated deferred taxes, running one D&A stream (carryover tax basis) for cash taxes. | (a) Full purchase accounting: set up the DTL on written-up intangibles/PP&E and unwind it (a non-cash add-back that reconciles book to cash taxes) — the "rigorous" build. (b) Note: no DTL is recorded for the excess of book goodwill over (zero) tax goodwill in a nontaxable stock deal (ASC 805-740-25-9 — the "component-2" goodwill rule). (c) For a step-up structure, model the new §197/168(k) D&A and its cash-tax shield explicitly (the primary reason to elect). | IRC §338 (incl. §338(h)(10)); IRC §336(e); IRC §197 (15-yr intangibles/goodwill amortization); IRC §168(k) (100% bonus depreciation); ASC 805; ASC 805-740-25-8/-9 (component-1/-2 goodwill, DTL); Macabacus (§338 guide), The Tax Adviser, Bloomberg Tax, PwC/Deloitte ASC 740 guides; Wall Street Prep. |

**OBBBA flag:** OBBBA made 100% bonus depreciation (§168(k)) permanent for qualifying property **acquired and placed in service after Jan. 19, 2025** (Grant Thornton; IRS interim guidance adopts the Treas. Reg. §1.168(k)-2 framework, with property acquired on or before Jan. 19, 2025 remaining under the TCJA phase-down — 40% in 2025). This supercharges the step-up benefit in an asset/338(h)(10) deal (more first-year tax D&A) but has no effect on a no-step-up stock deal (no new basis to depreciate).

---

## Recommendations

**Stage 1 — Build the v1 tax module (defensible simplifications, all disclosed):**
1. Compute ATI on an **EBITDA basis** (OBBBA, post-2024) and apply the §163(j) 30% cap FIRST; maintain a disallowed-interest carryforward account only if the structure breaches the cap in early years (otherwise omit and note it).
2. Assume acquired NOLs are **zero/unavailable** unless diligence confirms a stock deal with surviving, §382-usable NOLs; model only post-close NOLs (unrestricted).
3. Treat financing fees + OID as one amortizable pool over each facility's life; **ignore AHYDO** with a disclosed note.
4. Lump transaction/advisory fees at close (expense or capitalize); keep financing fees separate.
5. **Omit CAMT** for any target with AFSI < $1B; expose an optional minimum-tax floor input only.
6. In a no-step-up stock deal, run a single carryover-basis D&A stream and ignore deferred-tax book/tax divergence.

**Stage 2 — Add rigor when thresholds are crossed:**
- Build the explicit §163(j) carryforward schedule (begin + additions − utilization = end) if leverage/EBITDA implies multi-year breaches.
- Build the §382 limitation (equity value × current LTTER, currently 3.58% for Dec. 2025) and the two-layer (pre-2018/post-2017) NOL waterfall if acquired NOLs are material and survive.
- Model AHYDO catch-up payments/permanent disallowance if the structure includes material PIK, PIK-toggle, or deeply discounted high-yield notes (>5-yr, YTM ≥ AFR+5).
- Split transaction costs (70/30 safe harbor; bright-line date) if the tax benefit is material to returns.
- Build full CAMT (AFSI + FSNOL) only for genuinely large-cap targets, and stress the OBBBA book-tax-gap interaction.
- Build the full DTL unwind and §197/168(k) D&A stream whenever a step-up structure (asset/338(h)(10)/336(e)) is on the table.

**Benchmarks that change the approach:** target average annual AFSI approaching **$1B** (→ build CAMT); modeled interest expense exceeding **30% of EBITDA-based ATI** in ≥2 years (→ build the carryforward schedule); presence of a **§338(h)(10)/336(e)/asset** structure (→ build step-up D&A and DTL, drop acquired NOLs); material **PIK/high-yield** tranches (→ model AHYDO).

## Caveats
- **Law-timing:** Much online modeling commentary (2022–2024) still describes the EBIT-based §163(j) ATI; that is superseded for tax years beginning after Dec. 31, 2024. Confirm the target's fiscal-year convention, as OBBBA's several §163(j) sub-changes have staggered effective dates (some after 12/31/2024, others after 12/31/2025).
- **Modeling references are pedagogical:** Macabacus's AMT page uses a simplified 20%/90%-offset construction that predates and does not literally equal the current 15% CAMT; treat it as a template for the mechanic, not a citation of current rates. Many free primer pages also still cite the old 20-year NOL carryforward.
- **Sourcing thinness:** No free modeling primer publishes an explicit §163(j) carryforward schedule; the accumulate-then-release mechanic is best sourced by analogy to the published NOL carryforward schedule (the disallowed-interest carryforward is "a tax attribute similar to a NOL," per Baker Tilly, and is itself subject to §382 following an ownership change).
- **State conformity and international items** (SALT §163(j) decoupling, BEAT/GILTI/§59A interactions) are out of scope here but can materially change effective cash taxes for multi-state or multinational targets.
- **This is a modeling specification, not tax advice;** structure-specific outcomes (especially NOL survival, AHYDO, and step-up decisions) require deal-specific tax counsel.