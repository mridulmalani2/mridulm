
export type ProjectCategory = 'finance' | 'path-ideas' | 'hobby';

export interface Project {
  title: string;        // display name (not the bare domain)
  domain?: string;      // e.g. "experienceindia.me" — shown as a subtle label
  story: string;        // one-line description
  link?: string;        // external URL (omit or "#" if none)
  tags?: string[];
  category: ProjectCategory;
}

export interface ProjectSection {
  id: ProjectCategory;
  eyebrow: string;      // small label above the section title
  title: string;        // section heading (e.g. "Finance")
  intro: string;        // Mridul's short intro to the section
}

export interface Album {
  name: string;
  coverImageUrl: string;
  images: string[];
  footerText: string;
}

export interface ChapterData {
  id: string;
  title: string;
  subtitle: string;
}
