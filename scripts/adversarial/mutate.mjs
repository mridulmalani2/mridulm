// node mut2.mjs < JSON array of [file, old, new, label]; runs the FULL suite per mutant
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const muts = JSON.parse(readFileSync(0, 'utf8'));
let bad = 0;
for (const [file, a, b, label] of muts) {
  const orig = readFileSync(file, 'utf8');
  const n = orig.split(a).length - 1;
  if (n !== 1) { console.log(`INVALID (${n} matches): ${label}`); bad++; continue; }
  writeFileSync(file, orig.replace(a, b));
  let killed = false, out = '';
  try { execSync('npx vitest run', { stdio: 'pipe' }); } catch (e) { killed = true; out = String(e.stdout).match(/FAIL\s+\S+/g)?.slice(0, 2).join(', ') ?? ''; }
  writeFileSync(file, orig);
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${label}${killed ? '  ← ' + out : ''}`);
  if (!killed) bad++;
}
process.exit(bad ? 1 : 0);
