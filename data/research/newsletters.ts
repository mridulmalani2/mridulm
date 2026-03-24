export interface NewsletterNode {
  id: string;
  title: string;
  source: string;
  date: string;
  commentary: string;
  url: string;
  accentColor: string;
}

export interface NewsletterMeta {
  slug: string;
  number: number;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  readingTime: string;
  excerpt: string;
  centerNode: {
    title: string;
    source: string;
    date: string;
    summary: string;
    url: string;
  };
  nodes: NewsletterNode[];
  essay: {
    title: string;
    paragraphs: string[];
    closingNote: string;
  };
}

export const NEWSLETTERS: NewsletterMeta[] = [
  {
    slug: 'liberty-media-f1',
    number: 1,
    title: 'The $2.5 Billion Shrug',
    subtitle: "Liberty Media's F1 Bet Meets Geopolitical Reality",
    author: 'Mridul Malani',
    date: 'March 24, 2026',
    readingTime: '12 min read',
    excerpt:
      'Analysts say the selloff is an overreaction. They might be right about the conclusion — but the reasoning deserves scrutiny.',
    centerNode: {
      title: 'Liberty Media Can Ride Out Mideast Conflict',
      source: 'Reuters',
      date: 'March 23, 2026',
      summary:
        'Reuters reports that despite an 11.7% stock decline, ~$2.46 billion in lost market cap, and the cancellation of the Bahrain and Saudi Arabia GPs, analysts at TD Cowen, Bernstein, and Wolfe Research are calling the selloff an overreaction. Their thesis: media rights revenue is insulated, the 22-race calendar still triggers broadcaster payouts, and Middle Eastern hosts will return with even larger incentives once stability resumes.',
      url: 'https://www.reuters.com/business/media-telecom/f1-owner-liberty-media-can-ride-out-mideast-conflict-2026-03-23/',
    },
    nodes: [
      {
        id: '01',
        title: 'The Promoter Fee Machine',
        source: 'Sportico',
        date: 'March 14, 2026',
        commentary:
          'Promoter fees have grown from $503M (34% of revenue) in 2018 to $824M in 2025. Five Middle Eastern races collectively account for over $250M in annual hosting fees — about a quarter of F1\'s entire hosting revenue. The Reuters analysts are right that this isn\'t existential. But they\'re quietly assuming the most premium slice of F1\'s most stable revenue line will snap back to normal. That\'s a bet on geopolitics, not on spreadsheets.',
        url: 'https://www.sportico.com/leagues/motorsports/2026/how-f1s-middle-east-woes-could-hurt-revenue-promoter-fees-1234887237/',
        accentColor: '#6B7280',
      },
      {
        id: '02',
        title: "The Gulf's Billion-Dollar Sports Dream",
        source: 'GrandPrix247',
        date: 'March 22, 2026',
        commentary:
          "F1's entanglement with the Gulf goes far deeper than hosting fees. Bahrain's Mumtalakat and Abu Dhabi's CYVN Holdings now fully own McLaren. Saudi Arabia's PIF holds ~8% of Aston Martin. Qatar Investment Authority has a stake in Sauber. Aramco is a top-tier global partner. This isn't a sport that occasionally visits the Middle East — it's a sport that is structurally financed by it.",
        url: 'https://www.grandprix247.com/f1-opinion/usa-israel-iram-war-formula-1s-great-money-chase-and-global-strategy-meets-a-brutal-reality',
        accentColor: '#92400E',
      },
      {
        id: '03',
        title: 'The Media Rights Safety Net',
        source: 'Huddle Up',
        date: 'March 2026',
        commentary:
          "The single most important assumption in the Reuters piece is that media rights revenue is insulated from cancellations. This is broadly true — as long as the calendar delivers more than 16 races, full payments are triggered. The Apple TV deal alone is worth ~$150M/year. But what happens if the conflict extends to September, when Azerbaijan, Qatar, and Abu Dhabi are scheduled?",
        url: 'https://huddleup.substack.com/p/how-formula-1-makes-money-a-complete',
        accentColor: '#4B5563',
      },
      {
        id: '04',
        title: 'The Hormuz Factor',
        source: 'Dallas Fed',
        date: 'March 20, 2026',
        commentary:
          'The same conflict that cancelled two GPs also closed the Strait of Hormuz, removed ~20% of global oil supply, and sent Brent crude past $100/barrel. The Dallas Fed projects a 2.9pp drag on annualized global GDP growth in Q2 2026. Goldman has bumped U.S. recession probability to 25%. The Reuters piece never mentions oil. It should.',
        url: 'https://www.dallasfed.org/research/economics/2026/0320',
        accentColor: '#7C3AED',
      },
      {
        id: '05',
        title: 'Collateral Damage Across Global Sport',
        source: 'Al Jazeera',
        date: 'March 4, 2026',
        commentary:
          "F1 isn't the only sport absorbing the shock. Iran's sports minister declared the national team cannot participate in the 2026 FIFA World Cup. MotoGP rescheduled Qatar. The WEC moved its season opener. The \"one-off anomaly\" framing depends on the conflict being contained and short. If instability persists through September, the calendar shrinks further and the media threshold gets closer.",
        url: 'https://www.aljazeera.com/sports/2026/3/4/irans-place-in-world-cup-2026-in-doubt-amid-conflict-trumps-dismissal',
        accentColor: '#059669',
      },
      {
        id: '06',
        title: 'The Bull Case: 2027 as Springboard',
        source: 'Yahoo Sports',
        date: 'February 26, 2026',
        commentary:
          "F1's 2025 financials were a masterclass: $3.87B in revenue (+14% YoY), $632M operating income (+28%), 6.75M fan attendance (+4%). Since Liberty acquired the sport in 2017 for $8B, the enterprise is now valued at $20B+. TD Cowen's thesis that 2026 becomes a \"base year\" for dramatic 2027 growth isn't unreasonable — but it's a forward-looking bet masquerading as current-state analysis.",
        url: 'https://sports.yahoo.com/articles/f1-revenue-surges-3-9-151232089.html',
        accentColor: '#D97706',
      },
    ],
    essay: {
      title:
        'The $2.5 Billion Shrug: Why the Analysts Might Be Right for the Wrong Reasons',
      paragraphs: [
        "The sell-side consensus on Liberty Media right now is remarkably unified: the stock is oversold, the cancellations are priced in too aggressively, and F1's structural growth story is intact. TD Cowen calls it a \"big overreaction.\" Bernstein frames the Iran conflict as a potential \"clearing event.\" Wolfe Research says investors will barely remember this in a few years. They're probably right about the conclusion. I'm less convinced about the reasoning.",
        "The bull case rests on three pillars. First, that media rights — F1's largest and most contractually insulated revenue stream — are untouched by race cancellations as long as the calendar stays above 16 events. Second, that the two cancelled races represent a contained, one-time hit: roughly $190\u2013200M in revenue, $80M in EBITDA, painful but not structural. Third, that Middle Eastern host nations will come back stronger, offering higher fees and better terms to reassert their position once the conflict subsides.",
        "Each of these is defensible in isolation. Together, they construct a neat narrative of resilience. But they share a common blind spot: they treat the Iran conflict as exogenous to F1's business model, a storm passing over a sturdy building. The reality is that the building was partly built with Gulf steel.",
        "Consider the depth of integration. Five of F1's 24 races are in the Middle East. Those five races collectively generate over $250M in annual promoter fees — about a quarter of F1's entire hosting revenue. Three F1 teams carry sovereign wealth fund investment from Bahrain, Saudi Arabia, and Qatar respectively. Aramco, the Saudi state oil company, is one of F1's top global sponsors. The sport's logistics for its entire Asian and Middle Eastern swing depend on Gulf transit hubs whose airports were closed for weeks. This isn't a sport that happens to race in the Gulf. It's a sport whose current commercial architecture was co-designed with Gulf capital.",
        "None of this means F1 is fragile. It means the concentration risk is real and underpriced. The analysts are modeling a scenario where two races get cancelled and the rest of the calendar holds. But the September\u2013December slate includes Azerbaijan, Qatar, and Abu Dhabi — all three of which sit within the conflict's blast radius. If the war extends or reignites, the 16-race threshold that protects media rights starts to look less like a safety net and more like a tightrope.",
        "Then there's the macro dimension that the Reuters piece doesn't touch. The same conflict that cancelled two Grands Prix also closed the Strait of Hormuz, removing 20% of global seaborne oil supply, sending Brent past $100/barrel, and prompting the largest coordinated strategic reserve release in IEA history. The Dallas Fed projects a 2.9 percentage point drag on annualized global GDP growth in Q2 2026. Goldman has bumped U.S. recession probability to 25%. This isn't a backdrop that's kind to premium consumer experiences.",
        "Where I do agree with the analysts is on the medium-term trajectory. F1's transformation under Liberty Media is genuinely remarkable. Revenue has more than doubled since 2017. The audience has gotten younger, more global, and more digitally engaged. The Apple TV deal, the LVMH partnership, the Cadillac entry, the new 2026 regulations — these are structural tailwinds that a two-race cancellation doesn't derail.",
        "But acknowledging the long-term thesis doesn't require accepting the short-term framing. The analysts are selling calm when the situation calls for nuance. The correct read isn't \"panic\" — it's \"price the tail risk properly.\" A conflict that resolves by summer vindicates the bulls. A conflict that grinds into autumn introduces cascading cancellations, media contract thresholds, and sponsor fatigue that no amount of \"strong long-term fundamentals\" can offset in real time.",
        "The market isn't wrong to mark down Liberty Media. It might be wrong about the magnitude. But the analyst class telling you this is a buying opportunity should at minimum acknowledge that their model assumes a geopolitical outcome they cannot predict. That's not analysis. That's faith with a Bloomberg terminal.",
      ],
      closingNote:
        'This is the first edition of a weekly newsletter published on mridulmalani.com. Each issue takes one article and stress-tests it against the evidence. If you want to disagree, you know where to find me.',
    },
  },
];
