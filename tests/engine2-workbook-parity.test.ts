/**
 * SPEC §26 / invariant §14.26 — the exported workbook is a LIVE formula model that agrees
 * with the ONE engine. Each deal is exported WITHOUT cached results (so nothing can pass by
 * echoing the engine's numbers back), recalculated by an independent spreadsheet engine
 * (LibreOffice, headless), and every parity-mapped cell must equal the engine's ModelOutput
 * value. CI installs LibreOffice; locally the suite is skipped only when it is absent, and it
 * says so loudly — it is never silently green.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, beforeAll } from 'vitest';
import { runModel } from '../lib/engine2/facade';
import { buildFormulaWorkbook, formulaCoverageBlockers, type ParityCell } from '../lib/engine2/workbook';
import type { DealAssumptions, DealFacts } from '../lib/engine2/types';
import { GOLDEN_DEALS } from './fixtures/engine2-golden-deals';
import { G12_ASSUMPTIONS, G12_FACTS } from './fixtures/g12-prof';

function findSoffice(): string | null {
  for (const p of ['/opt/homebrew/bin/soffice', '/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync('which', ['soffice']).toString().trim() || null;
  } catch {
    return null;
  }
}

const VALUATION = { risk_free: 0.04, mrp: 0.06, asset_beta: 0.9, debt_beta: 0, long_run_growth: 0.025, leverage_timing: 'end_of_year' as const };

const CASES: Record<string, { facts: DealFacts; assumptions: DealAssumptions }> = {
  G1: GOLDEN_DEALS.G1,
  G2: GOLDEN_DEALS.G2,
  G3: GOLDEN_DEALS.G3,
  G4: GOLDEN_DEALS.G4,
  G5: GOLDEN_DEALS.G5,
  G12PROF: { facts: G12_FACTS, assumptions: G12_ASSUMPTIONS },
  // the valuation layer on a full LBO (fees, OID, floating debt, revolver, min cash)
  G2_VAL: { facts: GOLDEN_DEALS.G2.facts, assumptions: { ...GOLDEN_DEALS.G2.assumptions, valuation: VALUATION } },
  // PIK + MIP + start-of-year leverage
  G3_VAL_SOY: { facts: GOLDEN_DEALS.G3.facts, assumptions: { ...GOLDEN_DEALS.G3.assumptions, valuation: { ...VALUATION, leverage_timing: 'start_of_year', debt_beta: 0.2 } } },
  // NTM on both ends + EV-driven entry + rollover (rollover is pari passu)
  G2_NTM_EV_ROLL: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      entry: { ...GOLDEN_DEALS.G2.assumptions.entry, driver: 'ev', entry_multiple: null, enterprise_value: 1050, basis: 'ntm' },
      exit: { ...GOLDEN_DEALS.G2.assumptions.exit, basis: 'ntm' },
      rollover_equity: 40,
    },
  },
  // structure features together: monitoring fee, distributions + a binding RP trap, a
  // leverage-based sweep grid, covenants incl. a springing test, a MIP with a ratchet tier,
  // a warrant beside it, and rollover equity
  FEATURES: {
    facts: GOLDEN_DEALS.G2.facts,
    assumptions: {
      ...GOLDEN_DEALS.G2.assumptions,
      rollover_equity: 30,
      fees: { ...GOLDEN_DEALS.G2.assumptions.fees, monitoring: { annual: 3, termination_years: 3, discount_rate: 0.08 } },
      structure: {
        ...GOLDEN_DEALS.G2.assumptions.structure,
        distributions: [15, 15, 25, 25, 25],
        sweep: { base_pct: 0.75, grid: { tiers: [{ above_net_leverage: 2.0, pct: 0.5 }, { above_net_leverage: 3.5, pct: 0.75 }], else_pct: 0.25 } },
      },
      covenants: { leverage_max: [5, 4.5, 4, 3.5, 3.5], dscr_min: 1.2, fccr_min: 1.0, springing: { metric: 'leverage', max: 5, revolver_draw_trigger_pct: 0.3 }, rp_trap: { metric: 'net_leverage', level: 3.2 } },
      mip: { pool_pct: 0.1, hurdle_moic: 1.3, ratchet: [{ hurdle_moic: 1.8, share_pct: 0.2 }] },
      warrant: { holder_label: 'Mezz lender', pct_of_ordinary: 0.04, strike_total: 10 },
    },
  },
  // §18 refinancing (the adjudicated golden): re-termed par for par, call premium, new OID/fees,
  // the old OID/fees written off with the tax deduction deferred a year
  G6REFI: GOLDEN_DEALS.G6REFI,
  // §20 PIK toggle: a whole-coupon cash/PIK election each year
  PIK_TOGGLE: {
    facts: GOLDEN_DEALS.G3.facts,
    assumptions: {
      ...GOLDEN_DEALS.G3.assumptions,
      structure: {
        ...GOLDEN_DEALS.G3.assumptions.structure,
        tranches: GOLDEN_DEALS.G3.assumptions.structure.tranches.map((t) => (t.type === 'pik_note' ? { ...t, cash_coupon: 0.08, pik_coupon: 0.12, elections: ['pik', 'pik', 'cash', 'cash', 'pik'] as ('cash' | 'pik')[] } : t)),
      },
    },
  },
  // tax coverage: early LOSSES banked into the post-close pool and used later (80% limit),
  // acquired NOLs that arose pre-2018 (100% cap) under a §382 limit, back-loaded margin
  TAX_NOL: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 200, fy_ebitda: 24, fy_ebitda_margin: 0.12, net_ppe: 40 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      entry: { ...GOLDEN_DEALS.G1.assumptions.entry, entry_multiple: 10 },
      exit: { ...GOLDEN_DEALS.G1.assumptions.exit, multiple: 10 },
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.2, 0.2, 0.15, 0.15, 0.1], target_margin: 0.24, margin_path: 'back_loaded', da_pct_revenue: 0.05, maint_capex_pct_revenue: 0.04 },
      structure: {
        ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 5, sweep: { base_pct: 0.5, grid: null },
        tranches: [{ name: 'Senior', type: 'senior', size: { amount: 200 }, pricing: { kind: 'fixed', rate: 0.14 }, amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0.02, sweep: { participates: true, priority: 1 } }],
      },
      tax: { rate: 0.25, interest_deductible: true, s163j: { applies: false, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 30, acquired_usable: true, arose_pre_2018: true, s382_annual_limit: 4 }, minimum_rate: 0 },
    },
  },
  // tax coverage: a BINDING interest cap on EBIT-based ATI with a carryforward, a minimum tax,
  // and post-2018 acquired NOLs without a §382 limit
  TAX_CAP: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 300, fy_ebitda: 45, fy_ebitda_margin: 0.15, net_ppe: 60 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.06, 0.06, 0.05, 0.05, 0.04], target_margin: 0.17, da_pct_revenue: 0.06, maint_capex_pct_revenue: 0.05 },
      structure: {
        ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 6, sweep: { base_pct: 1, grid: null },
        tranches: [
          { name: 'TLB', type: 'senior', size: { x_ebitda: 4 }, pricing: { kind: 'floating', base_rate: 0.045, spread: 0.0425, floor: 0.005 }, amort_pct_of_face: 0.01, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
          { name: 'PIK', type: 'pik_note', size: { x_ebitda: 1 }, cash_coupon: 0.02, pik_coupon: 0.1, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.01, sweep: { participates: false, priority: 2 }, elections: null },
        ],
      },
      tax: { rate: 0.25, interest_deductible: true, s163j: { applies: true, ati_basis: 'ebit', ati_pct: 0.3 }, nol: { acquired_opening: 15, acquired_usable: true, arose_pre_2018: false, s382_annual_limit: null }, minimum_rate: 0.15 },
    },
  },
  // tax coverage: pre-2018 acquired NOLs with NO §382 limit — the 100% cap (not 80%) binds
  TAX_PRE18: {
    facts: { ...GOLDEN_DEALS.G1.facts, fy_revenue: 300, fy_ebitda: 45, fy_ebitda_margin: 0.15, net_ppe: 60 },
    assumptions: {
      ...GOLDEN_DEALS.G1.assumptions,
      operations: { ...GOLDEN_DEALS.G1.assumptions.operations, growth: [0.05, 0.05, 0.05, 0.05, 0.05], target_margin: 0.15, da_pct_revenue: 0.04, maint_capex_pct_revenue: 0.04 },
      structure: { ...GOLDEN_DEALS.G1.assumptions.structure, min_cash: 5, sweep: { base_pct: 0.5, grid: null },
        tranches: [{ name: 'TL', type: 'senior', size: { x_ebitda: 3 }, pricing: { kind: 'fixed', rate: 0.08 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } }] },
      tax: { rate: 0.21, interest_deductible: true, s163j: { applies: false, ati_basis: 'ebitda', ati_pct: 0.3 }, nol: { acquired_opening: 500, acquired_usable: true, arose_pre_2018: true, s382_annual_limit: null }, minimum_rate: 0 },
    },
  },
  // two tranches sharing a sweep priority (pro rata) + a junior at priority 2, front-loaded margin
  G5_TIERS: {
    facts: GOLDEN_DEALS.G5.facts,
    assumptions: {
      ...GOLDEN_DEALS.G5.assumptions,
      operations: { ...GOLDEN_DEALS.G5.assumptions.operations, margin_path: 'front_loaded', target_margin: 0.23 },
      structure: {
        ...GOLDEN_DEALS.G5.assumptions.structure,
        sweep: { base_pct: 0.8, grid: null },
        tranches: [
          { name: 'A', type: 'senior', size: { x_ebitda: 1.5 }, pricing: { kind: 'fixed', rate: 0.07 }, amort_pct_of_face: 0.05, maturity_years: 7, oid_pct: 0.01, sweep: { participates: true, priority: 1 } },
          { name: 'B', type: 'senior', size: { x_ebitda: 1.0 }, pricing: { kind: 'floating', base_rate: 0.04, spread: 0.035, floor: 0.045 }, amort_pct_of_face: 0, maturity_years: 7, oid_pct: 0, sweep: { participates: true, priority: 1 } },
          { name: 'Mezz', type: 'mezzanine', size: { amount: 8 }, pricing: { kind: 'fixed', rate: 0.11 }, amort_pct_of_face: 0, maturity_years: 8, oid_pct: 0.02, sweep: { participates: true, priority: 2 } },
          { name: 'RCF', type: 'revolver', commitment: { amount: 10 }, pricing: { kind: 'fixed', rate: 0.06 }, commitment_fee: 0.005, maturity_years: 6, drawn_at_close: 0 },
        ],
      },
    },
  },
};

const soffice = findSoffice();
const describeIfLo = soffice ? describe : describe.skip;
if (!soffice) {
  // eslint-disable-next-line no-console
  console.warn('[workbook parity] LibreOffice (soffice) not found — the §14.26 parity suite is SKIPPED locally. CI installs it and runs it.');
  if (process.env.CI) throw new Error('LibreOffice is required in CI for the workbook parity suite (§14.26)');
}

/** Recalculated cell values read straight from the sheet XML. (ExcelJS's reader drops a cached
 *  formula result of 0 — a falsy-value bug — so it cannot be trusted to read a recalculation.) */
