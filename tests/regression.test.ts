/**
 * P5-4 — regression baseline.
 *
 * Snapshots the key outputs of a spread of canonical deals to a committed baseline
 * (tests/regression/baseline.json). Any change that moves these numbers fails here,
 * forcing an explicit acknowledgement: re-generate the baseline (delete the file and
 * re-run) in the SAME PR that intends the change, so output drift is never silent.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullRecalc } from '../lib/engine/index';
import { canonicalDeals, debtFundedAddOn } from './fixtures/canonicalDeals';
import type { ModelState } from '../lib/dealEngineTypes';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(dir, 'regression', 'baseline.json');

const round = (x: number | null, p = 4): number | null =>
  x == null ? null : Math.round(x * 10 ** p) / 10 ** p;
const roundArr = (a: number[] | undefined, p = 3): number[] => (a ?? []).map((v) => round(v, p) as number);

function snapshot(s: ModelState) {
  return {
    irr: round(s.returns.irr),
    moic: round(s.returns.moic),
    entry_equity: round(s.returns.entry_equity, 3),
    exit_equity: round(s.returns.exit_equity, 3),
    exit_net_debt: round(s.returns.exit_net_debt, 3),
    net_debt_by_year: roundArr(s.debt_schedule.net_debt_by_year),
    dscr_by_year: roundArr(s.debt_schedule.dscr_by_year),
    leverage_by_year: roundArr(s.debt_schedule.leverage_ratio_by_year),
    bs_closes: s.balance_sheet.closes,
  };
}

const deals: { name: string; build: () => ModelState }[] = [
  ...canonicalDeals.map((d) => ({ name: d.name, build: d.build })),
  {
    name: 'addon',
    build: () => {
      const x = canonicalDeals.find((d) => d.name === 'cash-sweep')!.build();
      x.add_on_acquisitions = [debtFundedAddOn()];
      return x;
    },
  },
];

const current: Record<string, ReturnType<typeof snapshot>> = {};
for (const d of deals) current[d.name] = snapshot(fullRecalc(d.build()));

if (!fs.existsSync(BASELINE)) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
}
const baseline: Record<string, ReturnType<typeof snapshot>> = JSON.parse(fs.readFileSync(BASELINE, 'utf-8'));

describe('P5-4 regression baseline (canonical deals)', () => {
  for (const d of deals) {
    it(`${d.name} matches the committed baseline`, () => {
      const c = current[d.name];
      const b = baseline[d.name];
      expect(b, `no baseline for ${d.name} — regenerate baseline.json`).toBeDefined();

      for (const k of ['irr', 'moic', 'entry_equity', 'exit_equity', 'exit_net_debt'] as const) {
        if (b[k] == null || c[k] == null) {
          expect(c[k]).toBe(b[k]);
        } else {
          expect(Math.abs((c[k] as number) - (b[k] as number)), `${d.name}.${k}`).toBeLessThan(1e-3);
        }
      }
      for (const k of ['net_debt_by_year', 'dscr_by_year', 'leverage_by_year'] as const) {
        expect(c[k].length, `${d.name}.${k} length`).toBe(b[k].length);
        for (let i = 0; i < c[k].length; i++) {
          expect(Math.abs(c[k][i] - b[k][i]), `${d.name}.${k}[${i}]`).toBeLessThan(1e-2);
        }
      }
      expect(c.bs_closes, `${d.name}.bs_closes`).toBe(b.bs_closes);
    });
  }
});
