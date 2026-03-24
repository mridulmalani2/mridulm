export interface ArticleMeta {
  slug: string;
  title: string;
  subtitle: string;
  category: 'deal-analysis' | 'investment-memo' | 'sector-analysis' | 'short-note';
  date: string;
  readingTime: string;
  volume: number;
  edition: number;
  excerpt: string;
  keyMetrics: { label: string; value: string; subtext?: string }[];
  hasModel: boolean;
}

export const ARTICLES: ArticleMeta[] = [
  {
    slug: 'broadcom-vmware',
    title: 'Broadcom Inc. Acquisition of VMware Inc.',
    subtitle: 'Deal Analysis',
    category: 'deal-analysis',
    date: 'March 2026',
    readingTime: '18 min read',
    volume: 1,
    edition: 1,
    excerpt:
      'Broadcom acquired VMware for approximately $61 billion in cash and stock, closing on November 22, 2023. The transaction represents the largest infrastructure software acquisition in history and the third major execution of Broadcom\'s established acquisition playbook.',
    keyMetrics: [
      { label: 'Enterprise Value', value: '$69B', subtext: 'incl. assumed debt' },
      { label: 'Op. Margin Post-Acq', value: '77%', subtext: 'from ~21% pre-deal' },
      { label: 'Software Revenue', value: '$27B', subtext: 'FY2025 segment' },
      { label: 'Post-Synergy EV/OI', value: '3.1x', subtext: 'implied multiple' },
    ],
    hasModel: true,
  },
];
