#!/usr/bin/env node
/**
 * Production live smoke — the deployed-surface checks worth keeping from the Phase E/F
 * gate walkthroughs (2026-07-24). OPT-IN and network-hitting: run it after a deploy,
 * never in CI (`node scripts/smoke-production.mjs [base-url]`).
 *
 * Checks the SERVER surface the browser flow depends on:
 *   1. /api/edgar proxy up (companyfacts + submissions allowlist routes)
 *   2. D5 Finnhub anchor: quote/AAPL returns a real price (FINNHUB_API_KEY live)
 *   3. quote allowlist: malformed ticker → 400 (never proxied)
 *   4. ESEF route up (entities list)
 *   5. the SPA shell serves /deal-engine
 * Exit 0 = all green; non-zero lists the failures.
 */

const BASE = process.argv[2] ?? 'https://www.mridulmalani.com';
const failures = [];
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail) => { failures.push(name); console.error(`  ✗ ${name} — ${detail}`); };

async function check(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e.message); }
}

const get = async (path, init) => fetch(`${BASE}${path}`, { redirect: 'follow', ...init });

console.log(`Production smoke against ${BASE}`);

await check('proxy: submissions (Apple)', async () => {
  const r = await get('/api/edgar?path=submissions/CIK0000320193');
  if (!r.ok) throw new Error(`status ${r.status}`);
  const j = await r.json();
  if (j.name !== 'Apple Inc.') throw new Error(`unexpected name ${j.name}`);
});

await check('D5 anchor: quote/AAPL returns a live price', async () => {
  const r = await get('/api/edgar?path=quote/AAPL');
  if (r.status === 501) throw new Error('quote_unconfigured — FINNHUB_API_KEY missing on Vercel');
  if (!r.ok) throw new Error(`status ${r.status}`);
  const j = await r.json();
  if (!(typeof j.c === 'number' && j.c > 0)) throw new Error(`no price in ${JSON.stringify(j).slice(0, 80)}`);
});

await check('quote allowlist: malformed ticker rejected with 400', async () => {
  const r = await get('/api/edgar?path=quote/BAD!TICKER');
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
});

await check('proxy: unknown endpoint rejected (SSRF allowlist)', async () => {
  const r = await get('/api/edgar?path=evil/https:%2F%2Fexample.com');
  if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
});

await check('ESEF: entities list route up', async () => {
  const r = await get('/api/edgar?path=esef-entities');
  if (!r.ok) throw new Error(`status ${r.status}`);
});

await check('SPA shell serves /deal-engine', async () => {
  const r = await get('/deal-engine');
  if (!r.ok) throw new Error(`status ${r.status}`);
  const html = await r.text();
  if (!/<div id="root">/.test(html)) throw new Error('no SPA root in response');
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s): ${failures.join(' · ')}`);
  process.exit(1);
}
console.log('\nAll production smoke checks green.');