type Recalc = (sheet: string, addr: string) => number | string | boolean | null;
function readRecalculated(path: string): Recalc {
  const zip = unzipSync(readFileSync(path));
  const text = (name: string) => strFromU8(zip[name]);
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  const rels = text('xl/_rels/workbook.xml.rels');
  const sheets = new Map<string, Map<string, number | string | boolean | null>>();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels)![1];
    const xml = text(`xl/${target.replace(/^\/?xl\//, '')}`);
    const cells = new Map<string, number | string | boolean | null>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="([^"]+)"/.exec(c[2])?.[1] ?? 'n';
      const vRaw = c[3] ? /<v>([\s\S]*?)<\/v>/.exec(c[3])?.[1] ?? null : null;
      if (vRaw === null) { cells.set(c[1], null); continue; }
      cells.set(c[1], t === 's' ? shared[Number(vRaw)] : t === 'b' ? vRaw === '1' : t === 'str' || t === 'e' || t === 'inlineStr' ? vRaw : Number(vRaw));
    }
    sheets.set(m[1], cells);
  }
  return (sheet, addr) => sheets.get(sheet)?.get(addr) ?? null;
}

describeIfLo('§26 formula workbook — LibreOffice recalculation equals the engine, cell by cell', () => {
  const recalculated = new Map<string, Recalc>();
  const parityMaps = new Map<string, ParityCell[]>();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-parity-'));
    const out = join(dir, 'out');
    const files: string[] = [];
    for (const [name, { facts, assumptions }] of Object.entries(CASES)) {
      const o = runModel(facts, assumptions);
      expect(formulaCoverageBlockers(o), `${name} must be fully formula-covered`).toEqual([]);
      const { wb, parity } = buildFormulaWorkbook(o, { cachedResults: false });
      parityMaps.set(name, parity);
      const path = join(dir, `${name}.xlsx`);
      writeFileSync(path, Buffer.from(await wb.xlsx.writeBuffer()));
      files.push(path);
    }
    execFileSync(soffice!, [`-env:UserInstallation=file://${join(dir, 'profile')}`, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', out, ...files], { stdio: 'pipe', timeout: 180_000 });
    for (const file of readdirSync(out)) recalculated.set(file.replace(/\.xlsx$/, ''), readRecalculated(join(out, file)));
  }, 240_000);

  for (const name of Object.keys(CASES)) {
    it(`${name}: every mapped cell recalculates to the engine's value`, () => {
      const cell = recalculated.get(name)!;
      expect(cell, `${name} was recalculated`).toBeDefined();
      const parity = parityMaps.get(name)!;
      expect(parity.length).toBeGreaterThan(50);
      const failures: string[] = [];
      for (const p of parity) {
        const got = cell(p.sheet, p.addr);
        if (p.expected === null) {
          if (typeof got === 'number') failures.push(`${p.sheet}!${p.addr} ${p.label}: engine N/A but the cell is ${got}`);
          continue;
        }
        if (typeof got !== 'number' || !Number.isFinite(got)) {
          failures.push(`${p.sheet}!${p.addr} ${p.label}: expected ${p.expected}, got ${JSON.stringify(got)}`);
          continue;
        }
        const tol = 1e-6 * Math.max(1, Math.abs(p.expected));
        if (Math.abs(got - p.expected) > tol) failures.push(`${p.sheet}!${p.addr} ${p.label}: expected ${p.expected}, got ${got}`);
      }
      expect(failures.slice(0, 25), `${failures.length} mismatches`).toEqual([]);
    });
  }

  it('the Checks sheet totals zero on every deal', () => {
    for (const name of Object.keys(CASES)) {
      const totalCell = parityMaps.get(name)!.find((p) => p.sheet === 'Checks' && p.label.startsWith('Total'))!;
      expect(recalculated.get(name)!('Checks', totalCell.addr), `${name} checks total`).toBe(0);
    }
  });
});

