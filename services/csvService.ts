
import { Project, Album } from '../types';
import { PROJECTS_CSV_URL, ALBUMS_CSV_URL } from '../constants';

/**
 * Robust CSV parser that handles:
 * 1. Commas within quotes: "Field, with comma"
 * 2. Empty fields: ,,
 * 3. Line breaks and whitespace
 */
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => {
    const result = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    result.push(currentCell.trim());
    // Remove wrapping quotes from fields
    return result.map(val => val.replace(/^"|"$/g, ''));
  });
}

/**
 * Helper to check if a URL is likely a placeholder or invalid
 */
const isPlaceholderUrl = (url: string) => url.includes('V-7W_N-vS-5p5N') || !url.startsWith('http');

export async function fetchProjects(): Promise<Project[]> {
  if (isPlaceholderUrl(PROJECTS_CSV_URL)) {
    return getMockProjects();
  }

  try {
    const response = await fetch(PROJECTS_CSV_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvText = await response.text();
    const data = parseCSV(csvText);
    
    return data.slice(1).map(row => {
      const tagsStr = row[4] || "";
      const tags = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(t => t) : [];
      
      return {
        name: row[0] || "",
        story: row[1] || "",
        imageUrl: row[2] || "",
        link: row[3] || undefined,
        tags: tags,
        highlightImageUrl: row[5] || undefined,
      };
    }).filter(p => p.name);
  } catch (error) {
    console.warn("Project fetch failed, falling back to mock data:", error);
    return getMockProjects();
  }
}

export async function fetchAlbums(): Promise<Album[]> {
  if (isPlaceholderUrl(ALBUMS_CSV_URL)) {
    return getMockAlbums();
  }

  try {
    const response = await fetch(ALBUMS_CSV_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvText = await response.text();
    const data = parseCSV(csvText);
    
    /**
     * Parse logic:
     * No header row (A1 is Album 1).
     * row[0] = name
     * Intermediate = images (filter for http)
     * Last non-empty = footer text
     */
    return data.map(row => {
      const name = row[0] || "";
      // Filter out only the non-empty values after the name
      const values = row.slice(1).filter(v => v.trim() !== "");
      
      if (values.length < 2) return null; // Need at least one image and one footer

      const footerText = values[values.length - 1];
      const images = values.slice(0, values.length - 1).filter(img => img.startsWith('http'));
      
      return {
        name,
        coverImageUrl: images[0] || "",
        images,
        footerText
      };
    }).filter((a): a is Album => a !== null && a.name !== "" && a.images.length > 0);
  } catch (error) {
    console.warn("Album fetch failed, falling back to mock data:", error);
    return getMockAlbums();
  }
}

function getMockProjects(): Project[] {
  return [
    {
      name: "Experience India",
      story: "A cultural hub for International Students in Paris to explore Indian Movies, Happenings, Music, Events and more!",
      imageUrl: "https://images.unsplash.com/photo-1524492707947-5538d6d6342b?auto=format&fit=crop&q=80&w=1200",
      link: "https://experienceindia.me",
      tags: ["Passion Project", "#India", "Step 0"],
      highlightImageUrl: "https://images.unsplash.com/photo-1524492707947-5538d6d6342b?auto=format&fit=crop&q=80&w=1600"
    },
    {
      name: "TourWiseCo",
      story: "Explore authentic travel like never before, meet with students that are both native to your home culture and locals of the city you're visiting",
      imageUrl: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=1200",
      link: "https://tourwiseco.com",
      tags: ["Venture No. 2", "Earn with Me", "Explore and Build"],
      highlightImageUrl: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=1600"
    },
    {
      name: "Family Card Game",
      story: "A digital reimagining of a classic family card game with interactive mechanics and competitive soul.",
      imageUrl: "https://images.unsplash.com/photo-1543158266-0066955047b1?auto=format&fit=crop&q=80&w=1200",
      link: "#",
      tags: ["Gaming", "React", "Fun"],
      highlightImageUrl: "https://images.unsplash.com/photo-1543158266-0066955047b1?auto=format&fit=crop&q=80&w=1600"
    }
  ];
}

function getMockAlbums(): Album[] {
  return [
    {
      name: "Paris Captures",
      coverImageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=800",
      images: [
        "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&q=80&w=800"
      ],
      footerText: "Memories from the streets of Paris during my first semester."
    },
    {
      name: "The Startup Grind",
      coverImageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=800",
      images: [
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=800"
      ],
      footerText: "Behind the scenes of building something new."
    }
  ];
}
