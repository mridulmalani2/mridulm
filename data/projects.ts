import { Project } from '../types';

export const PROJECTS: Project[] = [
  {
    name: "Experience India",
    story: "A cultural hub for international students in Paris to explore Indian culture, movies, music, and events.",
    imageUrl: "/images/projects/experience-india.jpg",
    link: "https://experienceindia.me",
    tags: ["Cultural Platform", "Web Development"],
  },
  {
    name: "HEC Investment Club",
    story: "Leading partnerships and investor relations for one of Europe's premier student-run investment clubs.",
    imageUrl: "/images/projects/hec-investment.jpg",
    tags: ["Finance", "Leadership"],
  },
  {
    name: "Startup Due Diligence",
    story: "Comprehensive financial analysis and due diligence frameworks for early-stage startups in the MSME ecosystem.",
    imageUrl: "/images/projects/due-diligence.jpg",
    tags: ["Venture Capital", "Analysis"],
  },
];

export const ALBUMS = [
  {
    name: "Paris",
    coverImageUrl: "/images/albums/paris-cover.jpg",
    images: ["/images/albums/paris-1.jpg", "/images/albums/paris-2.jpg"],
    footerText: "Exploring the city of lights",
  },
  {
    name: "India",
    coverImageUrl: "/images/albums/india-cover.jpg",
    images: ["/images/albums/india-1.jpg", "/images/albums/india-2.jpg"],
    footerText: "Home and heritage",
  },
];