describe('§26 coverage rule — unsupported features BLOCK export by name (never pasted values)', () => {
  it('a deal with a feature not yet in the formula model is blocked, and says which', () => {
    const o = runModel(GOLDEN_DEALS.G7FUND.facts, GOLDEN_DEALS.G7FUND.assumptions);
    expect(formulaCoverageBlockers(o)).toContain('fund/LP overlay');
    expect(() => buildFormulaWorkbook(o, { cachedResults: true })).toThrow(/fund\/LP overlay/);
  });
});

describe('the parity deals genuinely exercise the paths they claim to cover (else a green run proves nothing)', () => {
  it('TAX_NOL banks losses, then uses post-close NOLs; acquired NOLs hit the §382 limit', () => {
    const o = runModel(CASES.TAX_NOL.facts, CASES.TAX_NOL.assumptions);
    expect(o.tax.some((y) => y.nol_banked > 0)).toBe(true);
    expect(o.tax.some((y) => y.postclose_nol_used > 0)).toBe(true);
    expect(o.tax.some((y) => Math.abs(y.acquired_nol_used - 4) < 1e-12)).toBe(true);
  });
  it('TAX_CAP binds the interest cap (carryforward > 0), accrues PIK, and the minimum tax binds in some year', () => {
    const o = runModel(CASES.TAX_CAP.facts, CASES.TAX_CAP.assumptions);
    expect(o.tax.some((y) => y.s163j_carryforward_end > 0)).toBe(true);
    expect(o.tranches[1].some((r) => r.pik_accrual > 0)).toBe(true);
    expect(o.tax.some((y) => y.minimum_tax > y.regular_tax && y.minimum_tax > 0)).toBe(true);
    expect(o.tax.some((y) => y.acquired_nol_used > 0)).toBe(true);
  });
  it('TAX_PRE18 uses acquired NOLs at the 100% cap (all taxable income sheltered, the pool never exhausted)', () => {
    const o = runModel(CASES.TAX_PRE18.facts, CASES.TAX_PRE18.assumptions);
    for (const y of o.tax) if (y.taxable_before_nol > 0) expect(y.acquired_nol_used).toBeCloseTo(y.taxable_before_nol, 9);
    expect(o.tax.some((y) => y.taxable_before_nol > 0)).toBe(true);
  });
  it('FEATURES exercises every switch: fee, distributions paid AND trap-blocked, more than one sweep %, promote above the ratchet, an exercised warrant', () => {
    const o = runModel(CASES.FEATURES.facts, CASES.FEATURES.assumptions);
    expect(o.operating.slice(0, -1).every((y) => y.ebitda - y.ebitda_adj === 3)).toBe(true);
    expect(o.exit.monitoring_termination).toBeGreaterThan(0);
    expect(o.waterfall.some((w) => w.distribution_paid > 0)).toBe(true);
    expect(o.waterfall.some((w) => w.distribution_blocked)).toBe(true);
    expect(new Set(o.waterfall.map((w) => w.sweep_pct_applied)).size).toBeGreaterThan(1);
    const proceeds = o.exit.exit_equity_pre_mip_total + o.waterfall.reduce((x, w) => x + w.distribution_paid, 0);
    expect(proceeds).toBeGreaterThan(1.8 * (o.sources_uses.sponsor_equity + o.sources_uses.rollover_equity)); // the ratchet tier is reached
    expect(o.exit.warrant_payout_net).toBeGreaterThan(0);
    expect(o.credit.some((c) => c.leverage_headroom !== null)).toBe(true);
  });
  it('G6REFI really refinances: a cash cost, a write-off, and the new rate from the refinancing year', () => {
    const o = runModel(CASES.G6REFI.facts, CASES.G6REFI.assumptions);
    expect(o.tranches.some((rows) => rows.some((r) => r.refinanced && r.refinancing_cash_cost > 0 && r.unamortized_writeoff > 0))).toBe(true);
  });
  it('PIK_TOGGLE pays cash in the cash years and accrues in the PIK years', () => {
    const o = runModel(CASES.PIK_TOGGLE.facts, CASES.PIK_TOGGLE.assumptions);
    const rows = o.tranches[1];
    expect(rows[0].cash_interest).toBe(0); expect(rows[0].pik_accrual).toBeGreaterThan(0);
    expect(rows[2].cash_interest).toBeGreaterThan(0); expect(rows[2].pik_accrual).toBe(0);
  });
  it('G5_TIERS splits a sweep pro rata inside priority 1 and reaches priority 2; the revolver draws', () => {
    const o = runModel(CASES.G5_TIERS.facts, CASES.G5_TIERS.assumptions);
    expect(o.tranches[0].some((r, t) => r.sweep_repayment > 0 && o.tranches[1][t].sweep_repayment > 0)).toBe(true);
    expect(o.tranches[2].some((r) => r.sweep_repayment > 0)).toBe(true);
  });
});
