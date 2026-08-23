/**
 * The research section is ARCHIVED (2026-08-23) — the old dark-theme site is off
 * the public build. The previous pass only hid the navbar entry, which left every
 * /research URL resolving by direct link; these tests exist so that gap cannot
 * silently reopen.
 *
 * Archived, NOT deleted: the pages, components, and article data stay on disk and
 * keep compiling, so flipping SHOW_RESEARCH restores the whole section in one edit.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import App from '../App';
import { SHOW_RESEARCH } from '../config/features';

const root = join(__dirname, '..');
const at = (path: string) =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

const ARCHIVED = [
  '/research',
  '/research/reports',
  '/research/reports/some-slug',
  '/research/newsletter',
  '/research/newsletter/some-slug',
  '/research/anything-at-all',
];

describe('research is archived — nothing public resolves', () => {
  it('the flag is off', () => {
    expect(SHOW_RESEARCH).toBe(false);
  });

  it.each(ARCHIVED)('%s falls through to the 404 page', (path) => {
    const html = at(path);
    // The route is not registered at all, so it hits the catch-all.
    expect(html).toContain('Page not found');
    // And none of the research copy leaks onto it.
    expect(html).not.toContain('Research &amp; Analysis');
    expect(html).not.toContain('Institutional-quality thinking');
  });

  it.each(ARCHIVED)('%s renders the 404 on the LIGHT theme, not the old dark one', (path) => {
    // The 404 page is ink-on-canvas. If the archived paths still matched the
    // research theme they would paint bg-black behind it and the heading would
    // be dark grey on black — a broken-looking page, not a clean 404.
    const html = at(path);
    const rootClass = html.match(/^<div class="([^"]*)"/)?.[1] ?? '';
    const navClass = html.match(/<nav class="([^"]*)"/)?.[1] ?? '';
    expect(rootClass).toContain('bg-canvas');
    expect(rootClass).not.toContain('bg-black');
    // The navbar carries its own copy of the research check — it has to be
    // gated too, or the dark chrome is left stranded on the light 404.
    expect(navClass).not.toContain('bg-black');
  });
});

describe('research is archived — the edge turns the URLs away too', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const redirects: Array<{ source: string; destination: string; permanent: boolean }> =
    vercel.redirects;
  const find = (source: string) => redirects.find((r) => r.source === source);
  const indexOf = (source: string) => redirects.findIndex((r) => r.source === source);

  it('/research and every subpath redirect to the homepage', () => {
    expect(find('/research')?.destination).toBe('/');
    expect(find('/research/:path*')?.destination).toBe('/');
  });

  it('those redirects are TEMPORARY — archived means reversible', () => {
    // A permanent redirect would be cached in visitors' browsers and would keep
    // firing long after the section came back. Restoring must not need a cache bust.
    expect(find('/research')?.permanent).toBe(false);
    expect(find('/research/:path*')?.permanent).toBe(false);
  });

  it('/research/toolkit is matched BEFORE the catch-all, and lands on the deal engine', () => {
    // Order is load-bearing: Vercel takes the first matching redirect, so a
    // /research/:path* rule placed first would swallow the toolkit and send the
    // live deal engine to the homepage.
    expect(indexOf('/research/toolkit')).toBeLessThan(indexOf('/research/:path*'));
    expect(find('/research/toolkit')?.destination).toBe('/deal-engine');
  });
});

describe('the deal engine is untouched', () => {
  // DealEngine is React.lazy, so a static render only yields the Suspense
  // fallback — what the engine renders is covered by f-tail-single-engine.
  // What matters here is only that these routes still resolve at all.
  it('/deal-engine does not fall through to the 404', () => {
    expect(at('/deal-engine')).not.toContain('Page not found');
  });

  it('the old toolkit URL is still routed, not swept up with the archive', () => {
    expect(at('/research/toolkit')).not.toContain('Page not found');
  });
});

describe('archived, not deleted', () => {
  it.each([
    ['pages', 'ResearchLanding.tsx'],
    ['pages', 'ResearchIndex.tsx'],
    ['pages', 'ResearchArticle.tsx'],
    ['pages', 'NewsletterIndex.tsx'],
    ['pages', 'NewsletterArticle.tsx'],
  ])('%s/%s is still on disk', (dir, file) => {
    expect(existsSync(join(root, dir, file))).toBe(true);
  });

  it('the article and newsletter data survives', () => {
    expect(existsSync(join(root, 'data', 'research'))).toBe(true);
  });
});
