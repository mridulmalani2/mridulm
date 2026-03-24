// SSG Build Script
// Renders each route to static HTML at build time.
// Run after `vite build` and `vite build --ssr` to generate per-route HTML files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SSG_ROUTES, type RouteMeta } from './routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

async function prerender() {
  // Load the HTML template produced by the client build
  const template = fs.readFileSync(path.resolve(distDir, 'index.html'), 'utf-8');

  // Load the server bundle produced by `vite build --ssr`
  const { render } = await import(path.resolve(distDir, 'server/entry-server.js'));

  console.log(`\nPrerendering ${SSG_ROUTES.length} routes...\n`);

  for (const route of SSG_ROUTES) {
    const routePath = route.path;

    // Render the app HTML for this route
    const appHtml = render(routePath);

    // Generate head tags for this route
    const headTags = generateHeadTags(route);

    // Inject rendered HTML and head tags into the template
    const html = template
      .replace('<!--ssr-outlet-->', appHtml)
      .replace('<!--head-tags-->', headTags);

    // Determine output file path
    const filePath = routePath === '/'
      ? path.resolve(distDir, 'index.html')
      : path.resolve(distDir, routePath.slice(1), 'index.html');

    // Ensure output directory exists
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, html);
    console.log(`  ✓ ${routePath} → ${path.relative(distDir, filePath)}`);
  }

  console.log(`\nPrerendering complete. ${SSG_ROUTES.length} pages generated.\n`);
}

function generateHeadTags(route: RouteMeta): string {
  const lines: string[] = [];

  // Per-route title (replaces the static one in the template)
  lines.push(`<title>${escapeHtml(route.title)}</title>`);
  lines.push(`<meta name="title" content="${escapeAttr(route.title)}">`);
  lines.push(`<meta name="description" content="${escapeAttr(route.description)}">`);

  // Canonical
  lines.push(`<link rel="canonical" href="${escapeAttr(route.canonicalUrl)}">`);

  // Open Graph
  lines.push(`<meta property="og:type" content="${escapeAttr(route.ogType)}">`);
  lines.push(`<meta property="og:url" content="${escapeAttr(route.canonicalUrl)}">`);
  lines.push(`<meta property="og:title" content="${escapeAttr(route.title)}">`);
  lines.push(`<meta property="og:description" content="${escapeAttr(route.description)}">`);
  lines.push(`<meta property="og:image" content="${escapeAttr(route.ogImage)}">`);
  lines.push(`<meta property="og:image:width" content="1200">`);
  lines.push(`<meta property="og:image:height" content="630">`);

  // Twitter
  lines.push(`<meta name="twitter:card" content="summary_large_image">`);
  lines.push(`<meta name="twitter:url" content="${escapeAttr(route.canonicalUrl)}">`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(route.title)}">`);
  lines.push(`<meta name="twitter:description" content="${escapeAttr(route.description)}">`);
  lines.push(`<meta name="twitter:image" content="${escapeAttr(route.ogImage)}">`);

  // Structured data (JSON-LD)
  if (route.structuredData) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(route.structuredData)}</script>`);
  }

  return lines.join('\n    ');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

prerender().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
