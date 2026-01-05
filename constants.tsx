
import { ChapterData, ThemeContext } from './types';

export const CHAPTERS: ChapterData[] = [
  { id: 'hero', title: 'Chapter I', subtitle: 'Mridul Malani', theme: ThemeContext.DARK },
  { id: 'projects', title: 'Chapter II', subtitle: 'Websites and Projects', theme: ThemeContext.DARK },
  { id: 'video-story', title: 'Chapter III', subtitle: 'My 3-Min AI HireVue', theme: ThemeContext.DARK },
  { id: 'resume', title: 'Chapter IV', subtitle: 'Curriculum Vitae', theme: ThemeContext.LIGHT },
  { id: 'hobbies', title: 'Chapter V', subtitle: 'Through My Lens', theme: ThemeContext.WARM },
  { id: 'contact', title: 'Chapter VI', subtitle: 'Contact Me', theme: ThemeContext.DARK },
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
