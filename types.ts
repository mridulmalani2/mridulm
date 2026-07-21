
export type ProjectCategory = 'finance' | 'path-ideas' | 'hobby';

export interface Project {
  title: string;        // display name (not the bare domain)
  domain?: string;      // e.g. "experienceindia.me" — shown as a subtle label
  story: string;        // one-line description
  link?: string;        // external URL (omit or "#" if none)
  tags?: string[];
  category: ProjectCategory;
  /** Full project board in public/projects. Omit to fall back to a text card. */
  image?: string;
}

export interface ProjectSection {
  id: ProjectCategory;
  index: string;        // '01' — sits top-left of the card
  title: string;        // card heading (e.g. "Finance")
  blurb: string;        // two or three short lines under the rule
  tagline: string;      // letterspaced caps along the card foot
  accent: string;       // the card's single colour
  tint: string;         // very faint background wash
  intro: string;        // longer intro, shown in the panel once opened
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
