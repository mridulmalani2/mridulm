import { Project, ProjectSection } from '../types';

/**
 * Projects now live here in the repo (previously a live Google Sheet).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MRIDUL — this is the file to edit:
 *   • Move a project between sections by changing its `category`.
 *   • The three section `intro` paragraphs below are PLACEHOLDERS — rewrite
 *     them in your own voice (they're marked TODO).
 *   • `title` is what shows on the card; `domain` is the little URL label.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const PROJECT_SECTIONS: ProjectSection[] = [
  {
    id: 'finance',
    index: '01',
    title: 'Finance',
    blurb: 'Projects exploring finance with clarity and rigor.',
    tagline: 'Models, data, decisions.',
    accent: '#3F5347', // deep sage
    tint: '#F2F2EE',
    intro:
      'Each of these began as a real problem — a capital-budgeting call, a valuation, a workflow a team actually needed — and became a tool I built to solve it.',
  },
  {
    id: 'path-ideas',
    index: '02',
    title: 'Parked Ideas',
    blurb: 'Thoughtful experiments in progress. Not live, but not forgotten.',
    tagline: 'Concepts · MVPs · Future potential',
    accent: '#55396F', // deep violet
    tint: '#F3F1F5',
    intro:
      'Ideas I couldn’t stop thinking about, so I built them. Some are live, some are still experiments — all were attempts to turn a hunch into something real people could use.',
  },
  {
    id: 'hobby',
    index: '03',
    title: 'Hobby',
    blurb: 'Passion projects. Built for joy & growth.',
    tagline: 'Curiosity. Expression. Exploration.',
    accent: '#B0503A', // terracotta
    tint: '#F6EFEC',
    intro:
      'The stuff I build for fun — small, quick, and usually because someone I love needed it. Like a card game my family plays by our own rules, from three time zones away.',
  },
];

export const PROJECTS: Project[] = [
  // ── Finance ──────────────────────────────────────────────────────────────
  {
    title: 'Capital Budgeting Tool',
    domain: 'Reliance Industries',
    story:
      'A macro-coded capital-budgeting model I built during my internship at Reliance Industries for CBG-plant investment projections.',
    link: 'https://www.linkedin.com/posts/mridulmalani_greenenergy-ril-investment-activity-7086587422154588161-I_pp',
    tags: ['Corporate Finance', 'RIL', 'Sustainability'],
    category: 'finance',
  },
  {
    title: 'Quant Aptitude Platform',
    domain: 'dnastrat.vercel.app',
    story:
      'An MVP testing platform built for D+A Strategies as part of a proposed go-to-market strategy — adaptive assessment for quant trading aptitude.',
    link: 'https://dnastrat.vercel.app/',
    tags: ['Adaptive Testing', 'Quant', 'GTM'],
    category: 'finance',
  },
  {
    title: 'Donna AI',
    domain: 'donna2-iota.vercel.app',
    story:
      'An MVP of Donna, a GenAI assistant for wealth managers, built during my HEC Academy engagement with Capgemini and Meeschaert.',
    link: 'https://donna2-iota.vercel.app/aboutdonna',
    tags: ['GenAI', 'Wealth Management', 'Agents'],
    category: 'finance',
  },

  // ── Path Ideas ───────────────────────────────────────────────────────────
  {
    title: 'Experience India',
    domain: 'experienceindia.me',
    story:
      'A cultural hub for international students in Paris to explore Indian movies, music, events and happenings — my "step zero" passion project.',
    link: 'https://experienceindia.me/',
    tags: ['Passion Project', '#India', 'Community'],
    category: 'path-ideas',
  },
  {
    title: 'TourWiseCo',
    domain: 'tourwiseco.com',
    story:
      'Authentic travel, reimagined — meet students who are both native to your home culture and locals of the city you’re visiting.',
    link: 'https://www.tourwiseco.com/',
    tags: ['Venture No. 2', 'Travel', 'Marketplace'],
    category: 'path-ideas',
  },

  // ── Hobby Coding ─────────────────────────────────────────────────────────
  {
    title: 'Judgement with Family',
    domain: 'judgementwfam.tech',
    story:
      'A little app for my mom, grandparents and me to play our favourite card game — with our own family rules — while I’m abroad.',
    link: 'https://judgementwfam.tech/',
    tags: ['Card Games', 'Family', 'Weekend Build'],
    category: 'hobby',
  },
];
