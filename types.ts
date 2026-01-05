
export interface Project {
  name: string;
  story: string;
  imageUrl: string;
  highlightImageUrl?: string;
  link?: string;
  tags?: string[];
}

export interface Album {
  name: string;
  coverImageUrl: string;
  images: string[];
  footerText: string;
}

export enum ThemeContext {
  DARK = 'dark',
  LIGHT = 'light',
  WARM = 'warm'
}

export interface ChapterData {
  id: string;
  title: string;
  subtitle: string;
  theme: ThemeContext;
}
