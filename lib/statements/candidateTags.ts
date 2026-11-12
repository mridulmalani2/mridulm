/**
 * lib/statements/candidateTags.ts — the COMMITTED list of XBRL tags that usually mark an item an
 * analyst considers when normalising EBITDA or net debt (plan §3.2).
 *
 * A match becomes a PROPOSAL on the Clean screen. It is never applied, never pre-ticked, and its
 * category never changes any arithmetic. Every row states why the tag is here. XBRL cannot say
 * WHERE on the income statement a tagged amount sits, so a tag that is often reported below
 * operating income carries a caveat the analyst must clear before the row counts.
 *
 * us-gaap only. ifrs-full has no reliable one-to-one concepts for most of these, so IFRS filers
 * get no detected proposals rather than guessed ones; the analyst adds rows by hand.
 */

export interface EbitdaCandidateTag {
  tag: string;
  label: string;
  category: 'restructuring' | 'impairment' | 'sbc' | 'transaction_costs' | 'litigation' | 'non_recurring';
  /** +1: the tag is a COST (add it back). −1: the tag is a GAIN when positive (deduct it). */
  sign: 1 | -1;
  rationale: string;
  caveat: string | null;
}

const BELOW_OPINC =
  'This item is often reported below operating income. Adding it back is only right if it sits inside operating income in this filing: check the income statement.';

export const EBITDA_CANDIDATE_TAGS: EbitdaCandidateTag[] = [
  { tag: 'RestructuringCharges', label: 'Restructuring charges', category: 'restructuring', sign: 1,
    rationale: 'Costs of a restructuring programme; usually treated as non-recurring.', caveat: null },
  { tag: 'RestructuringCostsAndAssetImpairmentCharges', label: 'Restructuring and asset impairment charges', category: 'restructuring', sign: 1,
    rationale: 'Combined restructuring and impairment line; usually non-recurring. Do not also add the separate restructuring or impairment tags: that would count the same cost twice.',
    caveat: 'This combined line overlaps the separate restructuring and impairment tags. Use one or the other, not both.' },
  { tag: 'AssetImpairmentCharges', label: 'Asset impairment charges', category: 'impairment', sign: 1,
    rationale: 'Non-cash write-down of assets.', caveat: null },
  { tag: 'GoodwillImpairmentLoss', label: 'Goodwill impairment', category: 'impairment', sign: 1,
    rationale: 'Non-cash write-down of goodwill.', caveat: null },
  { tag: 'ImpairmentOfIntangibleAssetsExcludingGoodwill', label: 'Impairment of intangible assets', category: 'impairment', sign: 1,
    rationale: 'Non-cash write-down of intangibles.', caveat: null },
  { tag: 'ShareBasedCompensation', label: 'Share-based compensation', category: 'sbc', sign: 1,
    rationale: 'Non-cash today, but a real cost of employing people. Whether to add it back is a judgement: many lenders do, many buyers do not.',
    caveat: null },
  { tag: 'BusinessCombinationAcquisitionRelatedCosts', label: 'Acquisition-related costs', category: 'transaction_costs', sign: 1,
    rationale: 'Deal fees and integration costs from the company’s own acquisitions.', caveat: null },
  { tag: 'LitigationSettlementExpense', label: 'Litigation settlement', category: 'litigation', sign: 1,
    rationale: 'A settlement is usually a one-off.', caveat: BELOW_OPINC },
  { tag: 'InventoryWriteDown', label: 'Inventory write-down', category: 'non_recurring', sign: 1,
    rationale: 'Non-cash; recurring small write-downs are an operating cost, a large one is usually one-off.', caveat: null },
  { tag: 'GainLossOnDispositionOfAssets1', label: 'Gain or loss on disposal of assets', category: 'non_recurring', sign: -1,
    rationale: 'A disposal gain is not operating earnings; a loss is not an operating cost.', caveat: BELOW_OPINC },
  { tag: 'GainLossOnSaleOfBusiness', label: 'Gain or loss on sale of a business', category: 'non_recurring', sign: -1,
    rationale: 'A one-off from selling a business.', caveat: BELOW_OPINC },
];

export interface NetDebtCandidateTag {
  tag: string;
  label: string;
  side: 'debt_like' | 'cash_like';
  category: 'pension' | 'earn_out' | 'nci' | 'preferred' | 'restricted_cash';
  /** For cash-like rows: −1 means the item REDUCES usable cash (restricted or trapped). */
  sign: 1 | -1;
  rationale: string;
  caveat: string | null;
}

export const NET_DEBT_CANDIDATE_TAGS: NetDebtCandidateTag[] = [
  { tag: 'PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent', label: 'Pension and post-retirement liabilities', side: 'debt_like', category: 'pension', sign: 1,
    rationale: 'An unfunded pension obligation is a claim a buyer takes on.', caveat: 'This is the pre-tax balance-sheet liability. Many buyers count it net of the tax deduction on future contributions.' },
  { tag: 'DefinedBenefitPensionPlanLiabilitiesNoncurrent', label: 'Defined-benefit pension liabilities', side: 'debt_like', category: 'pension', sign: 1,
    rationale: 'An unfunded pension obligation is a claim a buyer takes on.', caveat: 'This is the pre-tax balance-sheet liability. Many buyers count it net of the tax deduction on future contributions.' },
  { tag: 'BusinessCombinationContingentConsiderationLiability', label: 'Contingent consideration (earn-outs)', side: 'debt_like', category: 'earn_out', sign: 1,
    rationale: 'Deferred purchase price owed on past acquisitions.', caveat: null },
  { tag: 'MinorityInterest', label: 'Non-controlling interests', side: 'debt_like', category: 'nci', sign: 1,
    rationale: 'EBITDA is consolidated at 100%, so the minority’s share of value is a claim ahead of the equity being bought.',
    caveat: 'This is book value. The claim is usually valued at market, which can be very different.' },
  { tag: 'PreferredStockValue', label: 'Preferred stock', side: 'debt_like', category: 'preferred', sign: 1,
    rationale: 'Preferred ranks ahead of the common equity being bought.', caveat: null },
  { tag: 'RestrictedCashAndCashEquivalents', label: 'Restricted cash', side: 'cash_like', category: 'restricted_cash', sign: -1,
    rationale: 'Cash the company cannot use freely is not available to repay debt.',
    caveat: 'Only deduct this if the cash figure above includes restricted cash. Check which cash line the filing tags.' },
  { tag: 'RestrictedCash', label: 'Restricted cash', side: 'cash_like', category: 'restricted_cash', sign: -1,
    rationale: 'Cash the company cannot use freely is not available to repay debt.',
    caveat: 'Only deduct this if the cash figure above includes restricted cash. Check which cash line the filing tags.' },
];
