/**
 * lib/assistant/guidance.ts — the field notes: what each input is, how an analyst usually sets it
 * and what to watch. One indexed list, read by the assistant panel (shown beside a proposal or
 * the field in focus) and by the question answering (the notes that match a question travel with
 * it, so the answer is drawn from here and not from a model's memory).
 *
 * RULE: a note never states a figure. A number on screen comes from the filing or from a cited
 * source in the suggestion catalogue, with its citation; where neither exists the note says where
 * the analyst finds the number, in words. This is what keeps an uncited "typical" value from
 * appearing as if it were sourced.
 */

export interface FieldNote {
  /** Matched against an input path. First match wins, so narrower patterns come first. */
  match: RegExp;
  /** Words a question about this input is likely to use. */
  keywords: string[];
  title: string;
  what: string;
  how: string;
  watch?: string;
}

export const FIELD_NOTES: FieldNote[] = [
  // ── transaction ──
  {
    match: /^entry\.hold_years$/, keywords: ['hold', 'holding', 'period', 'years', 'horizon', 'exit year'], title: 'Holding period',
    what: 'How many years the sponsor owns the company before selling. It sets the length of every yearly line in the model.',
    how: 'Underwrite on the fund’s usual horizon, then test a year either side on the Sensitivity view once the model is built.',
    watch: 'A longer hold lifts the money multiple and usually lowers the IRR, because the same gain takes longer to arrive.',
  },
  {
    match: /^entry\.(entry_multiple|enterprise_value|driver)$/, keywords: ['entry', 'price', 'purchase', 'multiple', 'enterprise value', 'ev', 'valuation', 'pay'], title: 'Entry price',
    what: 'What the sponsor pays for the business, entered as a multiple of EBITDA or as a purchase price. The other is derived.',
    how: 'Start from what comparable deals paid and from where the company trades if it is listed, then check that the price supports the debt you plan to raise.',
    watch: 'The multiple applies to the EBITDA shown on the Clean step. If you adjusted EBITDA there, the same multiple now gives a different price.',
  },
  {
    match: /^entry\.basis$/, keywords: ['basis', 'ltm', 'ntm', 'forward', 'trailing', 'historical'], title: 'Entry multiple basis',
    what: 'Which EBITDA the entry multiple is applied to: the historical year or the forecast for the first year.',
    how: 'Use the historical year unless the price was agreed on forecast EBITDA. Quoted multiples from filings and deal databases are historical.',
    watch: 'A forward multiple looks lower than a trailing one for a growing business. Compare like with like.',
  },
  {
    match: /^exit\.basis$/, keywords: ['exit basis', 'forward', 'trailing'], title: 'Exit multiple basis',
    what: 'Which EBITDA the exit multiple is applied to: the final year of the hold, or the forecast for the year after it.',
    how: 'Use the same basis as the entry multiple, so the two multiples can be compared like for like.',
    watch: 'A forward basis at exit needs a forecast for the year after the hold, which the sheet then asks for.',
  },
  {
    match: /^exit\.multiple$/, keywords: ['exit', 'multiple', 'sale', 'expansion', 'terminal'], title: 'Exit multiple',
    what: 'The multiple of EBITDA the business is sold at when the hold ends.',
    how: 'The conservative case is to exit at the entry multiple, so the return comes from growth and debt paydown alone.',
    watch: 'An exit multiple above entry has to be argued: a larger, better business, or a market that has re-rated. Test the downside on the Sensitivity view.',
  },
  {
    match: /^exit\.fees_pct$/, keywords: ['exit', 'fees', 'advisory', 'sale costs'], title: 'Exit fees',
    what: 'Advisory and sale costs paid out of the exit proceeds, as a share of exit enterprise value.',
    how: 'Take it from the fee letters or from what the fund paid on its last comparable sale. Enter zero if you model none.',
  },
  {
    match: /^rollover_equity$/, keywords: ['rollover', 'management', 'reinvest', 'sellers'], title: 'Rollover equity',
    what: 'Equity the sellers or management keep in the new structure and do not take as cash.',
    how: 'Take it from the term sheet. Enter zero if nobody rolls.',
    watch: 'Rollover lowers the sponsor’s cheque and shares the exit proceeds with the holders who rolled.',
  },
  {
    match: /^fees\.transaction_pct_of_ev$/, keywords: ['transaction', 'fees', 'advisory', 'buy-side', 'costs'], title: 'Transaction fees',
    what: 'Advisory, legal and diligence costs of buying the company, as a share of enterprise value. They are a use of funds at close.',
    how: 'Use the fee estimates from your advisers when you have them. The proposal here is a cited market figure.',
  },
  {
    match: /^fees\.financing_pct_of_commitments$/, keywords: ['financing', 'fees', 'arrangement', 'underwriting', 'commitments'], title: 'Financing fees',
    what: 'Fees paid to the lenders for arranging the debt, as a share of what they commit. They are paid at close and written off over the life of the debt.',
    how: 'Take it from the commitment papers. The proposal here is a cited market figure.',
  },
  {
    match: /^fees\.monitoring/, keywords: ['monitoring', 'management fee', 'sponsor fee'], title: 'Monitoring fee',
    what: 'An annual fee the company pays to the sponsor. It lowers EBITDA after fees and is income to the sponsor’s manager, not to the fund.',
    how: 'Leave it off unless the fund charges one. Take the amount from the management services agreement.',
  },

  // ── debt ──
  {
    match: /^structure\.tranches$/, keywords: ['debt', 'structure', 'tranche', 'financing', 'leverage', 'capital structure', 'all-equity'], title: 'Debt structure',
    what: 'The loans that fund the purchase beside the equity: each facility, its size, its price and how it is repaid.',
    how: 'Start from the lenders’ term sheet. Without one, the cited template gives a market structure for a company of this size, which you then edit line by line.',
    watch: 'More debt raises the return and the risk together. Read the Credit view after building: leverage, cover and the lowest cash in the hold.',
  },
  {
    match: /\.size\./, keywords: ['size', 'leverage', 'debt', 'amount', 'turns'], title: 'Facility size',
    what: 'How much is borrowed under this facility, as an amount or as a multiple of EBITDA.',
    how: 'Lenders size on EBITDA. Use the term sheet, or the cited market leverage for a company of this size.',
    watch: 'With several facilities, the cited total is for all of them together, not for each.',
  },
  {
    match: /\.pricing\.base_rate$/, keywords: ['base rate', 'sofr', 'euribor', 'sonia', 'reference rate', 'interest'], title: 'Base rate',
    what: 'The market reference rate a floating loan is priced over. Interest is the base rate (or the floor, if higher) plus the spread.',
    how: 'Use today’s published rate for the loan’s currency and tenor, or your house forward curve. The proposal is a dated figure: check it before relying on it.',
    watch: 'This is one of the inputs that moves most with time. The date beside the proposal matters.',
  },
  {
    match: /\.pricing\.spread$/, keywords: ['spread', 'margin', 'pricing', 'bps', 'interest'], title: 'Spread',
    what: 'What the lender charges above the base rate.',
    how: 'Take it from the term sheet. The proposal is the cited market spread for this kind of facility.',
  },
  {
    match: /\.pricing\.floor$/, keywords: ['floor', 'base rate'], title: 'Base rate floor',
    what: 'The lowest base rate the lender will accept. Interest is charged on the floor when the market rate is below it.',
    how: 'Take it from the term sheet. It only bites when market rates fall under it.',
  },
  {
    match: /\.pricing\.(rate|fixed_rate)$/, keywords: ['coupon', 'fixed', 'rate', 'interest'], title: 'Fixed rate',
    what: 'The coupon on a fixed-rate facility.',
    how: 'Take it from the term sheet or from where comparable notes priced.',
  },
  {
    match: /\.maturity_years$/, keywords: ['maturity', 'tenor', 'term', 'repay', 'due'], title: 'Maturity',
    what: 'How many years after close the facility falls due.',
    how: 'Take it from the term sheet. No cited market value is held for it, so the field is yours to enter.',
    watch: 'A facility that falls due inside the holding period must be repaid or refinanced in that year. The model shows whether the cash is there.',
  },
  {
    match: /\.amort_pct_of_face$/, keywords: ['amortization', 'amortisation', 'repayment', 'scheduled'], title: 'Scheduled amortization',
    what: 'The share of the original loan repaid each year by contract, before any cash sweep.',
    how: 'Take it from the term sheet. The proposal is the cited market convention for this kind of facility.',
  },
  {
    match: /\.oid_pct$/, keywords: ['oid', 'discount', 'original issue'], title: 'Original issue discount',
    what: 'The discount to face value at which the loan is issued. The company receives less than it owes, and the difference is a financing cost.',
    how: 'Take it from the term sheet. The proposal is the cited market figure.',
  },
  {
    match: /\.(cash_coupon|pik_coupon)$/, keywords: ['pik', 'coupon', 'mezzanine', 'payment in kind'], title: 'Coupon',
    what: 'Interest on a mezzanine or PIK note. The cash coupon is paid each year; the PIK coupon is added to the balance and paid at exit.',
    how: 'Take both from the term sheet. The proposals are cited market figures.',
    watch: 'PIK interest compounds. Check the balance at exit on the Debt schedule.',
  },
  {
    match: /\.sweep\.(participates|priority)$/, keywords: ['sweep', 'priority', 'prepay', 'order'], title: 'Sweep order',
    what: 'Whether spare cash prepays this facility, and in what order when several take the sweep.',
    how: 'Senior debt is normally prepaid first. Follow the credit agreement.',
  },
  {
    match: /\.commitment_fee|\.commitment$|undrawn/, keywords: ['revolver', 'commitment', 'undrawn', 'facility'], title: 'Revolver',
    what: 'A facility the company can draw and repay as it needs. It is undrawn at close in this model, and a fee is paid on the part not drawn.',
    how: 'Take the commitment and the fee from the term sheet.',
  },
  {
    match: /^structure\.sweep/, keywords: ['sweep', 'excess cash', 'prepayment', 'cash flow sweep'], title: 'Cash sweep',
    what: 'The share of spare cash each year that must prepay debt.',
    how: 'Take it from the credit agreement. The proposal is the cited market level; many agreements step it down as leverage falls.',
    watch: 'A higher sweep pays debt down faster and leaves less cash in the business.',
  },
  {
    match: /^structure\.min_cash$/, keywords: ['minimum cash', 'cash balance', 'liquidity', 'operating cash'], title: 'Minimum cash',
    what: 'The cash the business keeps to run day to day. It is funded at close, and the sweep never takes cash below it.',
    how: 'Ask management, or look at the lowest month-end balance over the last year in the dataroom. No cited market value is held for it, so the field is yours to enter.',
    watch: 'Set too low, the model shows the company running on cash it could not really use.',
  },

  // ── operating ──
  {
    match: /^operations\.growth(\.|$)/, keywords: ['growth', 'revenue', 'sales', 'top line', 'cagr'], title: 'Revenue growth',
    what: 'The yearly growth in revenue over the hold.',
    how: 'Start from the growth the company has actually delivered, then move each year for what you know: contracts, pricing, market growth, capacity.',
    watch: 'Growth held flat at the historical rate is a base to argue from, not a forecast. Growth needs working capital and often capex.',
  },
  {
    match: /^operations\.(target_margin|margin_path)$/, keywords: ['margin', 'ebitda margin', 'profitability', 'expansion'], title: 'EBITDA margin',
    what: 'The EBITDA margin the business reaches by the end of the hold, and how quickly it gets there.',
    how: 'Hold the current margin unless you can name what changes it: pricing, mix, a cost programme with an owner and a date.',
    watch: 'Margin expansion is the easiest assumption to write and the hardest to deliver. An investment committee will ask for the bridge.',
  },
  {
    match: /^operations\.da_pct_revenue$/, keywords: ['depreciation', 'amortization', 'd&a', 'da'], title: 'Depreciation and amortization',
    what: 'Depreciation and amortization as a share of revenue. It lowers taxable profit and does not use cash.',
    how: 'The filing’s latest ratio is the usual start. Over a long hold it should move towards capex.',
  },
  {
    match: /^operations\.(maint_capex_pct_revenue|growth_capex)/, keywords: ['capex', 'capital expenditure', 'investment', 'maintenance'], title: 'Capital expenditure',
    what: 'Maintenance capex keeps the asset base running and is entered as a share of revenue. Growth capex is extra spend, entered year by year.',
    how: 'The filing reports total capex, so its ratio includes any growth spend. Split it if management gives you the split; enter zero growth capex if you model none.',
    watch: 'Capex well below depreciation for years on end means the business is being run down.',
  },
  {
    match: /^operations\.nwc/, keywords: ['working capital', 'nwc', 'receivables', 'inventory', 'payables', 'dso', 'dio', 'dpo', 'days'], title: 'Working capital',
    what: 'Cash tied up in receivables and inventory, less what suppliers fund. It grows with the business, and the growth uses cash.',
    how: 'Model it in days when the filing gives receivables, inventory and payables; otherwise as a share of revenue. The filing’s latest figures are the usual start.',
    watch: 'Year-end balances can flatter a seasonal business. Check against the average if you have monthly figures.',
  },
  {
    match: /^operations\.lines/, keywords: ['forecast', 'line', 'enter directly', 'by year', 'management case'], title: 'Entering a line directly',
    what: 'A forecast line typed year by year, used when you have a management case or when the source lacks the history a driver would need.',
    how: 'Paste the row from your spreadsheet: a copied row fills across the years.',
  },

  // ── tax ──
  {
    match: /^tax\.rate$/, keywords: ['tax', 'tax rate', 'effective', 'statutory'], title: 'Tax rate',
    what: 'The rate applied to taxable profit after interest.',
    how: 'The filing’s effective rate reflects where the company actually earns its profit. The statutory rate is the alternative when the effective rate is distorted by one-offs.',
    watch: 'An unusually low or high effective rate in one year is often a one-off. Look across the history table.',
  },
  {
    match: /^tax\.(interest_deductible|s163j)/, keywords: ['interest', 'deductible', 'deduction', '163(j)', 'cap', 'limitation', 'tax shield'], title: 'Interest deduction',
    what: 'Whether interest lowers taxable profit, and whether a cap limits how much can be deducted in a year.',
    how: 'Interest is normally deductible. For a US taxpayer the statutory cap applies; elsewhere, check the local earnings-stripping rule and enter its terms.',
    watch: 'In a highly levered deal the cap can bind in the early years, which raises cash tax just when cash is tightest.',
  },
  {
    match: /^tax\.nol/, keywords: ['nol', 'losses', 'carryforward', 'tax losses'], title: 'Tax losses',
    what: 'Losses the company carries forward that could shelter future profit.',
    how: 'The filing gives a floor for the balance. Whether a buyer can use them depends on the deal structure and the change-of-ownership rules: ask tax counsel.',
    watch: 'Assume they are not usable unless you have advice that they are.',
  },
  {
    match: /^tax\.minimum_rate$/, keywords: ['minimum tax', 'floor', 'pillar two'], title: 'Minimum tax',
    what: 'A floor on the tax paid, as a share of pre-tax profit, whatever the deductions.',
    how: 'Enter zero unless a minimum-tax regime applies to the group.',
  },

  // ── optional sections ──
  {
    match: /^covenants/, keywords: ['covenant', 'leverage test', 'dscr', 'fccr', 'headroom', 'springing', 'maintenance'], title: 'Covenants',
    what: 'Tests the lenders set on leverage and cover. The model reports the headroom to each test in every year.',
    how: 'Take the levels from the credit agreement. No cited market level is held for them; leave a test blank if the facility has none.',
    watch: 'Headroom is the figure to read, not the ratio. Thin headroom in a base case is a breach in a downside.',
  },
  {
    match: /^(mip|sweet_equity|warrant)/, keywords: ['management', 'promote', 'incentive', 'mip', 'sweet equity', 'ratchet', 'warrant', 'hurdle'], title: 'Management incentives',
    what: 'The share of the gain that goes to management or to a warrant holder once the sponsor has cleared a hurdle.',
    how: 'Take the terms from the management term sheet. The proposals are cited market terms.',
    watch: 'The sponsor’s net return is after this. The Returns view shows the return before and after.',
  },
  {
    match: /^structure\.(distributions|surplus_distribution)/, keywords: ['dividend', 'distribution', 'recap', 'surplus cash', 'payout'], title: 'Distributions',
    what: 'Cash paid to shareholders during the hold, as requested amounts or as a share of surplus cash.',
    how: 'Leave it off for a base case. Add it to test a dividend recapitalisation.',
    watch: 'A distribution is only paid if the covenants and the minimum cash allow it. The model shows what was actually paid.',
  },
  {
    match: /^structure\.(refinancing|selldown)|\.elections/, keywords: ['refinancing', 'refinance', 'partial exit', 'sell-down', 'pik toggle'], title: 'Refinancing and partial exits',
    what: 'Events during the hold: replacing a facility, electing to pay interest in kind, or selling part of the stake early.',
    how: 'Leave these off for a first base case and add one at a time, so the effect of each on the return is visible in Build history.',
  },
  {
    match: /^valuation/, keywords: ['valuation', 'dcf', 'cost of equity', 'beta', 'risk-free', 'terminal', 'npv', 'flow to equity'], title: 'Valuation',
    what: 'A flow-to-equity valuation beside the LBO return: what the equity is worth at a required return, not only what it returns.',
    how: 'The market inputs (risk-free rate, equity risk premium, beta) come from your own market data source and its date. No cited value is held for them here.',
    watch: 'The terminal year drives most of the value. Capex equal to depreciation in the terminal year is the steady-state convention.',
  },
  {
    match: /^fund/, keywords: ['fund', 'lp', 'gp', 'carry', 'management fee', 'net return', 'waterfall'], title: 'Fund overlay',
    what: 'The fund’s own terms on top of the deal: management fee, carry and the hurdle, to show what investors in the fund receive.',
    how: 'Take the terms from the fund’s partnership agreement.',
  },
];

