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
  // ── 01 Finance ───────────────────────────────────────────────────────────
  {
    title: 'Capital Budgeting Excel Module',
    domain: 'Reliance Industries',
    story:
      'An automated capital-budgeting tool built in Excel with VBA macros and dynamic dashboards — NPV, IRR, ROIC, payback — to streamline investment evaluation.',
    link: 'https://www.linkedin.com/posts/mridulmalani_greenenergy-ril-investment-activity-7086587422154588161-I_pp',
    tags: ['Excel', 'VBA Macros', 'Financial Modeling'],
    category: 'finance',
    image: '/projects/capital-budgeting.jpg',
  },
  {
    title: 'Donna',
    domain: 'donna2-iota.vercel.app',
    story:
      'An intelligence layer for modern finance: it sits above existing systems, connects them, and turns fragmented data into contextual, actionable clarity.',
    link: 'https://donna2-iota.vercel.app/aboutdonna',
    tags: ['Next.js', 'TypeScript', 'GenAI'],
    category: 'finance',
    image: '/projects/donna.jpg',
  },
  {
    title: 'Quant Aptitude Platform',
    domain: 'dnastrat.vercel.app',
    story:
      'An MVP testing platform built for D+A Strategies as part of a proposed go-to-market strategy — adaptive assessment for quant trading aptitude.',
    link: 'https://dnastrat.vercel.app/',
    tags: ['Adaptive Testing', 'Quant', 'GTM'],
    category: 'finance',
    // no board yet — renders the text fallback card
  },

  // ── 02 Parked Ideas ──────────────────────────────────────────────────────
  {
    title: 'TourWiseCo',
    domain: 'tourwiseco.com',
    story:
      'A marketplace connecting travellers with verified local university students, to unlock authentic experiences in every city.',
    link: 'https://www.tourwiseco.com/',
    tags: ['Next.js', 'Tailwind', 'Supabase'],
    category: 'path-ideas',
    image: '/projects/tourwiseco.jpg',
  },
  {
    title: 'Experience India',
    domain: 'experienceindia.me',
    story:
      'A cultural hub for international students to explore India’s news, movies, food, events and everything in between.',
    link: 'https://experienceindia.me/',
    tags: ['Next.js', 'TypeScript', 'Supabase'],
    category: 'path-ideas',
    image: '/projects/experience-india.jpg',
  },
  {
    title: 'The Map',
    domain: 'themap.stationf.vercel.app',
    story:
      'A private network connecting trusted freelancers and in-house talent for fast, domain-specific help — without hiring or pitching. Built for Station F.',
    link: 'https://themap.stationf.vercel.app/',
    tags: ['Next.js', 'TypeScript', 'Station F'],
    category: 'path-ideas',
    image: '/projects/the-map.jpg',
  },

  // ── 03 Hobby ─────────────────────────────────────────────────────────────
  {
    title: 'Judgment faislo',
    domain: 'judgment-game.vercel.app',
    story:
      'The classic Kaach-Paani card game rebuilt for the digital age — real-time multiplayer with live rounds, trick prediction, in English or Hindi.',
    link: 'https://judgment-game.vercel.app/',
    tags: ['Next.js', 'Socket.io', 'Multiplayer'],
    category: 'hobby',
    image: '/projects/judgment-faislo.jpg',
  },
  {
    title: 'Judgment Game Rules',
    domain: 'judgment-game.vercel.app',
    story:
      'An interactive rules guide for the trick-taking card game — bidding, trump suits, scoring and constraints, explained with clarity.',
    link: 'https://judgment-game.vercel.app/',
    tags: ['Next.js', 'TypeScript', 'Tailwind'],
    category: 'hobby',
    image: '/projects/judgment-rules.jpg',
  },
];
