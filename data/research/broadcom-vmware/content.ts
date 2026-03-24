export type SectionType =
  | 'executive-summary'
  | 'heading'
  | 'subheading'
  | 'prose'
  | 'numbered-points'
  | 'bullet-list'
  | 'scenario'
  | 'conclusion'
  | 'model-insert'
  | 'divider';

export interface ContentSection {
  type: SectionType;
  id?: string;
  title?: string;
  content?: string | string[];
  items?: any[];
}

export const ARTICLE_CONTENT: ContentSection[] = [
  // ── Executive Summary ──────────────────────────────────────────
  {
    type: 'executive-summary',
    id: 'executive-summary',
    title: 'Executive Summary',
    content: [
      'Broadcom acquired VMware for approximately $61 billion in cash and stock, closing on November 22, 2023. The transaction represents the largest infrastructure software acquisition in history and the third major execution of Broadcom\'s established acquisition playbook, following CA Technologies ($18.9 billion, 2018) and Symantec Enterprise ($10.7 billion, 2019).',
      'The core logic is straightforward: acquire a dominant infrastructure software franchise with deep enterprise lock-in, eliminate cost inefficiency, consolidate the product portfolio, convert perpetual licenses to subscriptions, and reprice aggressively to extract embedded value from the installed base. Broadcom has executed this with precision. VMware\'s operating margins expanded from roughly 20% pre-acquisition to 77% within eighteen months. Infrastructure software segment revenue reached $27 billion in fiscal year 2025, up 26% year-over-year. Quarterly spending was cut in half, from $2.4 billion to $1.2 billion.',
      'The transaction is best understood as a private equity-style value extraction strategy executed within public markets. The primary risk is not operational execution, which Broadcom has demonstrated, but demand erosion over the medium term as customers respond to pricing pressure with migration to alternative platforms. Gartner estimates 35% of VMware workloads will shift to competitors by 2028.',
    ],
  },

  // ── Context ────────────────────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'context', title: 'Context' },
  {
    type: 'subheading',
    title: 'Sector Positioning',
  },
  {
    type: 'prose',
    content: [
      'Enterprise virtualization and private cloud infrastructure represent a mature, high-margin segment of enterprise IT. VMware held approximately 43% market share in virtualization at the time of acquisition, with an entrenched position across the Global 2000 that had been built over two decades. Switching costs are structurally high: VMware\'s hypervisor layer sits beneath the entire application stack, making replacement technically complex and operationally disruptive.',
      'This market structure creates favorable conditions for a buyer willing to trade growth for margin expansion. The installed base is captive in the near term, allowing significant pricing latitude before customers bear the cost and risk of migration.',
    ],
  },
  {
    type: 'subheading',
    title: 'Broadcom\'s Strategic Profile',
  },
  {
    type: 'prose',
    content: [
      'Broadcom operates as an infrastructure technology conglomerate across semiconductors and enterprise software. Under CEO Hock Tan, the company has pursued a disciplined acquisition strategy focused on mature, high-cash-flow businesses. The model prioritizes margin optimization and free cash flow generation over organic product development.',
      'Pre-VMware, Broadcom\'s software division included mainframe software (CA Technologies), cybersecurity (Symantec Enterprise), and fiber channel networking (Brocade). VMware represented the largest expansion of this strategy by an order of magnitude.',
    ],
  },

  // ── Strategic Rationale ────────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'strategic-rationale', title: 'Strategic Rationale' },
  { type: 'subheading', title: 'Why Broadcom Acquired VMware' },
  {
    type: 'prose',
    content: ['Three drivers underpin the transaction:'],
  },
  {
    type: 'numbered-points',
    items: [
      {
        title: 'Captive installed base with pricing power.',
        body: 'VMware\'s hypervisor and cloud management stack are embedded across approximately 300,000 enterprise customers, including the majority of the Fortune 500. The deep integration of vSphere into data center operations creates multi-year switching timelines. Broadcom identified this as an undermonetized franchise: VMware was generating approximately $13 billion in annual revenue with operating margins in the low-20% range, well below what the franchise\'s market position and lock-in dynamics could support.',
      },
      {
        title: 'Subscription conversion opportunity.',
        body: 'VMware\'s revenue base was predominantly perpetual license and maintenance. Conversion to subscription licensing, combined with portfolio bundling, creates a higher-value, more predictable revenue stream while eliminating low-margin transactional revenue. This is the same lever Broadcom applied at CA Technologies, where it consolidated the product line and migrated the customer base to recurring contracts.',
      },
      {
        title: 'Private cloud consolidation play.',
        body: 'The shift from on-premise virtualization to hybrid and private cloud creates an opportunity to repackage VMware\'s portfolio as an integrated private cloud platform (VMware Cloud Foundation). This positions the combined entity at the center of enterprise data center modernization, particularly for regulated industries and workloads that cannot move to public cloud.',
      },
    ],
  },
  { type: 'subheading', title: 'What VMware Shareholders Received' },
  {
    type: 'prose',
    content: [
      'VMware shareholders received $142.50 per share in cash or 0.2520 shares of Broadcom common stock per VMware share. Approximately half of VMware shares were converted to cash and half to Broadcom equity. Total enterprise value, including assumed debt, was approximately $69 billion.',
    ],
  },

  // ── Value Creation ─────────────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'value-creation', title: 'Value Creation' },
  {
    type: 'prose',
    content: [
      'This is the defining section of the analysis. Broadcom\'s value creation strategy at VMware follows a precise, repeatable framework applied across its prior acquisitions.',
    ],
  },
  {
    type: 'subheading',
    title: '1. Cost Rationalization',
  },
  {
    type: 'prose',
    content: [
      'The most immediate and visible lever. Broadcom cut VMware\'s quarterly operating expenditure from $2.4 billion to approximately $1.2 billion within a year of closing. Key actions included:',
    ],
  },
  {
    type: 'bullet-list',
    items: [
      'Workforce reductions estimated at over 50% of VMware\'s pre-acquisition headcount',
      'Elimination of duplicative corporate functions',
      'Reduction in R&D spending focused on non-core product lines',
      'Consolidation of go-to-market operations',
    ],
  },
  {
    type: 'prose',
    content: [
      'This alone drove operating margin expansion from approximately 20% to 77%, an extraordinary compression achieved by removing what Broadcom viewed as structural cost inefficiency.',
    ],
  },
  {
    type: 'subheading',
    title: '2. Product Portfolio Consolidation',
  },
  {
    type: 'prose',
    content: [
      'Broadcom reduced VMware\'s product catalog from approximately 8,000 SKUs to four core offerings:',
    ],
  },
  {
    type: 'bullet-list',
    items: [
      'VMware Cloud Foundation (VCF): the flagship private cloud bundle',
      'VMware vSphere Foundation (VVF)',
      'VMware vSphere Standard (VVS)',
      'VMware vSphere Essential Plus (VVEP)',
    ],
  },
  {
    type: 'prose',
    content: [
      'This consolidation serves two purposes. First, it forces customers into bundled purchases that include networking (NSX) and storage (vSAN) products they may not have previously licensed, increasing effective average selling price. Second, it simplifies the sales motion and reduces support complexity.',
    ],
  },
  {
    type: 'subheading',
    title: '3. Pricing Strategy',
  },
  {
    type: 'prose',
    content: [
      'The most aggressive and consequential lever. Broadcom implemented pricing changes that resulted in reported cost increases of 800% to 1,500% for many customers, with tenfold increases being common. Specific mechanisms include:',
    ],
  },
  {
    type: 'bullet-list',
    items: [
      'Mandatory subscription licensing with elimination of new perpetual licenses',
      'Bundled product packaging that increases the per-customer spend floor',
      'Minimum core licensing requirements (72-core minimum for vSphere Standard, later revised to 16-core after backlash)',
      '20% late renewal penalties',
    ],
  },
  {
    type: 'prose',
    content: [
      'This strategy reflects a deliberate calculation: the switching cost and migration timeline for most VMware customers is 2 to 5 years, creating a window during which significant price increases can be absorbed before customers realistically migrate. The pricing is designed to maximize revenue extraction from the installed base during this window.',
    ],
  },
  {
    type: 'subheading',
    title: '4. Channel Restructuring',
  },
  {
    type: 'prose',
    content: [
      'Broadcom terminated VMware\'s existing partner programs in February 2024, replacing them with an invitation-only Broadcom Advantage Partner Program. Only partners generating $500,000 or more in annual revenue qualified for invitation. This effectively eliminated the mid-market and SMB channel, concentrating go-to-market resources on large enterprise accounts where switching costs are highest and price sensitivity is lowest.',
    ],
  },
  {
    type: 'subheading',
    title: '5. Non-Core Asset Divestiture',
  },
  {
    type: 'prose',
    content: [
      'Broadcom sold VMware\'s End-User Computing (EUC) division to KKR for approximately $4 billion, stripping out a lower-margin, non-strategic business line. This is consistent with the playbook: retain the high-lock-in, high-margin infrastructure core and exit peripheral businesses that dilute returns.',
    ],
  },
  {
    type: 'subheading',
    title: '6. VCF as the Growth Platform',
  },
  {
    type: 'prose',
    content: [
      'Over 90% of VMware\'s top 10,000 customers have been converted to the VMware Cloud Foundation private cloud bundle. Annual booking value reached $2.7 billion in Q4 fiscal 2024, up $200 million sequentially. VCF positions VMware as the default private cloud infrastructure layer, deepening lock-in and expanding the addressable spend per customer.',
    ],
  },

  // ── Economics and Valuation ────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'economics', title: 'Economics and Valuation' },
  { type: 'subheading', title: 'Transaction Pricing' },
  {
    type: 'prose',
    content: [
      'At $61 billion in equity value (approximately $69 billion enterprise value), the deal was priced at roughly 5x VMware\'s trailing revenue of approximately $13 billion and approximately 25x pre-acquisition operating income, assuming mid-20% margins. At Broadcom\'s post-optimization margins of 77%, the effective acquisition multiple on normalized earnings compresses significantly.',
      'On a post-synergy basis, with infrastructure software segment revenue at $27 billion annually and operating margins at 77%, the implied operating income from the software segment alone is approximately $20.8 billion. Against a $69 billion total enterprise value for VMware, the effective post-synergy price-to-operating-income multiple is approximately 3.3x, an exceptional return on invested capital.',
    ],
  },
  { type: 'subheading', title: 'Broadcom\'s Financial Profile Post-Acquisition' },
  {
    type: 'bullet-list',
    items: [
      'FY2025 total revenue: $63.9 billion (up 24% YoY)',
      'Infrastructure software segment: $27 billion (42% of total revenue)',
      'EBITDA margin: 55% company-wide, 68% in Q1 FY2026',
      'Market capitalization: approximately $1.5 trillion',
    ],
  },
  { type: 'subheading', title: 'Margin Trajectory' },
  {
    type: 'prose',
    content: [
      'The margin expansion curve mirrors what Broadcom achieved at CA Technologies and Symantec. The timeline from close to target operating margins has been approximately 12 to 18 months across all three acquisitions. VMware\'s larger scale made the absolute dollar impact substantially greater.',
    ],
  },

  // ── Model Insert ───────────────────────────────────────────────
  { type: 'model-insert', title: 'Financial Model' },

  // ── Risks ──────────────────────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'risks', title: 'Risks' },
  {
    type: 'subheading',
    title: '1. Customer Attrition and Workload Migration',
  },
  {
    type: 'prose',
    content: [
      'This is the principal risk. Gartner survey data indicates 74% of IT leaders are actively exploring VMware alternatives. Gartner projects 35% of VMware workloads will migrate to alternative platforms by 2028. Key competing platforms include Nutanix AHV (market share doubled from approximately 3% to 6% between 2022 and 2024), Microsoft Hyper-V (15% to 17% over the same period), and open-source options such as Proxmox VE.',
      'The question is not whether attrition will occur, but at what rate and from which customer segments. Large enterprise customers with complex, multi-hypervisor environments face the highest switching costs and are least likely to migrate. Mid-market and SMB customers, whom Broadcom has deprioritized through channel restructuring, are the most likely to leave.',
    ],
  },
  {
    type: 'subheading',
    title: '2. Regulatory Exposure',
  },
  {
    type: 'prose',
    content: [
      'European regulators have increased scrutiny. CISPE (Cloud Infrastructure Services Providers in Europe) has reported price increases of 800% to 1,500% among its members. The European Commission\'s ECCO monitoring body has noted "deteriorating" conditions and described Broadcom\'s changes as approaching "abuse of market power." Formal regulatory action, such as competition investigations or forced pricing remedies, would directly impair the value extraction thesis.',
    ],
  },
  {
    type: 'subheading',
    title: '3. Product Stagnation',
  },
  {
    type: 'prose',
    content: [
      'The cost reduction strategy involves significant R&D cuts. If VMware\'s product capabilities fall behind competing platforms, particularly in areas like Kubernetes integration, edge computing, and multi-cloud management, the switching cost advantage erodes. Customers who invest in modernization may bypass VMware entirely in new deployment architectures.',
    ],
  },
  {
    type: 'subheading',
    title: '4. Concentration Risk in VCF',
  },
  {
    type: 'prose',
    content: [
      'The consolidation strategy concentrates revenue on a single platform (VMware Cloud Foundation). Competitive or technological disruption to VCF would impact a disproportionate share of the software segment\'s revenue base, with limited product diversification as a buffer.',
    ],
  },
  {
    type: 'subheading',
    title: '5. Macro and Demand Risk',
  },
  {
    type: 'prose',
    content: [
      'Enterprise IT spending deceleration, particularly in data center infrastructure, would pressure both renewal rates and new VCF adoption. The subscription model provides some visibility, but aggressive pricing increases reduce customer willingness to expand deployments during budget-constrained periods.',
    ],
  },

  // ── Scenario Analysis ──────────────────────────────────────────
  { type: 'divider' },
  { type: 'heading', id: 'scenario-analysis', title: 'Scenario Analysis' },
  {
    type: 'scenario',
    items: [
      {
        name: 'Base Case',
        subtitle: 'Controlled Erosion, Sustained Margin Extraction',
        probability: 'Most likely',
        variant: 'base',
        body: 'VMware retains 70% to 75% of its pre-acquisition installed base through 2028. Large enterprise customers remain on the platform due to switching costs, though at reduced deployment footprints. Mid-market attrition is material but offset by higher per-customer revenue from pricing and bundling. Infrastructure software segment revenue stabilizes at $25 to $28 billion annually with operating margins sustained above 70%.',
        drivers: [
          'High switching costs in large enterprise',
          'VCF adoption deepening among top accounts',
          'Mid-market losses offset by pricing gains on retained customers',
        ],
        implication:
          'The deal generates exceptional returns on invested capital. Broadcom\'s acquisition multiple compresses to under 4x operating income. Free cash flow generation funds further M&A or debt reduction.',
      },
      {
        name: 'Bull Case',
        subtitle: 'VCF Becomes the Private Cloud Standard',
        probability: 'Plausible',
        variant: 'bull',
        body: 'VMware Cloud Foundation achieves broad adoption as the default private cloud platform for regulated and hybrid environments. New workload deployments on VCF offset customer losses at the low end. Revenue grows at mid-single digits annually. Regulatory scrutiny does not escalate to enforcement action. Infrastructure software segment revenue reaches $30 to $35 billion by 2028 with margins sustained above 75%.',
        drivers: [
          'Successful VCF ecosystem expansion',
          'Limited viable alternatives for complex enterprise environments',
          'AI infrastructure demand driving new data center buildouts that default to VMware',
        ],
        implication:
          'Broadcom\'s software division becomes a dominant infrastructure platform company. Market rerates the software segment at higher multiples.',
      },
      {
        name: 'Bear Case',
        subtitle: 'Accelerated Migration and Regulatory Intervention',
        probability: 'Non-trivial',
        variant: 'bear',
        body: 'Customer backlash accelerates migration timelines. Nutanix, Microsoft, and open-source alternatives mature faster than expected. European regulatory action forces pricing concessions or unbundling. A major Fortune 500 customer publicly migrates off VMware, triggering a cascade effect. Infrastructure software segment revenue declines to $20 to $22 billion by 2028 with margin pressure from both pricing concessions and competitive investment requirements.',
        drivers: [
          'Regulatory enforcement in Europe',
          'Competitive maturation of Nutanix and Hyper-V',
          'Faster-than-expected customer migration',
          'Potential enterprise backlash cascade',
        ],
        implication:
          'The value extraction window closes faster than Broadcom\'s model assumes. R&D reinvestment becomes necessary to defend the installed base, compressing margins toward 50 to 60%. The deal still generates positive returns given the margin expansion already captured, but long-term franchise value is impaired.',
      },
    ],
  },

  // ── Conclusion ─────────────────────────────────────────────────
  { type: 'divider' },
  {
    type: 'conclusion',
    id: 'conclusion',
    title: 'Conclusion',
    content: [
      'The Broadcom-VMware transaction is the most significant execution of the "acquire, consolidate, extract" playbook in enterprise software. Broadcom paid approximately $69 billion for a franchise generating $13 billion in revenue at sub-25% margins and, within eighteen months, restructured it into a $27 billion revenue segment operating at 77% margins. The financial engineering is exceptional.',
      'The strategy is rational if one accepts two premises: that VMware\'s installed base is sufficiently captive to absorb 10x pricing increases without fatal attrition, and that the relevant time horizon for value extraction is 3 to 5 years rather than a decade. Early evidence supports both premises, though with meaningful caveats. Customer exploration of alternatives is widespread, and regulatory risk in Europe is escalating.',
      'This is fundamentally a private equity-style value extraction executed within a public market structure. Broadcom is harvesting the accumulated goodwill and switching cost moat that VMware built over twenty years. The approach maximizes near-term cash flow at the expense of long-term franchise health. Whether this constitutes value creation or value transfer depends on the time horizon and the stakeholder perspective.',
      'The deal will likely be judged a financial success for Broadcom shareholders. The margin expansion and cash flow generation have already materially exceeded what the pre-acquisition VMware was delivering. The open question is whether the strategy permanently impairs VMware\'s competitive position or whether the remaining customer base, concentrated among large enterprises with limited alternatives, proves durable enough to sustain the economics beyond the current extraction window.',
    ],
  },
];
