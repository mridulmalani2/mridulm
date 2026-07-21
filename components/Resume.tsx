import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { MapPin, Calendar, Briefcase, GraduationCap, ArrowRight, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { CarGlyph } from './AmbientMotifs';

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
  const isEducation = event.type === 'education';
  return (
    <article
      className="flex-shrink-0 w-[85vw] sm:w-[420px] md:w-[480px] px-4 snap-center relative group"
      aria-label={`${event.company} - ${event.role}`}
    >
      {/* Horizontal Connector */}
      <div className="absolute top-[50%] left-0 w-full h-px bg-ink/10 group-hover:bg-[#A25600]/30 transition-all duration-500 pointer-events-none" />
      <div className="absolute top-[50%] left-0 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-ink/20 z-20 group-hover:bg-saffron group-hover:border-saffron group-hover:scale-125 transition-all duration-500 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.7 }}
        viewport={{ once: true }}
        className="relative bg-white border border-ink/10 rounded-[1.75rem] p-5 md:p-7 flex flex-col gap-3.5 hover:border-ink/20 transition-all duration-300 h-full min-h-[340px] shadow-sm hover:shadow-xl"
      >
        <div className="flex justify-between items-start">
          <span
            className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border text-ink"
            style={
              isEducation
                ? { borderColor: 'rgba(147,124,246,0.7)', background: 'rgba(185,167,255,0.22)' }
                : { borderColor: 'rgba(232,142,50,0.7)', background: 'rgba(255,181,107,0.28)' }
            }
          >
            {event.type}
          </span>
          <div className="text-muted" aria-hidden="true">
            {isEducation ? <GraduationCap size={22} /> : <Briefcase size={22} />}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-display text-2xl sm:text-3xl font-bold text-ink leading-tight">
            {event.company}
          </h4>
          <p className="font-montserrat text-[#A25600] text-[10px] font-black tracking-widest uppercase flex items-center gap-3">
            <Zap size={12} className="opacity-70" aria-hidden="true" />
            {event.role}
          </p>
        </div>

        <div className="flex-1 space-y-3 pt-4 border-t border-ink/10">
          {event.description.map((desc, i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-saffron shrink-0" aria-hidden="true" />
              <p className="text-muted font-montserrat text-xs sm:text-sm leading-relaxed font-normal">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-ink/10 grid grid-cols-2 gap-4 mt-auto">
          <div className="flex items-center gap-3 text-muted text-[10px] font-black tracking-widest uppercase">
            <MapPin size={14} className="text-[#A25600]" aria-hidden="true" />
            {event.location}
          </div>
          <div className="flex items-center gap-3 text-muted text-[10px] font-black tracking-widest uppercase justify-end">
            <Calendar size={14} className="text-[#A25600]" aria-hidden="true" />
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
  // The car motif drives along the timeline track as the cards are scrolled.
  const carX = useTransform(scrollXProgress, [0, 1], ['1%', '99%']);

  const scrollLeft = () => {
    containerRef.current?.scrollBy({ left: -400, behavior: 'smooth' });
  };

  const scrollRight = () => {
    containerRef.current?.scrollBy({ left: 400, behavior: 'smooth' });
  };

  return (
    <div className="w-full flex flex-col justify-center overflow-hidden py-8">
      <div className="page-container mb-6 md:mb-7 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="space-y-3"
        >
          <h2 className="font-montserrat text-[#A25600] text-[11px] tracking-widest font-bold uppercase inline-block border-b border-[#A25600]/30 pb-2">
            Career Timeline
          </h2>
          <h3 className="font-display text-3xl md:text-4xl font-black text-ink leading-tight">
            Education &amp; Professional Journey
          </h3>
        </motion.div>
      </div>

      <div className="relative">
        {/* Timeline Header - Adaptive Progress */}
        <div className="page-container mb-6 md:mb-7 flex items-center gap-8 md:gap-12">
          <span className="font-montserrat text-[10px] font-black tracking-widest text-[#A25600] uppercase shrink-0">Present</span>
          <div className="flex-1 h-px bg-ink/10 relative" role="progressbar" aria-label="Timeline scroll progress">
            <motion.div
              style={{ scaleX: scrollXProgress }}
              className="absolute inset-0 h-full bg-[#A25600] origin-left"
            />
            {/* Car motif - drives toward "Past" as the timeline is explored */}
            <motion.div style={{ left: carX }} className="absolute -top-[22px] pointer-events-none" aria-hidden="true">
              <span className="block -translate-x-1/2 text-ink/75">
                <CarGlyph className="h-7 w-auto" />
              </span>
            </motion.div>
          </div>
          <span className="font-montserrat text-[10px] font-black tracking-widest text-muted uppercase shrink-0">Past</span>
        </div>

        {/* Navigation Arrows - Desktop */}
        <button
          onClick={scrollLeft}
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white border border-ink/10 rounded-full items-center justify-center shadow-sm hover:border-ink/30 transition-colors"
          aria-label="Scroll timeline left"
        >
          <ChevronLeft className="text-ink" size={20} />
        </button>

        <button
          onClick={scrollRight}
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white border border-ink/10 rounded-full items-center justify-center shadow-sm hover:border-ink/30 transition-colors"
          aria-label="Scroll timeline right"
        >
          <ChevronRight className="text-ink" size={20} />
        </button>

        {/* Scrollable Timeline */}
        <div
          ref={containerRef}
          role="region"
          aria-label="Career timeline"
          tabIndex={0}
          className="flex items-stretch overflow-x-auto pb-6 pt-4 px-[10vw] gap-4 no-scrollbar snap-x snap-mandatory cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
        >
          {timelineData.map((event, i) => (
            <TimelineCard key={`${event.company}-${i}`} event={event} index={i} />
          ))}
          <div className="flex-shrink-0 w-[15vw]" />
        </div>

        <div className="mt-8 flex justify-center lg:hidden">
          <div className="flex items-center gap-4 bg-ink/[0.04] px-6 py-2.5 rounded-full border border-ink/10">
            <span className="font-montserrat text-[10px] tracking-widest text-muted uppercase font-black">Swipe to explore</span>
            <ArrowRight size={14} className="text-[#A25600]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Resume;