/** The note for an input path, or null when none is held. */
export function noteFor(path: string): FieldNote | null {
  return FIELD_NOTES.find((n) => n.match.test(path)) ?? null;
}

// ── the Clean step ───────────────────────────────────────────────────────────────────────────

/** How a kind of adjustment is usually treated. Keyed by the ledger's categories. */
export const CLEAN_NOTES: Record<string, { keywords: string[]; title: string; text: string }> = {
  impairment: {
    keywords: ['impairment', 'write-down', 'goodwill', 'non-cash'], title: 'Impairments',
    text: 'A write-down of an asset’s book value. It uses no cash and says nothing about next year’s earnings, so it is normally added back. It only moves EBITDA if the filing charges it above operating income.',
  },
  sbc: {
    keywords: ['share-based', 'stock compensation', 'sbc', 'equity pay'], title: 'Share-based pay',
    text: 'Non-cash today, but a real cost of employing people. Under private ownership the awards usually become cash pay, so mark it as a cost that continues: it can be added back for the price basis without flattering the forecast margin.',
  },
  restructuring: {
    keywords: ['restructuring', 'severance', 'reorganisation'], title: 'Restructuring',
    text: 'Added back when it is a programme with an end. A company that restructures every year has an operating cost, whatever the label says.',
  },
  non_recurring: {
    keywords: ['one-off', 'non-recurring', 'exceptional', 'unusual'], title: 'One-off items',
    text: 'Add back only what would not happen again under your ownership. Size and repetition are the tests: a small charge every year is a cost of doing business.',
  },
  litigation: {
    keywords: ['litigation', 'legal', 'settlement'], title: 'Litigation',
    text: 'A settlement is added back when the matter is closed. Ongoing legal cost in a business that is regularly sued is an operating cost.',
  },
  transaction_costs: {
    keywords: ['transaction costs', 'deal costs', 'm&a costs'], title: 'Transaction costs',
    text: 'Costs of past deals are added back: they belong to the transaction, not to the business being valued.',
  },
  pro_forma: {
    keywords: ['pro forma', 'acquisition', 'disposal', 'full-year'], title: 'Pro forma adjustments',
    text: 'Restates the year as if an acquisition or disposal had been in place throughout. Use figures you can trace to the acquired company’s accounts.',
  },
  run_rate: {
    keywords: ['run-rate', 'synergies', 'savings', 'cost programme'], title: 'Run-rate savings',
    text: 'Savings not yet in the reported figures. Lenders cap how much they accept. Mark it as a cost that continues until the saving is actually achieved, so the forecast does not start from a margin the business has not reached.',
  },
  pension: {
    keywords: ['pension', 'retirement', 'deficit'], title: 'Pension deficit',
    text: 'An unfunded pension obligation is a claim on the business ahead of the equity, so buyers treat the deficit as debt.',
  },
  nci: {
    keywords: ['minority', 'non-controlling', 'nci'], title: 'Minority interests',
    text: 'EBITDA is consolidated in full, so the part of the value that belongs to minority holders is deducted with debt. Book value is a floor; the claim is usually worth more.',
  },
  restricted_cash: {
    keywords: ['restricted cash', 'trapped cash'], title: 'Restricted and trapped cash',
    text: 'Cash the company cannot use freely does not reduce what a buyer must fund. Take it out of cash only if the cash figure includes it.',
  },
  leases: {
    keywords: ['lease', 'leases', 'ifrs 16', 'rent', 'operating lease'], title: 'Leases in net debt',
    text: 'The lease choice has to match how rent sits in EBITDA. Under IFRS, EBITDA is before lease cost, so all lease liabilities count as debt. Under US GAAP, operating lease rent is already deducted in EBITDA, so only finance leases count.',
  },
};
