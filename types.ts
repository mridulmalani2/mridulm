
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

export interface ChapterData {
  id: string;
  title: string;
  subtitle: string;
}
