import { Project, ProjectSection } from '../types';

/**
 * Projects now live here in the repo (previously a live Google Sheet).
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MRIDUL — this is the file to edit:
 *   • Move a project between sections by changing its `category`.
 *   • `title` is what shows on the card; `domain` is the little URL label.
 *   • `status` drives the chip in the popup: live / mvp / parked / building.
 *   • `detail` is the popup paragraph; `statusNote` is the honest one-liner
 *     about where things stand. Both are yours to rewrite.
 *   • Drop a board image into public/projects and set `image` — cards
 *     without one render a styled placeholder until then.
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
    status: 'live',
    detail:
      'Built during my time at Reliance: an automated capital-budgeting engine in Excel and VBA that takes a proposed investment and pressure-tests it in minutes — NPV, IRR, ROIC and payback, wired into dynamic dashboards so the evaluation reads at a glance instead of living in scattered workbooks.',
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
    status: 'live',
    detail:
      'An intelligence layer that sits above the systems finance teams already run — it connects them, reads across them, and turns scattered data into context you can actually act on. Instead of replacing tools, Donna makes the ones you have talk to each other.',
  },
  {
    title: 'Quant Aptitude Platform',
    domain: 'dnastrat.vercel.app',
    story:
      'An MVP testing platform built for D+A Strategies as part of a proposed go-to-market strategy — adaptive assessment for quant trading aptitude.',
    link: 'https://dnastrat.vercel.app/',
    tags: ['Adaptive Testing', 'Quant', 'GTM'],
    category: 'finance',
    // board image coming — renders the styled placeholder until then
    status: 'mvp',
    detail:
      'An adaptive assessment platform for quant-trading aptitude, built as an MVP for D+A Strategies as part of a proposed go-to-market strategy — the test adjusts to the candidate as they answer, so ability gets measured faster and with fewer questions.',
  },
  {
    title: 'M&A Advisory Automation',
    domain: 'Summer Internship',
    story:
      'AI automation for M&A advisory — automating the repetitive, judgment-light parts of deal execution so the team’s time goes where judgment matters.',
    tags: ['AI Automation', 'M&A', 'Workflow'],
    category: 'finance',
    // board image coming — renders the styled placeholder until then
    status: 'building',
    detail:
      'Built during my summer internship: AI automation for an M&A advisory workflow. The idea is simple — deal execution is full of repetitive, judgment-light work, and automating it gives the team its hours back for the parts where judgment actually matters.',
    statusNote: 'In progress at my summer internship — more to share soon.',
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
    status: 'parked',
    detail:
      'A marketplace connecting travellers with verified local university students — the bet was that a student who lives in a city shows it better than any guidebook, and gets paid fairly for it.',
    statusNote:
      'Parked for three honest reasons: the international students it was built around couldn’t cleanly self-employ or be employed, which tangled the whole work model; handling their personal data raised real GDPR questions; and candidly, AI has become a very good trip planner — so the moat narrowed.',
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
    status: 'parked',
    detail:
      'A cultural hub for international students to explore India — news, movies, food, events and everything in between, gathered in one place so arriving in a new country feels less like guesswork.',
    statusNote:
      'Parked for now: growing it needed campus-project funding, but the grant required working directly on campus life, so it wasn’t eligible. Fully realising it also needs a live events feed and on-the-ground promotion under the banner — it waits until those line up.',
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
    status: 'mvp',
    detail:
      'A private network for Station F connecting trusted freelancers and in-house talent — fast, domain-specific help without a hiring cycle or a pitch deck. Ask, get matched, get moving.',
    statusNote:
      'An MVP — currently in talks with people at Station F to figure out how it could actually run inside the campus.',
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
    status: 'live',
    detail:
      'The family Kaach-Paani card game, rebuilt for the web so we can keep playing from three time zones apart — real-time multiplayer with live rounds and trick prediction, in English or Hindi. Built for love of the game, by our own house rules.',
  },
];
