// SSG Route Definitions
// Routes are generated dynamically from content data — no hardcoding needed.

import { ARTICLES } from '../data/research/articles';
import { NEWSLETTERS } from '../data/research/newsletters';

const SITE_URL = 'https://mridulm.vercel.app';

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: string;
  ogImage: string;
  structuredData?: object;
}

// Static routes with their metadata
const staticRoutes: RouteMeta[] = [
  {
    path: '/',
    title: 'Mridul Malani | Corporate Finance and Private Markets | HEC Paris MiM \'27/28',
    description: 'HEC Paris MiM candidate specializing in corporate finance, private markets, and startup investments. Previously at Reliance Industries, IndiaMart, and Chanakya Wealth.',
    canonicalUrl: `${SITE_URL}/`,
    ogType: 'website',
    ogImage: `${SITE_URL}/og-image.png`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Mridul Malani',
      url: SITE_URL,
      jobTitle: 'Corporate Finance and Private Markets Professional',
      alumniOf: [
        { '@type': 'Organization', name: 'HEC Paris' },
        { '@type': 'Organization', name: 'Ashoka University' },
      ],
      sameAs: ['https://in.linkedin.com/in/mridulmalani'],
    },
  },
  {
    path: '/research',
    title: 'Research & Analysis | Mridul Malani',
    description: 'Institutional-quality thinking across deals, models, and the forces shaping markets. Investment memos, deal analyses, and deep-dive research.',
    canonicalUrl: `${SITE_URL}/research`,
    ogType: 'website',
    ogImage: `${SITE_URL}/og-image.png`,
  },
  {
    path: '/research/reports',
    title: 'Research Reports | Mridul Malani',
    description: 'Investment memos, deal analyses, and deep-dive research on the transactions reshaping industries.',
    canonicalUrl: `${SITE_URL}/research/reports`,
    ogType: 'website',
    ogImage: `${SITE_URL}/og-image.png`,
  },
  {
    path: '/research/newsletter',
    title: 'The Newsletter | Mridul Malani',
    description: 'One story. Every angle. Weekly essays connecting markets, geopolitics, and business strategy into critical perspective.',
    canonicalUrl: `${SITE_URL}/research/newsletter`,
    ogType: 'website',
    ogImage: `${SITE_URL}/og-image.png`,
  },
];

// Dynamic routes generated from content data
const articleRoutes: RouteMeta[] = ARTICLES.map((article) => ({
  path: `/research/reports/${article.slug}`,
  title: `${article.title} | Mridul Malani Research`,
  description: article.excerpt,
  canonicalUrl: `${SITE_URL}/research/reports/${article.slug}`,
  ogType: 'article',
  ogImage: `${SITE_URL}/og-image.png`,
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    author: { '@type': 'Person', name: 'Mridul Malani' },
    datePublished: article.date,
    publisher: { '@type': 'Person', name: 'Mridul Malani' },
  },
}));

const newsletterRoutes: RouteMeta[] = NEWSLETTERS.map((newsletter) => ({
  path: `/research/newsletter/${newsletter.slug}`,
  title: `${newsletter.title} | The Newsletter by Mridul Malani`,
  description: newsletter.excerpt,
  canonicalUrl: `${SITE_URL}/research/newsletter/${newsletter.slug}`,
  ogType: 'article',
  ogImage: `${SITE_URL}/og-image.png`,
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: newsletter.title,
    description: newsletter.excerpt,
    author: { '@type': 'Person', name: 'Mridul Malani' },
    datePublished: newsletter.date,
    publisher: { '@type': 'Person', name: 'Mridul Malani' },
  },
}));

export const SSG_ROUTES: RouteMeta[] = [
  ...staticRoutes,
  ...articleRoutes,
  ...newsletterRoutes,
];
