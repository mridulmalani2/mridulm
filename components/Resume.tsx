import React, { useRef } from 'react';
import { motion, useScroll } from 'framer-motion';
import { MapPin, Calendar, Briefcase, GraduationCap, ArrowRight, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

interface TimelineEvent {
  company: string;
  role: string;
  location: string;
  period: string;
  description: string[];
  type: 'work' | 'education';
  startDate: Date;
}

const timelineData: TimelineEvent[] = ([
  {
    company: "HEC Paris",
    role: "Master in Management (International Finance)",
    location: "Paris, France",
    period: "08/2025 - 05/2027",
    type: 'education',
    startDate: new Date(2025, 7),
    description: [
      "GPA: 3.67 / 4.0 (HEC Foundation Trust Merit Excellence Scholar); ranked #2 globally by FT",
      "Head of Partnerships at HEC Investment Club & Stanford ASES France (Sustainable Ventures)"
    ]
  },
  {
    company: "Global HealthX",
    role: "Project Associate; Accelerator and Fund",
    location: "Hyderabad, India",
    period: "03/2025 - 07/2025",
    type: 'work',
    startDate: new Date(2025, 2),
    description: [
      "Supported in-house healthtech ventures through ecosystem research and startup evaluation",
      "Previously with the same team at Mantra Launchspace (EU-India Innocenter), consulted for 5+ startups, building go-to-market strategies with a focus on optimal pricing for agri-tech products"
    ]
  },
  {
    company: "Ashoka University",
    role: "B.Sc. (Hons) in Economics and Finance",
    location: "Sonipat, India",
    period: "09/2022 - 05/2025",
    type: 'education',
    startDate: new Date(2022, 8),
    description: [
      "GPA: 3.3 / 4.0; coursework in Corporate Finance, Private Equity, and Real Estate",
      "Centre for Entrepreneurship: Teaching Assistant (3 terms); only sophomore TA for 800+ students; youngest recipient of the Service Excellence Award",
      "Vice President, Ashoka Entrepreneurship Club; Founding Director, Venture Capital Vertical",
      "Team Lead and Research Assistant to Prof. Mukesh Sud; consulted for Himachal Pradesh Cricket Association on socio-economic impact analysis of Dharamshala Stadium"
    ]
  },
  {
    company: "Chanakya Wealth Capital",
    role: "Summer Intern; Portfolio Management Service",
    location: "Mumbai, India",
    period: "07/2024 - 08/2024",
    type: 'work',
    startDate: new Date(2024, 6),
    description: [
      "Built equity research models (DCF, Comps) for 2 listed companies within a $30M+ AUM fund",
      "Conducted downside risk assessment and drafted investment memos for internal portfolio reviews"
    ]
  },
  {
    company: "IndiaMART InterMESH Ltd",
    role: "Summer Intern; Corporate Strategy Department",
    location: "New Delhi, India",
    period: "05/2024 - 07/2024",
    type: 'work',
    startDate: new Date(2024, 4),
    description: [
      "Performed financial modeling, valuation, and due diligence on 10+ startups in the MSME ecosystem",
      "Conducted primary research and consumer behavior analysis in the payments technology sector"
    ]
  },
  {
    company: "Earlyseed Ventures",
    role: "Intern; Deal Sourcing Team",
    location: "Mumbai, India",
    period: "12/2023 - 04/2024",
    type: 'work',
    startDate: new Date(2023, 11),
    description: [
      "Consulted on market research, competitor benchmarking, and preliminary valuation for 5+ startups"
    ]
  },
  {
    company: "Reliance Industries Limited",
    role: "Summer Intern; FC&A Team and Reliance Green Energy",
    location: "Jamnagar, India",
    period: "06/2023 - 07/2023",
    type: 'work',
    startDate: new Date(2023, 5),
    description: [
      "Developed an Excel-based investment analysis module (VBA/Macros) for capital budgeting projections of CBG plants",
      "Worked with the Financial Compliance and Accounting team"
    ]
  }
] as TimelineEvent[]).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

const TimelineCard: React.FC<{ event: TimelineEvent; index: number }> = ({ event, index }) => {
  return (
    <article
      className="flex-shrink-0 w-[85vw] sm:w-[420px] md:w-[480px] px-4 snap-center relative group"
      aria-label={`${event.company} - ${event.role}`}
    >
      {/* Horizontal Connector */}
      <div className="absolute top-[50%] left-0 w-full h-px bg-white/5 group-hover:bg-amber-500/20 transition-all duration-700 pointer-events-none" />
      <div className="absolute top-[50%] left-0 -translate-y-1/2 w-4 h-4 rounded-full bg-black border border-white/20 z-20 group-hover:bg-amber-500 group-hover:scale-125 transition-all duration-500 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.8 }}
        viewport={{ once: true }}
        className="relative bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 md:p-12 flex flex-col gap-8 hover:bg-neutral-800/60 hover:border-amber-500/20 transition-all duration-500 h-full min-h-[480px] shadow-2xl"
      >
        <div className="flex justify-between items-start">
          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${event.type === 'education' ? 'text-purple-300 border-purple-500/20 bg-purple-500/5' : 'text-amber-500 border-amber-500/20 bg-amber-500/5'}`}>
            {event.type}
          </span>
          <div className="text-white/40 group-hover:text-amber-500/60 transition-colors" aria-hidden="true">
            {event.type === 'education' ? <GraduationCap size={22} /> : <Briefcase size={22} />}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-playfair text-3xl sm:text-4xl text-white italic leading-tight">
            {event.company}
          </h4>
          <p className="font-montserrat text-amber-500 text-[10px] font-black tracking-widest uppercase flex items-center gap-3">
            <Zap size={12} className="opacity-60" aria-hidden="true" />
            {event.role}
          </p>
        </div>

        <div className="flex-1 space-y-5 pt-8 border-t border-white/5">
          {event.description.map((desc, i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-amber-500/50 shrink-0" aria-hidden="true" />
              <p className="text-white/60 font-montserrat text-xs sm:text-sm leading-relaxed font-normal">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-4 mt-auto">
          <div className="flex items-center gap-3 text-white/50 text-[10px] font-black tracking-widest uppercase">
            <MapPin size={14} className="text-amber-500/50" aria-hidden="true" />
            {event.location}
          </div>
          <div className="flex items-center gap-3 text-white/50 text-[10px] font-black tracking-widest uppercase justify-end">
            <Calendar size={14} className="text-amber-500/50" aria-hidden="true" />
            {event.period}
          </div>
        </div>
      </motion.div>
    </article>
  );
};

const Resume: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: containerRef });

  const scrollLeft = () => {
    containerRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const scrollRight = () => {
    containerRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
  };

  return (
    <div className="w-full section-v-padding flex flex-col justify-center overflow-hidden bg-black">
      <div className="page-container mb-16 md:mb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <h2 className="font-montserrat text-amber-500 text-[10px] tracking-widest font-black uppercase inline-block border-b border-amber-500/20 pb-4">
            Career Timeline
          </h2>
          <h3 className="font-playfair text-fluid-h2 italic text-white leading-tight">
            Education & <br className="hidden sm:block"/> Professional Journey
          </h3>
        </motion.div>
      </div>

      <div className="relative">
        {/* Timeline Header - Adaptive Progress */}
        <div className="page-container mb-12 md:mb-16 flex items-center gap-8 md:gap-12">
          <span className="font-montserrat text-[10px] font-black tracking-widest text-amber-500 uppercase shrink-0">PRESENT</span>
          <div className="flex-1 h-px bg-white/5 relative overflow-hidden" role="progressbar" aria-label="Timeline scroll progress">
            <motion.div
              style={{ scaleX: scrollXProgress }}
              className="absolute inset-0 h-full bg-amber-500 origin-left"
            />
          </div>
          <span className="font-montserrat text-[10px] font-black tracking-widest text-white/40 uppercase shrink-0">PAST</span>
        </div>

        {/* Navigation Arrows - Desktop */}
        <button
          onClick={scrollLeft}
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/80 border border-white/10 rounded-full items-center justify-center hover:border-amber-500 transition-colors"
          aria-label="Scroll timeline left"
        >
          <ChevronLeft className="text-white" size={20} />
        </button>

        <button
          onClick={scrollRight}
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/80 border border-white/10 rounded-full items-center justify-center hover:border-amber-500 transition-colors"
          aria-label="Scroll timeline right"
        >
          <ChevronRight className="text-white" size={20} />
        </button>

        {/* Scrollable Timeline */}
        <div
          ref={containerRef}
          role="region"
          aria-label="Career timeline"
          tabIndex={0}
          className="flex overflow-x-auto pb-16 pt-10 px-[10vw] gap-4 no-scrollbar snap-x snap-mandatory cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {timelineData.map((event, i) => (
            <TimelineCard key={`${event.company}-${i}`} event={event} index={i} />
          ))}
          <div className="flex-shrink-0 w-[15vw]" />
        </div>

        <div className="mt-8 flex justify-center lg:hidden">
          <div className="flex items-center gap-4 bg-white/5 px-6 py-2.5 rounded-full border border-white/10">
            <span className="font-montserrat text-[8px] tracking-widest text-white/60 uppercase font-black">Swipe to explore</span>
            <ArrowRight size={14} className="text-amber-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Resume;
