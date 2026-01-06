
import { ChapterData } from './types';

export const CHAPTERS: ChapterData[] = [
  { id: 'hero', title: 'Welcome', subtitle: 'Mridul Malani' },
  { id: 'projects', title: 'Featured Work', subtitle: 'Projects' },
  { id: 'video-story', title: 'Video Introduction', subtitle: 'Quick Introduction' },
  { id: 'resume', title: 'Curriculum Vitae', subtitle: 'Career Timeline' },
  { id: 'hobbies', title: 'Through My Lens', subtitle: 'Photography' },
  { id: 'contact', title: 'Let\'s Connect', subtitle: 'Contact' },
];

/**
 * INSTRUCTIONS:
 * 1. Create a Google Sheet.
 * 2. Add headers: project_name, oneliner_summary, image_url, source_url, tags
 * 3. File > Share > Publish to web > [Tab Name] > CSV
 * 4. Replace the URLs below.
 */
export const PROJECTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS-4NRxymgQHZkQzSHwuurnG4K4jf2WolE4aRWXRB8U7d66aYz1i_4PYefOozG_nGaL3mXyEhawqAo/pub?gid=0&single=true&output=csv";
export const ALBUMS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS-4NRxymgQHZkQzSHwuurnG4K4jf2WolE4aRWXRB8U7d66aYz1i_4PYefOozG_nGaL3mXyEhawqAo/pub?gid=175842780&single=true&output=csv";
