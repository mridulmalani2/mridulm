
import { ChapterData } from './types';

export const CHAPTERS: ChapterData[] = [
  { id: 'hero', title: 'Welcome', subtitle: 'Me' },
  { id: 'projects', title: 'Featured Work', subtitle: 'Projects' },
  { id: 'video-story', title: 'Video Introduction', subtitle: 'My 3-Min AI HireVue' },
  { id: 'resume', title: 'Curriculum Vitae', subtitle: 'Career Timeline' },
  { id: 'hobbies', title: 'Through My Lens', subtitle: 'Favorites and More' },
  { id: 'contact', title: 'Let\'s Connect', subtitle: 'Contact' },
];

/**
 * Photo-gallery albums are still published from a Google Sheet (see Hobbies).
 * Projects now live in the repo at data/projects.ts.
 *
 * To update albums: File > Share > Publish to web > [Tab Name] > CSV, then
 * replace the URL below.
 */
export const ALBUMS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS-4NRxymgQHZkQzSHwuurnG4K4jf2WolE4aRWXRB8U7d66aYz1i_4PYefOozG_nGaL3mXyEhawqAo/pub?gid=175842780&single=true&output=csv";
