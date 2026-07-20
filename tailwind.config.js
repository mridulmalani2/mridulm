/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './finx/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Light pastel-neon system. Accents are for surfaces/borders/glows only —
      // never body text (they cannot reach 4.5:1 on canvas). Text stays ink/muted.
      colors: {
        canvas: '#FDFCFA', // warm near-white page background
        ink: '#1A1A22', // primary text  (~15:1 on canvas)
        muted: '#5B5B6B', // secondary text (~6.5:1 on canvas)
        saffron: '#FFB56B',
        mint: '#7FE6C4',
        lilac: '#B9A7FF',
        sky: '#8EC5FF',
        rose: '#FF9FB6',
        lemon: '#FFE580',
      },
      fontFamily: {
        // sans + mono override Tailwind defaults; the rest add utilities.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Playfair Display', 'serif'],
        playfair: ['Playfair Display', 'serif'],
        montserrat: ['Montserrat', 'sans-serif'],
        lora: ['Lora', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
