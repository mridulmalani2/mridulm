
import React, { useRef } from 'react';
import { motion, useScroll } from 'framer-motion';
import { MapPin, Calendar, Briefcase, GraduationCap, ArrowRight, Zap } from 'lucide-react';

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
    company: "Global Innovation Hub",
    role: "Project Associate, Fund",
    location: "Hyderabad, India",
    period: "03/2025 - 07/2025",
    type: 'work',
    startDate: new Date(2025, 2),
    description: [
      "Executed financial analysis and go-to-market strategies for 5+ health-tech startups",
      "Supported capital allocation decisions for emerging healthcare ventures"
    ]
  },
  {
    company: "Ashoka University",
    role: "B.Sc. (Hons) Economics & Finance",
    location: "Sonipat, India",
    period: "09/2022 - 05/2025",
    type: 'education',
    startDate: new Date(2022, 8),
    description: [
      "Minor in Entrepreneurship (Private Equity, Real Estate, Corporate Finance)",
      "3-time Teaching Assistant; recipient of Service Excellence Award",
      "Research Assistant for Prof. Mukesh Sud"
    ]
  },
  {
    company: "Entrepreneurship Club",
    role: "Vice President",
    location: "Ashoka University",
    period: "09/2022 - 05/2025",
    type: 'work',
    startDate: new Date(2022, 8),
    description: [
      "Founded India’s first undergraduate pre-incubator for PE & VC verticals",
      "Managed 100+ members and launched the flagship 'Shatranj' festival"
    ]
  },
  {
    company: "Chanakya Wealth Capital",
    role: "Equity Investments Intern",
    location: "Mumbai, India",
    period: "07/2024 - 08/2024",
    type: 'work',
    startDate: new Date(2024, 6),
    description: [
      "Built research models (DCF, Comps) for companies within a $30M+ AUM fund",
      "Drafted investment memos for portfolio allocation strategies"
    ]
  },
  {
    company: "India Mart",
    role: "Investments Intern",
    location: "New Delhi, India",
    period: "05/2024 - 07/2024",
    type: 'work',
    startDate: new Date(2024, 4),
    description: [
      "Performed financial modeling and valuation on startup ecosystem assets",
      "Conducted sectoral research to inform strategic investment decisions"
    ]
  },
  {
    company: "Professor Mukesh Sud",
    role: "Research Assistant",
    location: "Ashoka University",
    period: "10/2023 - 10/2024",
    type: 'work',
    startDate: new Date(2023, 9),
    description: [
      "Consulted for HPCA on socio-economic impact analysis projects",
      "Researched entrepreneurial ecosystems in Tier-II Indian cities"
    ]
  },
  {
    company: "Reliance Industries Ltd",
    role: "Intern (FC&A)",
    location: "Mumbai, India",
    period: "06/2023 - 07/2023",
    type: 'work',
    startDate: new Date(2023, 5),
    description: [
      "Developed analysis module increasing budgeting efficiency by 12x",
      "Worked across Economic Planning, Scheduling, and Green Energy teams"
    ]
  }
] as TimelineEvent[]).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

const TimelineCard: React.FC<{ event: TimelineEvent; index: number }> = ({ event, index }) => {
  return (
    <div className="flex-shrink-0 w-[85vw] sm:w-[450px] md:w-[500px] px-4 snap-center relative group">
      {/* Decorative Connector */}
      <div className="absolute top-[50%] left-0 w-full h-px bg-white/10 group-hover:bg-amber-500/30 transition-all duration-700" />
      <div className="absolute top-[50%] left-0 -translate-y-1/2 w-4 h-4 rounded-full bg-black border-2 border-white/20 z-20 group-hover:border-amber-500 group-hover:scale-125 transition-all duration-500" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.8 }}
        viewport={{ once: true }}
        className="relative bg-neutral-900/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 sm:p-12 flex flex-col gap-8 hover:bg-neutral-800/60 hover:border-amber-500/20 transition-all duration-500 h-full min-h-[480px] sm:min-h-[520px] shadow-2xl"
      >
        <div className="flex justify-between items-start">
          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] uppercase border ${event.type === 'education' ? 'text-purple-300 border-purple-500/30 bg-purple-500/5' : 'text-amber-500 border-amber-500/30 bg-amber-500/5'}`}>
            {event.type}
          </span>
          <div className="text-white/20 group-hover:text-amber-500 transition-colors">
            {event.type === 'education' ? <GraduationCap size={24} /> : <Briefcase size={24} />}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-playfair text-3xl sm:text-4xl text-white italic leading-[1.1]">
            {event.company}
          </h4>
          <p className="font-montserrat text-amber-500 text-[10px] font-black tracking-[0.3em] uppercase flex items-center gap-3">
            <Zap size={12} className="opacity-50" />
            {event.role}
          </p>
        </div>

        <div className="flex-1 space-y-5 pt-8 border-t border-white/5">
          {event.description.map((desc, i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-amber-500/40 shrink-0" />
              <p className="text-white/50 font-montserrat text-xs sm:text-sm leading-relaxed font-normal">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-4 mt-auto">
          <div className="flex items-center gap-3 text-white/30 text-[10px] font-black tracking-widest uppercase">
            <MapPin size={14} className="text-amber-500/40" />
            {event.location}
          </div>
          <div className="flex items-center gap-3 text-white/30 text-[10px] font-black tracking-widest uppercase justify-end">
            <Calendar size={14} className="text-amber-500/40" />
            {event.period}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Resume: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: containerRef });
  
  return (
    <div id="resume" className="relative min-h-screen bg-black flex flex-col justify-center section-padding overflow-hidden">
      <div className="section-container mb-16 sm:mb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <h2 className="font-montserrat text-amber-500 text-[10px] tracking-[0.8em] font-black uppercase inline-block border-b border-amber-500/30 pb-4">
            Curriculum Vitae
          </h2>
          <h3 className="font-playfair text-fluid-h2 italic text-white leading-tight">
            Journey of <br className="hidden sm:block"/> Professional Growth
          </h3>
        </motion.div>
      </div>

      <div className="relative">
        {/* Progress Bar Container */}
        <div className="section-container mb-16 flex items-center gap-12">
          <span className="font-montserrat text-[10px] font-black tracking-[0.5em] text-amber-500 uppercase shrink-0">PRESENT</span>
          <div className="flex-1 h-px bg-white/10 relative overflow-hidden">
            <motion.div 
              style={{ scaleX: scrollXProgress }} 
              className="absolute inset-0 h-full bg-amber-500 origin-left"
            />
          </div>
          <span className="font-montserrat text-[10px] font-black tracking-[0.5em] text-white/20 uppercase shrink-0">PAST</span>
        </div>

        {/* Timeline Horizontal Engine */}
        <div 
          ref={containerRef}
          className="flex overflow-x-auto pb-16 pt-10 px-[7vw] gap-4 no-scrollbar snap-x snap-mandatory cursor-grab active:cursor-grabbing"
        >
          {timelineData.map((event, i) => (
            <TimelineCard key={`${event.company}-${i}`} event={event} index={i} />
          ))}
          <div className="flex-shrink-0 w-[10vw]" />
        </div>

        <div className="mt-12 flex justify-center lg:hidden">
          <div className="flex items-center gap-6 bg-white/5 px-8 py-3 rounded-full border border-white/10">
             <span className="font-montserrat text-[9px] tracking-[0.5em] text-white/60 uppercase font-black">Explore Timeline</span>
             <ArrowRight size={16} className="text-amber-500 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Resume;
